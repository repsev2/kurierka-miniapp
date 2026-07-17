import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { isValid } from '@tma.js/init-data-node';
import { z } from 'zod';
import { DELIVERY_PRICES, PRODUCTS, PRODUCT_IDS } from './catalog.js';
import { createYookassaPayment, isYookassaConfigured, type YookassaNotification } from './yookassa.js';
import { handleTelegramUpdate, sendTelegramMessage as sendBotMessage, setupTelegramWebhook, type TelegramUpdate } from './telegram.js';

const app = express();
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-Telegram-Init-Data']
}));
app.use(express.json({ limit: '1mb' }));

function cleanEnv(value: string | undefined) {
  return (value || '').trim().replace(/^['"]|['"]$/g, '').replace(/\s+/g, '');
}

const BOT_TOKEN = cleanEnv(process.env.BOT_TOKEN);
const ADMIN_CHAT_ID = cleanEnv(process.env.ADMIN_CHAT_ID);
const PORT = Number(process.env.PORT || 3001);
const ALLOW_DEV_INIT_DATA = process.env.ALLOW_DEV_INIT_DATA === 'true';

const OrderSchema = z.object({
  items: z.array(z.object({
    productId: z.enum(PRODUCT_IDS),
    quantity: z.number().int().min(1).max(99)
  })).min(1).max(50),
  apartmentNumber: z.string().max(20).optional().default(''),
  noApartmentNumber: z.boolean().optional().default(false),
  name: z.string().min(2).max(80),
  phone: z.string().min(7).max(30),
  city: z.string().min(2).max(80),
  address: z.string().min(5).max(250),
  deliveryType: z.enum(['moscow-courier', 'pickup-point']),
  comment: z.string().max(500).optional().default(''),
  isGift: z.boolean().optional().default(false),
  giftMessage: z.string().max(500).optional().default(''),
  agreePrivacy: z.literal(true),
  agreeOffer: z.literal(true),
  paymentMethod: z.enum(['request', 'yookassa'])
});

type Order = z.infer<typeof OrderSchema>;

const pendingOrders = new Map<string, Order>();

function validateTelegramInitData(initData: string): boolean {
  if (!BOT_TOKEN || !initData) return false;
  try {
    return isValid(initData, BOT_TOKEN, { expiresIn: 0 });
  } catch {
    return false;
  }
}

function getInitDataError(initData: string, valid: boolean) {
  if (!BOT_TOKEN) return 'BOT_TOKEN не настроен на сервере';
  if (!initData) {
    return 'Откройте приложение через бота в Telegram (не в браузере) и попробуйте снова';
  }
  if (!valid) {
    return 'Не удалось проверить данные Telegram. Закройте мини‑приложение, откройте бота заново и нажмите «Заказать Курьерку»';
  }
  return 'Invalid Telegram initData';
}

function getTelegramUser(initData: string) {
  try {
    const params = new URLSearchParams(initData);
    const rawUser = params.get('user');
    return rawUser ? JSON.parse(rawUser) : null;
  } catch {
    return null;
  }
}

function extractInitData(req: express.Request) {
  const body = req.body ?? {};
  const fromBody = typeof body.initData === 'string' ? body.initData.trim() : '';
  const headerRaw = req.headers['x-telegram-init-data'];
  const fromHeader = typeof headerRaw === 'string' ? headerRaw.trim() : '';
  if (fromBody) return { initData: fromBody, source: 'body' as const };
  if (fromHeader) return { initData: fromHeader, source: 'header' as const };
  return { initData: '', source: 'none' as const };
}

function orderHasBox(order: Order) {
  return order.items.some((item) => PRODUCTS[item.productId].kind === 'box');
}

function getProductsTotal(order: Order) {
  return order.items.reduce((sum, item) => sum + PRODUCTS[item.productId].price * item.quantity, 0);
}

function getDeliveryPrice(order: Order) {
  return DELIVERY_PRICES[order.deliveryType];
}

function getOrderTotal(order: Order) {
  return getProductsTotal(order) + getDeliveryPrice(order);
}

function formatOrderMessage(order: Order, orderId: string, user: any, extra = '') {
  const productsTotal = getProductsTotal(order);
  const deliveryPrice = getDeliveryPrice(order);
  const total = getOrderTotal(order);
  const paymentLabel = order.paymentMethod === 'yookassa' ? 'Оплата картой (ЮKassa)' : 'Заявка без онлайн-оплаты';
  const deliveryLabel = order.deliveryType === 'moscow-courier'
    ? 'Москва — курьером'
    : 'ПВЗ Яндекс.Маркета';
  const itemLines = order.items.map((item) => {
    const product = PRODUCTS[item.productId];
    const lineTotal = product.price * item.quantity;
    return `• ${product.title} × ${item.quantity} — ${lineTotal.toLocaleString('ru-RU')} ₽`;
  });

  const userLine = user
    ? `Telegram: @${user.username || 'без username'} / ID ${user.id}`
    : 'Telegram: dev/test mode';

  const apartmentLine = orderHasBox(order)
    ? `Номер квартиры для наклейки: ${order.noApartmentNumber ? 'не нужен' : order.apartmentNumber || 'не указан'}`
    : '';

  return [
    `🧡 Новый заказ Курьерки #${orderId}`,
    extra,
    '',
    'Состав:',
    ...itemLines,
    '',
    apartmentLine,
    `Имя: ${order.name}`,
    `Телефон: ${order.phone}`,
    `Город: ${order.city}`,
    `Доставка: ${deliveryLabel}`,
    `Адрес: ${order.address}`,
    `Оплата: ${paymentLabel}`,
    `Товары: ${productsTotal.toLocaleString('ru-RU')} ₽`,
    `Доставка: ${deliveryPrice.toLocaleString('ru-RU')} ₽`,
    `Итого: ${total.toLocaleString('ru-RU')} ₽`,
    order.isGift ? `Подарок: да` : '',
    order.isGift && order.giftMessage ? `Открытка: ${order.giftMessage}` : '',
    order.comment ? `Комментарий: ${order.comment}` : '',
    '',
    userLine
  ].filter(Boolean).join('\n');
}

async function sendAdminTelegramMessage(text: string) {
  if (!ADMIN_CHAT_ID) throw new Error('ADMIN_CHAT_ID не настроен на сервере');
  await sendBotMessage(ADMIN_CHAT_ID, text);
}

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    botConfigured: Boolean(BOT_TOKEN),
    adminConfigured: Boolean(ADMIN_CHAT_ID),
    yookassaConfigured: isYookassaConfigured()
  });
});

