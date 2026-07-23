import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BOXES,
  EXTRAS,
  PRODUCT_MAP,
  DELIVERY_PRICES,
  formatPrice,
  type ProductId
} from './catalog';
import './styles.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const PRIVACY_URL = 'https://kurierka.ru/processingofpersonaldata';
const OFFER_URL = 'https://kurierka.ru/oferta';

type Screen = 'home' | 'boxes' | 'extras' | 'checkout' | 'pay' | 'success';
type DeliveryType = 'moscow-courier' | 'pickup-point';
type PaymentMethod = 'request' | 'yookassa';
type CartItem = { productId: ProductId; quantity: number };

type CheckoutForm = {
  apartmentNumber: string;
  noApartmentNumber: boolean;
  name: string;
  phone: string;
  city: string;
  address: string;
  deliveryType: DeliveryType;
  comment: string;
  isGift: boolean;
  giftMessage: string;
  agreePrivacy: boolean;
  agreeOffer: boolean;
  paymentMethod: PaymentMethod;
};

const initialCheckout: CheckoutForm = {
  apartmentNumber: '',
  noApartmentNumber: false,
  name: '',
  phone: '',
  city: 'Москва',
  address: '',
  deliveryType: 'moscow-courier',
  comment: '',
  isGift: false,
  giftMessage: '',
  agreePrivacy: false,
  agreeOffer: false,
  paymentMethod: 'yookassa'
};

function cartTotal(cart: CartItem[]) {
  return cart.reduce((sum, item) => sum + PRODUCT_MAP[item.productId].price * item.quantity, 0);
}

function getDeliveryPrice(type: DeliveryType) {
  return DELIVERY_PRICES[type];
}

function validateCheckout(form: CheckoutForm) {
  if (!form.noApartmentNumber && !form.apartmentNumber.trim()) {
    return 'Укажите номер квартиры для наклейки или отметьте, что номер не нужен.';
  }
  if (!form.name.trim() || form.name.trim().length < 2) {
    return 'Укажите имя полностью — минимум 2 символа.';
  }
  if (!form.phone.trim() || form.phone.trim().length < 7) {
    return 'Укажите телефон полностью — минимум 7 символов.';
  }
  if (!form.city.trim() || form.city.trim().length < 2) {
    return 'Укажите город.';
  }
  if (!form.address.trim() || form.address.trim().length < 5) {
    return form.deliveryType === 'pickup-point'
      ? 'Укажите адрес ПВЗ Яндекс.Маркета.'
      : 'Укажите полный адрес доставки.';
  }
  if (form.isGift && form.giftMessage.trim().length < 2) {
    return 'Напишите пожелание для открытки.';
  }
  if (!form.agreePrivacy || !form.agreeOffer) {
    return 'Нужно согласие на обработку персональных данных и с условиями оферты.';
  }
  return '';
}

