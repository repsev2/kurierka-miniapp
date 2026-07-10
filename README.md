# Курьерка — Telegram Mini App MVP

Мини-приложение для заказа Курьерки внутри Telegram: выбор товара, номер квартиры, доставка, заявка/оплата-заглушка, уведомление администратору в Telegram.

## Что внутри

- `frontend/` — Vite + React интерфейс Mini App.
- `backend/` — Node.js + Express API для приёма заказов.
- Валидация `Telegram.WebApp.initData` на сервере.
- Отправка нового заказа администратору в Telegram.
- Подготовка к Google Sheets / CRM и онлайн-оплате.

## Быстрый запуск локально

### 1. Backend

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

В `.env` нужно указать:

```env
BOT_TOKEN=токен_бота_из_BotFather
ADMIN_CHAT_ID=ваш_telegram_id_или_id_чата
PORT=3001
ALLOW_DEV_INIT_DATA=true
```

`ALLOW_DEV_INIT_DATA=true` разрешает тестировать форму вне Telegram. На проде поставить `false`.

### 2. Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

В `.env`:

```env
VITE_API_URL=http://localhost:3001
```

## Как подключить в Telegram

1. Создать бота через `@BotFather`.
2. Получить `BOT_TOKEN`.
3. Разместить frontend на HTTPS-домене, например Vercel.
4. Разместить backend на Render/Railway/Fly.io.
5. В `@BotFather` открыть:
   - `/mybots`
   - выбрать бота
   - Bot Settings
   - Menu Button или Configure Mini App
   - указать URL фронтенда.

## Важное по безопасности

На сервере реализована проверка `initData`. Нельзя доверять данным Telegram-пользователя только на фронтенде. В продакшене обязательно:

```env
ALLOW_DEV_INIT_DATA=false
```

## Что нужно доделать перед продажами

1. Подключить реальную оплату: ЮKassa / CloudPayments / Telegram Payments.
2. Подключить Google Sheets или CRM.
3. Добавить реальные фото Курьерки в `frontend/public` и заменить плейсхолдер.
4. Добавить политику обработки персональных данных и оферту.
5. Протестировать сценарий заказа на iOS, Android, Desktop Telegram.