app.post('/api/telegram/webhook', async (req, res) => {
  try {
    await handleTelegramUpdate(req.body as TelegramUpdate);
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false });
  }
});

app.post('/api/payments/webhook', async (req, res) => {
  try {
    const notification = req.body as YookassaNotification;
    if (notification.event === 'payment.succeeded' && notification.object?.status === 'succeeded') {
      const orderId = notification.object.metadata?.orderId;
      const order = orderId ? pendingOrders.get(orderId) : undefined;
      const text = order
        ? formatOrderMessage(order, orderId!, null, '✅ Оплата получена')
        : `✅ Оплата получена по заказу #${orderId || 'неизвестно'}`;
      await sendAdminTelegramMessage(text);
      if (orderId) pendingOrders.delete(orderId);
    }
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false });
  }
});

app.post('/api/orders', async (req, res) => {
  try {
    const body = req.body ?? {};
    const { initData, source } = extractInitData(req);
    const { initData: _ignored, ...orderData } = body;
    const initDataValid = validateTelegramInitData(initData);

    if (!initDataValid && !ALLOW_DEV_INIT_DATA) {
      console.warn('initData rejected', {
        source,
        hasInitData: Boolean(initData),
        initDataLength: initData.length,
        hasHash: initData.includes('hash='),
        botTokenLength: BOT_TOKEN.length
      });
      return res.status(401).json({
        ok: false,
        error: getInitDataError(initData, initDataValid),
        debug: {
          source,
          hasInitData: Boolean(initData),
          initDataLength: initData.length
        }
      });
    }

    const order = OrderSchema.parse(orderData);

    if (orderHasBox(order) && !order.noApartmentNumber && !order.apartmentNumber.trim()) {
      return res.status(400).json({ ok: false, error: 'Укажите номер квартиры для наклейки или отметьте, что номер не нужен' });
    }
    if (order.isGift && order.giftMessage.trim().length < 2) {
      return res.status(400).json({ ok: false, error: 'Напишите пожелание для открытки' });
    }
    if (!order.items.some((item) => PRODUCTS[item.productId].kind === 'box')) {
      return res.status(400).json({ ok: false, error: 'В заказе должна быть Курьерка' });
    }

    const orderId = String(Date.now()).slice(-6);
    const user = initDataValid ? getTelegramUser(initData) : null;
    const total = getOrderTotal(order);

    if (order.paymentMethod === 'yookassa') {
      if (total <= 0) {
        return res.status(400).json({ ok: false, error: 'Онлайн-оплата недоступна для этого заказа' });
      }
      if (!isYookassaConfigured()) {
        return res.status(500).json({ ok: false, error: 'ЮKassa ещё не настроена. Напишите нам в Telegram.' });
      }

      pendingOrders.set(orderId, order);
      const payment = await createYookassaPayment({
        orderId,
        amountRub: total,
        description: `Заказ Курьерки #${orderId}`
      });

      if (!payment.paymentUrl) {
        return res.status(502).json({ ok: false, error: 'ЮKassa не вернула ссылку на оплату' });
      }

      await sendAdminTelegramMessage(formatOrderMessage(order, orderId, user, '⏳ Ожидает оплаты'));
      return res.json({ ok: true, orderId, paymentUrl: payment.paymentUrl, paymentId: payment.paymentId });
    }

    await sendAdminTelegramMessage(formatOrderMessage(order, orderId, user));
    console.log({ orderId, order, user });
    res.json({ ok: true, orderId });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : 'Order validation or processing failed';
    const status = message.includes('Telegram sendMessage failed') || message.includes('ЮKassa') ? 502
      : message.includes('не настроен') ? 500
      : 400;
    res.status(status).json({ ok: false, error: message });
  }
});

const PUBLIC_URL = (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || '').trim();

app.listen(PORT, () => {
  console.log(`Kurierka backend is running on http://localhost:${PORT}`);
  if (PUBLIC_URL) {
    setupTelegramWebhook(PUBLIC_URL).catch((error) => {
      console.error('Не удалось настроить Telegram webhook:', error);
    });
  }
});
