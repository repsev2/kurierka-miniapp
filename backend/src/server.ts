import 'dotenv/config';
import crypto from 'node:crypto';
import cors from 'cors';
import express from 'express';
import { z } from 'zod';

const app = express();
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-Telegram-Init-Data']
}));
app.use(express.json({ limit: '1mb' }));

const BOT_TOKEN = (process.env.BOT_TOKEN || '').trim();
const ADMIN_CHAT_ID = (process.env.ADMIN_CHAT_ID || '').trim();
const PORT = Number(process.env.PORT || 3001);
const ALLOW_DEV_INIT_DATA = process.env.ALLOW_DEV_INIT_DATA === 'true';

const OrderSchema = z.object({
  product: z.enum(['transparent', 'with-number', 'b2b']),
  quantity: z.number().int().min(1).max(1000),
  apartmentNumber: z.string().max(20).optional().default(''),
  noApartmentNumber: z.boolean().optional().default(false),
  name: z.string().min(2).max(80),
  phone: z.string().min(7).max(30),
  city: z.string().min(2).max(80),
  address: z.string().min(5).max(250),
  deliveryType: z.enum(['moscow-courier', 'pickup-point', 'b2b-contact']),
  comment: z.string().max(500).optional().default(''),
  paymentMethod: z.enum(['request', 'online-placeholder'])
});

type Order = z.infer<typeof OrderSchema>;

function validateTelegramInitData(initData: string): boolean {
  if (!BOT_TOKEN) return false;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return false;
  params.delete('hash');
  params.delete('signature');

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (calculatedHash.length !== hash.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(calculatedHash), Buffer.from(hash));
  } catch {
    return false;
  }
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

function formatOrderMessage(order: Order, orderId: string, user: any) {
  const productLabel = {
    transparent: 'Прозрачная Курьерка',
    'with-number': 'Курьерка с номером квартиры',
    b2b: 'Опт / заказ для ЖК'
  }[order.product];

  const userLine = user
    ? `Telegram: @${user.username || 'без username'} / ID ${user.id}`
    : 'Telegram: dev/test mode';

  return [
    `🧡 Новый заказ Курьерки #${orderId}`,
    '',
    `Товар: ${productLabel}`,
    `Количество: ${order.quantity}`,
    `Номер квартиры: ${order.noApartmentNumber ? 'не нужен' : order.apartmentNumber || 'не указан'}`,
    '',
    `Имя: ${order.name}`,
    `Телефон: ${order.phone}`,
    `Город: ${order.city}`,
    `Адрес/ПВЗ: ${order.address}`,
    `Доставка: ${order.deliveryType}`,
    `Оплата: ${order.paymentMethod}`,
    order.comment ? `Комментарий: ${order.comment}` : '',
    '',
    userLine
  ].filter(Boolean).join('\n');
}

async function sendTelegramMessage(text: string) {
  if (!BOT_TOKEN || !ADMIN_CHAT_ID) return;
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: ADMIN_CHAT_ID, text })
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram sendMessage failed: ${body}`);
  }
}

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    botConfigured: Boolean(BOT_TOKEN),
    adminConfigured: Boolean(ADMIN_CHAT_ID)
  });
});

app.post('/api/orders', async (req, res) => {
  try {
    const initData = String(req.headers['x-telegram-init-data'] || '');
    const isValid = initData ? validateTelegramInitData(initData) : false;

    if (!isValid && !ALLOW_DEV_INIT_DATA) {
      return res.status(401).json({ ok: false, error: 'Invalid Telegram initData' });
    }

    const order = OrderSchema.parse(req.body);
    const orderId = String(Date.now()).slice(-6);
    const user = isValid ? getTelegramUser(initData) : null;

    await sendTelegramMessage(formatOrderMessage(order, orderId, user));

    console.log({ orderId, order, user });

    res.json({ ok: true, orderId });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : 'Order validation or processing failed';
    const status = message.includes('Telegram sendMessage failed') ? 502 : 400;
    res.status(status).json({ ok: false, error: message });
  }
});

app.listen(PORT, () => {
  console.log(`Kurierka backend is running on http://localhost:${PORT}`);
});
