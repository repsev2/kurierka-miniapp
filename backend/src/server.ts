import 'dotenv/config';
import crypto from 'node:crypto';
import cors from 'cors';
import express from 'express';
import { z } from 'zod';

const app = express();
app.use(cors());
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

  return crypto.timingSafeEqual(Buffer.from(calculatedHash), Buffer.from(hash));
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
  res.json({ ok: true });
});

app.post('/api/orders', async (req, res) => {
  try {
    const body = req.body ?? {};
    const initData = String(req.headers['x-telegram-init-data'] || body.initData || '');
    const { initData: _ignored, ...orderData } = body;
    const isValid = initData ? validateTelegramInitData(initData) : false;

    if (!isValid && !ALLOW_DEV_INIT_DATA) {
      return res.status(401).json({ ok: false, error: 'Invalid Telegram initData' });
    }

    const order = OrderSchema.parse(orderData);
  
    const orderId = String(Date.now()).slice(-6);
    const user = isValid ? getTelegramUser(initData) : null;

    await sendTelegramMessage(formatOrderMessage(order, orderId, user));

    // Здесь можно добавить запись в Google Sheets / Supabase / CRM.
    console.log({ orderId, order, user });

    res.json({ ok: true, orderId });
  } catch (error) {
    console.error(error);
    res.status(400).json({ ok: false, error: 'Order validation or processing failed' });
  }
});

app.listen(PORT, () => {
  console.log(`Kurierka backend is running on http://localhost:${PORT}`);
});
