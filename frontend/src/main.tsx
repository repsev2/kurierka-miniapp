import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PRODUCTS, PRODUCT_MAP, formatPrice, type Product, type ProductId } from './catalog';
import './styles.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

type Screen = 'home' | 'catalog' | 'product' | 'cart' | 'checkout' | 'pay' | 'success';
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
  paymentMethod: 'yookassa'
};

function cartHasBox(cart: CartItem[]) {
  return cart.some((item) => PRODUCT_MAP[item.productId].kind === 'box');
}

function cartTotal(cart: CartItem[]) {
  return cart.reduce((sum, item) => sum + PRODUCT_MAP[item.productId].price * item.quantity, 0);
}

function cartCount(cart: CartItem[]) {
  return cart.reduce((sum, item) => sum + item.quantity, 0);
}

function validateCheckout(form: CheckoutForm, needsApartment: boolean) {
  if (needsApartment && !form.noApartmentNumber && !form.apartmentNumber.trim()) {
    return 'Укажите номер квартиры или отметьте, что номер не нужен.';
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
    return 'Укажите адрес полностью — минимум 5 символов.';
  }
  return '';
}

function App() {
  const tg = window.Telegram?.WebApp;
  const [screen, setScreen] = useState<Screen>('home');
  const [selectedId, setSelectedId] = useState<ProductId | null>(null);
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

  const selected = selectedId ? PRODUCT_MAP[selectedId] : null;
  const total = useMemo(() => cartTotal(cart), [cart]);
  const count = useMemo(() => cartCount(cart), [cart]);
  const needsApartment = useMemo(() => cartHasBox(cart), [cart]);

  const updateCheckout = <K extends keyof CheckoutForm>(key: K, value: CheckoutForm[K]) => {
    setCheckout((prev) => ({ ...prev, [key]: value }));
  };

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 1800);
  };

  const addToCart = (productId: ProductId, quantity = 1) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.productId === productId);
      if (existing) {
        return prev.map((item) =>
          item.productId === productId
            ? { ...item, quantity: Math.min(99, item.quantity + quantity) }
            : item
        );
      }
      return [...prev, { productId, quantity }];
    });
    tg?.HapticFeedback?.notificationOccurred('success');
    showToast('Добавлено в корзину');
  };

  const setQuantity = (productId: ProductId, quantity: number) => {
    setCart((prev) => {
      if (quantity <= 0) return prev.filter((item) => item.productId !== productId);
      return prev.map((item) => (item.productId === productId ? { ...item, quantity } : item));
    });
  };

  const openProduct = (productId: ProductId) => {
    setSelectedId(productId);
    setError('');
    setScreen('product');
  };

  const goCheckout = () => {
    setError('');
    if (!cart.length) {
      setError('Корзина пуста.');
      return;
    }
    setScreen('checkout');
  };

  const goPay = () => {
    setError('');
    const validationError = validateCheckout(checkout, needsApartment);
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
    : checkout.paymentMethod === 'yookassa' && total
      ? `Оплатить ${formatPrice(total)}`
      : 'Оформить заказ';

  return (
    <main className="app">
      {screen !== 'home' && screen !== 'success' && (
        <TopBar
          count={count}
          onCatalog={() => { setError(''); setScreen('catalog'); }}
          onCart={() => { setError(''); setScreen('cart'); }}
          showBack={screen !== 'catalog'}
          onBack={() => {
            setError('');
            if (screen === 'product') setScreen('catalog');
            else if (screen === 'cart') setScreen('catalog');
            else if (screen === 'checkout') setScreen('cart');
            else if (screen === 'pay') setScreen('checkout');
          }}
        />
      )}

      {toast && <div className="toast">{toast}</div>}

      {screen === 'home' && (
        <section className="hero-screen">
          <div className="hero-media" style={{ backgroundImage: 'url(/products/hero.jpg)' }} />
          <div className="hero-overlay">
            <div className="brand-row">
              <div className="brand-mark">К</div>
              <div>
                <div className="brand">Курьерка</div>
                <div className="muted">Дом для ваших доставок</div>
              </div>
            </div>
            <h1>Современный бокс для доставок</h1>
            <p>Заказы с маркетплейсов больше не на полу и не на ручке двери.</p>
            <button className="btn btn-primary btn-large" onClick={() => setScreen('catalog')}>
              Смотреть каталог
            </button>
          </div>
        </section>
      )}

      {screen === 'catalog' && (
        <section className="screen">
          <h1 className="screen-title">Каталог</h1>
          <p className="muted screen-lead">Выбирайте Курьерку и аксессуары</p>
          <div className="product-grid">
            {PRODUCTS.map((product) => (
              <button key={product.id} className="product-card" onClick={() => openProduct(product.id)}>
                <img src={product.image} alt={product.title} loading="lazy" />
                <div className="product-card-body">
                  <b>{product.title}</b>
                  <span>{product.subtitle}</span>
                  <strong>{formatPrice(product.price)}</strong>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {screen === 'product' && selected && (
        <ProductScreen
          product={selected}
          onAdd={() => addToCart(selected.id)}
          onGoCart={() => setScreen('cart')}
        />
      )}

      {screen === 'cart' && (
        <section className="screen">
          <h1 className="screen-title">Корзина</h1>
          {!cart.length && <p className="muted">Пока пусто — добавьте товары из каталога.</p>}
          <div className="cart-list">
            {cart.map((item) => {
              const product = PRODUCT_MAP[item.productId];
              return (
                <div key={item.productId} className="cart-row">
                  <img src={product.image} alt={product.title} />
                  <div className="cart-info">
                    <b>{product.title}</b>
                    <span>{formatPrice(product.price)}</span>
                    <div className="qty">
                      <button type="button" onClick={() => setQuantity(item.productId, item.quantity - 1)}>−</button>
                      <span>{item.quantity}</span>
                      <button type="button" onClick={() => setQuantity(item.productId, item.quantity + 1)}>+</button>
                    </div>
                  </div>
                  <strong>{formatPrice(product.price * item.quantity)}</strong>
                </div>
              );
            })}
          </div>
          {!!cart.length && (
            <>
              <div className="total-row">
                <span>Итого</span>
                <b>{formatPrice(total)}</b>
              </div>
              {error && <div className="error">{error}</div>}
              <button className="btn btn-primary btn-large" onClick={goCheckout}>Оформить</button>
            </>
          )}
          {!cart.length && (
            <button className="btn btn-primary btn-large" onClick={() => setScreen('catalog')}>В каталог</button>
          )}
        </section>
      )}

      {screen === 'checkout' && (
        <section className="screen card-panel">
          <h1 className="screen-title">Доставка</h1>
          {needsApartment && (
            <>
              <label className="field">Номер квартиры
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
            </>
          )}
          <label className="field">Имя
            <input value={checkout.name} onChange={(e) => updateCheckout('name', e.target.value)} placeholder="Например, Анна Иванова" />
          </label>
          <label className="field">Телефон
            <input value={checkout.phone} onChange={(e) => updateCheckout('phone', e.target.value)} placeholder="+7 999 123-45-67" />
          </label>
          <label className="field">Город
            <input value={checkout.city} onChange={(e) => updateCheckout('city', e.target.value)} />
          </label>
          <label className="field">Адрес / ПВЗ
            <textarea value={checkout.address} onChange={(e) => updateCheckout('address', e.target.value)} placeholder="Улица, дом, квартира или пункт выдачи" />
          </label>
          <label className="field">Тип доставки
            <select value={checkout.deliveryType} onChange={(e) => updateCheckout('deliveryType', e.target.value as DeliveryType)}>
              <option value="moscow-courier">Москва — доставка курьером</option>
              <option value="pickup-point">Регион — отправка в ПВЗ</option>
            </select>
          </label>
          <label className="field">Комментарий
            <textarea value={checkout.comment} onChange={(e) => updateCheckout('comment', e.target.value)} placeholder="Код домофона, удобное время, пожелания" />
          </label>
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
          <button className="btn btn-primary btn-large" onClick={() => tg?.close?.() || setScreen('catalog')}>
            Закрыть
          </button>
        </section>
      )}
    </main>
  );
}

function TopBar({
  count,
  onCatalog,
  onCart,
  showBack,
  onBack
}: {
  count: number;
  onCatalog: () => void;
  onCart: () => void;
  showBack: boolean;
  onBack: () => void;
}) {
  return (
    <header className="topbar">
      {showBack ? (
        <button className="icon-btn" onClick={onBack} aria-label="Назад">←</button>
      ) : (
        <button className="brand-chip" onClick={onCatalog}>Курьерка</button>
      )}
      <button className="cart-btn" onClick={onCart}>
        Корзина{count > 0 ? ` · ${count}` : ''}
      </button>
    </header>
  );
}

function ProductScreen({
  product,
  onAdd,
  onGoCart
}: {
  product: Product;
  onAdd: () => void;
  onGoCart: () => void;
}) {
  return (
    <section className="screen">
      <div className="product-hero">
        <img src={product.image} alt={product.title} />
      </div>
      <div className="card-panel product-details">
        <h1>{product.title}</h1>
        <strong className="price">{formatPrice(product.price)}</strong>
        <p>{product.description}</p>
        {product.includes && (
          <>
            <p className="section-label">Комплектация</p>
            <ul className="includes">
              {product.includes.map((line) => <li key={line}>{line}</li>)}
            </ul>
          </>
        )}
        <button className="btn btn-primary btn-large" onClick={onAdd}>В корзину</button>
        <button className="btn btn-outline" onClick={onGoCart}>Перейти в корзину</button>
      </div>
    </section>
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
