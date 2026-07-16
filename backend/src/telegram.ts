const BOT_TOKEN = (process.env.BOT_TOKEN || '').trim();
const FRONTEND_URL = (process.env.FRONTEND_URL || 'https://kurierka-miniapp.vercel.app').replace(/\/$/, '');

type TelegramUser = {
  id: number;
  first_name?: string;
  username?: string;
};

type TelegramMessage = {
  message_id: number;
  chat: { id: number; type: string };
  text?: string;
  from?: TelegramUser;
};

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
};

async function callTelegramApi(method: string, body: Record<string, unknown>) {
  if (!BOT_TOKEN) throw new Error('BOT_TOKEN не настроен на сервере');

  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Telegram ${method} failed: ${text}`);
  }
}

export async function sendTelegramMessage(chatId: string | number, text: string, extra?: Record<string, unknown>) {
  await callTelegramApi('sendMessage', { chat_id: chatId, text, ...extra });
}

function getWelcomeText(firstName?: string) {
  const greeting = firstName ? `Привет, ${firstName}!` : 'Привет!';
  return [
    `${greeting} 👋`,
    '',
    'Это бот Курьерки — бокса у двери для доставок.',
    '',
    'Нажмите кнопку ниже, чтобы открыть заказ в Telegram:',
    '• выбрать формат',
    '• указать номер квартиры',
    '• оформить доставку и оплату'
  ].join('\n');
}

function getHelpText() {
  return [
    'Чтобы оформить заказ, откройте приложение кнопкой «Заказать Курьерку».',
    '',
    'Если нужна помощь — напишите нам, и мы ответим вручную.'
  ].join('\n');
}

function getOrderButtonMarkup() {
  return {
    reply_markup: {
      inline_keyboard: [[
        { text: '🛒 Заказать Курьерку', web_app: { url: FRONTEND_URL } }
      ]]
    }
  };
}

export async function handleTelegramUpdate(update: TelegramUpdate) {
  const message = update.message;
  if (!message?.text || !message.chat?.id) return;

  const chatId = message.chat.id;
  const text = message.text.trim();
  const firstName = message.from?.first_name;
  const command = text.split(/\s+/)[0]?.toLowerCase();

  if (command === '/start') {
    await sendTelegramMessage(chatId, getWelcomeText(firstName), getOrderButtonMarkup());
    return;
  }

  if (command === '/help') {
    await sendTelegramMessage(chatId, getHelpText(), getOrderButtonMarkup());
    return;
  }

  await sendTelegramMessage(chatId, getHelpText(), getOrderButtonMarkup());
}

export async function setupTelegramWebhook(publicUrl: string) {
  if (!BOT_TOKEN) {
    console.warn('BOT_TOKEN не задан — webhook Telegram не настроен');
    return;
  }

  const webhookUrl = `${publicUrl.replace(/\/$/, '')}/api/telegram/webhook`;
  await callTelegramApi('setWebhook', { url: webhookUrl });
  console.log(`Telegram webhook: ${webhookUrl}`);
}
