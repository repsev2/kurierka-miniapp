import crypto from 'node:crypto';

const SHOP_ID = (process.env.YOOKASSA_SHOP_ID || '').trim();
const SECRET_KEY = (process.env.YOOKASSA_SECRET_KEY || '').trim();
const FRONTEND_URL = (process.env.FRONTEND_URL || 'https://kurierka-miniapp.vercel.app').replace(/\/$/, '');

type PaymentAmount = {
  value: string;
  currency: 'RUB';
};

export function isYookassaConfigured() {
  return Boolean(SHOP_ID && SECRET_KEY);
}

export async function createYookassaPayment(params: {
  orderId: string;
  amountRub: number;
  description: string;
  customerEmail?: string;
}) {
  if (!isYookassaConfigured()) {
    throw new Error('ЮKassa не настроена на сервере');
  }

  const idempotenceKey = crypto.randomUUID();
  const auth = Buffer.from(`${SHOP_ID}:${SECRET_KEY}`).toString('base64');

  const res = await fetch('https://api.yookassa.ru/v3/payments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${auth}`,
      'Idempotence-Key': idempotenceKey
    },
    body: JSON.stringify({
      amount: {
        value: params.amountRub.toFixed(2),
        currency: 'RUB'
      } satisfies PaymentAmount,
      capture: true,
      confirmation: {
        type: 'redirect',
        return_url: `${FRONTEND_URL}/?paid=1&order=${params.orderId}`
      },
      description: params.description,
      metadata: {
        orderId: params.orderId
      }
    })
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.description || 'Не удалось создать платёж в ЮKassa');
  }

  return {
    paymentId: data.id as string,
    paymentUrl: data.confirmation?.confirmation_url as string | undefined
  };
}

export type YookassaNotification = {
  event?: string;
  object?: {
    id?: string;
    status?: string;
    metadata?: {
      orderId?: string;
    };
  };
};