function App() {
  const tg = window.Telegram?.WebApp;
  const [screen, setScreen] = useState<Screen>('home');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [checkout, setCheckout] = useState<CheckoutForm>(initialCheckout);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [paidReturn, setPaidReturn] = useState(false);
  const [error, setError] = useState('');
  const [initData, setInitData] = useState('');
  const [toast, setToast] = useState('');

  React.useEffect(() => {
    tg?.ready();
    tg?.expand();
    const captureInitData = () => setInitData(tg?.initData || '');
    captureInitData();
    const timer = window.setTimeout(captureInitData, 400);
    const params = new URLSearchParams(window.location.search);
    if (params.get('paid') === '1') {
      setPaidReturn(true);
      setOrderId(params.get('order'));
      setScreen('success');
    }
    return () => window.clearTimeout(timer);
  }, [tg]);

  const productsTotal = useMemo(() => cartTotal(cart), [cart]);
  const deliveryPrice = getDeliveryPrice(checkout.deliveryType);
  const total = productsTotal + (cart.length ? deliveryPrice : 0);
  const selectedBox = cart.find((item) => PRODUCT_MAP[item.productId].kind === 'box');
  const addressPlaceholder = checkout.deliveryType === 'pickup-point'
    ? 'Адрес ПВЗ Яндекс.Маркета'
    : 'Полный адрес: улица, дом, квартира';

  const updateCheckout = <K extends keyof CheckoutForm>(key: K, value: CheckoutForm[K]) => {
    setCheckout((prev) => ({ ...prev, [key]: value }));
  };

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 1600);
  };

  const selectBox = (productId: ProductId) => {
    setCart((prev) => {
      const extras = prev.filter((item) => PRODUCT_MAP[item.productId].kind === 'accessory');
      return [{ productId, quantity: 1 }, ...extras];
    });
    setError('');
    setScreen('extras');
    tg?.HapticFeedback?.notificationOccurred('success');
  };

  const toggleExtra = (productId: ProductId) => {
    setCart((prev) => {
      const exists = prev.find((item) => item.productId === productId);
      if (exists) return prev.filter((item) => item.productId !== productId);
      return [...prev, { productId, quantity: 1 }];
    });
    showToast('Корзина обновлена');
  };

  const hasExtra = (productId: ProductId) => cart.some((item) => item.productId === productId);

  const goCheckout = () => {
    if (!selectedBox) {
      setError('Сначала выберите Курьерку.');
      setScreen('boxes');
      return;
    }
    setError('');
    setScreen('checkout');
  };

  const goPay = () => {
    setError('');
    const validationError = validateCheckout(checkout);
    if (validationError) {
      setError(validationError);
      return;
    }
    setScreen('pay');
  };

  const submitOrder = async () => {
    setIsSubmitting(true);
    setError('');
    try {
      const telegramInitData = initData || tg?.initData || '';
      const res = await fetch(`${API_URL}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart,
          apartmentNumber: checkout.apartmentNumber,
          noApartmentNumber: checkout.noApartmentNumber,
          name: checkout.name,
          phone: checkout.phone,
          city: checkout.city,
          address: checkout.address,
          deliveryType: checkout.deliveryType,
          comment: checkout.comment,
          isGift: checkout.isGift,
          giftMessage: checkout.giftMessage,
          agreePrivacy: checkout.agreePrivacy,
          agreeOffer: checkout.agreeOffer,
          paymentMethod: checkout.paymentMethod,
          initData: telegramInitData
        })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Не удалось оформить заказ');

      setOrderId(data.orderId);

      if (data.paymentUrl) {
        tg?.HapticFeedback?.notificationOccurred('success');
        if (tg?.openLink) tg.openLink(data.paymentUrl);
        else window.open(data.paymentUrl, '_blank');
        setScreen('success');
        return;
      }

      tg?.HapticFeedback?.notificationOccurred('success');
      setCart([]);
      setScreen('success');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Не удалось отправить заказ';
      setError(message);
      tg?.HapticFeedback?.notificationOccurred('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitLabel = isSubmitting
    ? 'Отправляем...'
    : checkout.paymentMethod === 'yookassa'
      ? `Оплатить ${formatPrice(total)}`
      : 'Оформить заказ';

  return (
    <main className="app">
      {screen !== 'home' && screen !== 'success' && (
        <TopBar
          onBack={() => {
            setError('');
            if (screen === 'boxes') setScreen('home');
            else if (screen === 'extras') setScreen('boxes');
            else if (screen === 'checkout') setScreen('extras');
            else if (screen === 'pay') setScreen('checkout');
          }}
        />
      )}

      {toast && <div className="toast">{toast}</div>}

      {screen === 'home' && (
        <section className="hero-screen">
          <img className="site-logo" src="/products/logo.svg" alt="Курьерка" />
          <div className="hero-photo-wrap">
            <img className="hero-photo" src="/products/hero.jpg" alt="Курьерка" />
            <div className="hero-dim" />
          </div>
          <div className="hero-overlay">
            <h1>Курьерка</h1>
            <p>Курьеры оставляют ваши заказы в Курьерке — вы забираете их, когда вам удобно</p>
            <button className="btn btn-primary btn-large" onClick={() => setScreen('boxes')}>
              Выбрать Курьерку
            </button>
          </div>
        </section>
      )}

      {screen === 'boxes' && (
        <section className="screen">
          <h1 className="screen-title">Выберите Курьерку</h1>
          <p className="muted screen-lead">Два формата — прозрачная и Лео</p>
          <div className="box-list">
            {BOXES.map((product) => (
              <button key={product.id} className="box-card" onClick={() => selectBox(product.id)}>
                <img src={product.image} alt={product.title} />
                <div className="box-card-body">
                  <div className="box-card-top">
                    <b>{product.title}</b>
                    <strong>{formatPrice(product.price)}</strong>
                  </div>
                  {product.subtitle && <span>{product.subtitle}</span>}
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {screen === 'extras' && (
        <section className="screen">
          <h1 className="screen-title">Добавить плюшки</h1>
          <p className="muted screen-lead">
            Выбрано: {selectedBox ? PRODUCT_MAP[selectedBox.productId].title : '—'}
          </p>
          <div className="extras-list">
            {EXTRAS.map((product) => {
              const active = hasExtra(product.id);
              return (
                <button
                  key={product.id}
                  className={`extra-card ${active ? 'active' : ''}`}
                  onClick={() => toggleExtra(product.id)}
                >
                  <img src={product.image} alt={product.title} />
                  <div className="extra-card-body">
                    <b>{product.title}</b>
                    <strong>{formatPrice(product.price)}</strong>
                  </div>
                  <span className="extra-check">{active ? '✓' : '+'}</span>
                </button>
              );
            })}
          </div>
          <div className="total-row">
            <span>Товары</span>
            <b>{formatPrice(productsTotal)}</b>
          </div>
          {error && <div className="error">{error}</div>}
          <button className="btn btn-primary btn-large" onClick={goCheckout}>К оформлению</button>
          <button className="btn btn-outline" onClick={goCheckout}>Пропустить плюшки</button>
        </section>
      )}

      {screen === 'checkout' && (
        <section className="screen card-panel">
          <h1 className="screen-title">Оформление</h1>

          <label className="field">Номер квартиры для наклейки
            <input
              disabled={checkout.noApartmentNumber}
              value={checkout.apartmentNumber}
              onChange={(e) => updateCheckout('apartmentNumber', e.target.value)}
              placeholder="Например, 48"
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={checkout.noApartmentNumber}
              onChange={(e) => updateCheckout('noApartmentNumber', e.target.checked)}
            />
            Номер не нужен
          </label>

          <label className="field">Имя
            <input value={checkout.name} onChange={(e) => updateCheckout('name', e.target.value)} placeholder="Например, Анна Иванова" />
          </label>
          <label className="field">Телефон
            <input value={checkout.phone} onChange={(e) => updateCheckout('phone', e.target.value)} placeholder="+7 999 123-45-67" />
          </label>
          <label className="field">Город
            <input value={checkout.city} onChange={(e) => updateCheckout('city', e.target.value)} />
          </label>

          <label className="field">Тип доставки
            <select
              value={checkout.deliveryType}
              onChange={(e) => updateCheckout('deliveryType', e.target.value as DeliveryType)}
            >
              <option value="moscow-courier">Москва — курьером · {formatPrice(DELIVERY_PRICES['moscow-courier'])}</option>
              <option value="pickup-point">ПВЗ Яндекс.Маркета · {formatPrice(DELIVERY_PRICES['pickup-point'])}</option>
            </select>
          </label>

          <label className="field">
            {checkout.deliveryType === 'pickup-point' ? 'Адрес ПВЗ' : 'Адрес доставки'}
            <textarea
              value={checkout.address}
              onChange={(e) => updateCheckout('address', e.target.value)}
              placeholder={addressPlaceholder}
            />
          </label>

          <label className="field">Комментарий
            <textarea
              value={checkout.comment}
              onChange={(e) => updateCheckout('comment', e.target.value)}
              placeholder="Код от домофона, нужен ли пропуск, пожелания"
            />
          </label>

          <label className="check">
            <input
              type="checkbox"
              checked={checkout.isGift}
              onChange={(e) => updateCheckout('isGift', e.target.checked)}
            />
            Покупаете в подарок?
          </label>
          {checkout.isGift && (
            <label className="field">Текст для открытки
              <textarea
                value={checkout.giftMessage}
                onChange={(e) => updateCheckout('giftMessage', e.target.value)}
                placeholder="Напишите любое сообщение — мы вложим открытку с пожеланием"
              />
            </label>
          )}

          <label className="check legal">
            <input
              type="checkbox"
              checked={checkout.agreePrivacy}
              onChange={(e) => updateCheckout('agreePrivacy', e.target.checked)}
            />
            <span>
              Согласие на{' '}
              <a href={PRIVACY_URL} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                обработку персональных данных
              </a>
            </span>
          </label>
          <label className="check legal">
            <input
              type="checkbox"
              checked={checkout.agreeOffer}
              onChange={(e) => updateCheckout('agreeOffer', e.target.checked)}
            />
            <span>
              Ознакомлен и согласен с{' '}
              <a href={OFFER_URL} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                условиями оферты
              </a>
            </span>
          </label>

          <div className="summary compact">
            <Row label="Товары" value={formatPrice(productsTotal)} />
            <Row label="Доставка" value={formatPrice(deliveryPrice)} />
            <Row label="Итого" value={formatPrice(total)} />
          </div>

          {error && <div className="error">{error}</div>}
          <button className="btn btn-primary btn-large" onClick={goPay}>К оплате · {formatPrice(total)}</button>
        </section>
      )}

      {screen === 'pay' && (
        <section className="screen card-panel">
          <h1 className="screen-title">Оплата</h1>
          <div className="summary">
            {cart.map((item) => (
              <Row
                key={item.productId}
                label={`${PRODUCT_MAP[item.productId].title} × ${item.quantity}`}
                value={formatPrice(PRODUCT_MAP[item.productId].price * item.quantity)}
              />
            ))}
            <Row label="Доставка" value={formatPrice(deliveryPrice)} />
            <Row label="Сумма" value={formatPrice(total)} />
          </div>

          <p className="section-label">Способ оплаты</p>
          <div className="payment-box">
            <button
              className={`pay-card ${checkout.paymentMethod === 'yookassa' ? 'active' : ''}`}
              onClick={() => updateCheckout('paymentMethod', 'yookassa')}
            >
              <b>Оплатить картой</b>
              <span>ЮKassa · СБП · карта</span>
            </button>
            <button
              className={`pay-card ${checkout.paymentMethod === 'request' ? 'active' : ''}`}
              onClick={() => updateCheckout('paymentMethod', 'request')}
            >
              <b>Оставить заявку</b>
              <span>Свяжемся и уточним детали</span>
            </button>
          </div>

          {error && <div className="error">{error}</div>}
          <button className="btn btn-primary btn-large" disabled={isSubmitting} onClick={submitOrder}>
            {submitLabel}
          </button>
        </section>
      )}

      {screen === 'success' && (
        <section className="screen card-panel success">
          <div className="success-icon">✓</div>
          <h1>
            {paidReturn
              ? 'Оплата прошла'
              : checkout.paymentMethod === 'yookassa'
                ? 'Переходим к оплате'
                : 'Заказ принят'}
          </h1>
          {orderId && <p>Номер заказа: <b>#{orderId}</b></p>}
          <p className="muted">
            {paidReturn
              ? 'Спасибо! Мы получили оплату и скоро свяжемся с вами.'
              : checkout.paymentMethod === 'yookassa'
                ? 'Откроется страница ЮKassa. После оплаты мы пришлём подтверждение в Telegram.'
                : 'Мы получили заявку и свяжемся с вами в Telegram или по телефону.'}
          </p>
          <button className="btn btn-primary btn-large" onClick={() => tg?.close?.() || setScreen('home')}>
            Закрыть
          </button>
        </section>
      )}
    </main>
  );
}

function TopBar({ onBack }: { onBack: () => void }) {
  return (
    <header className="topbar">
      <button className="icon-btn" onClick={onBack} aria-label="Назад">←</button>
      <img className="top-logo" src="/products/logo.svg" alt="Курьерка" />
      <div className="topbar-spacer" />
    </header>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="row">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
