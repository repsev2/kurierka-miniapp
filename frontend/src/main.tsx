import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const PRODUCTS = {
  transparent: { title: 'Прозрачная Курьерка', price: 5500, subtitle: 'Базовая версия для заказов у двери' },
  'with-number': { title: 'Курьерка с номером', price: 5500, subtitle: 'Добавим номер квартиры на бокс' },
  b2b: { title: 'Опт / для ЖК', price: 0, subtitle: 'Для соседей, УК, застройщика или офиса' }
} as const;

type ProductKey = keyof typeof PRODUCTS;
type DeliveryType = 'moscow-courier' | 'pickup-point' | 'b2b-contact';
type PaymentMethod = 'request' | 'yookassa';

type OrderForm = {
  product: ProductKey;
  quantity: number;
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

const initialForm: OrderForm = {
  product: 'with-number',
  quantity: 1,
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

function validateDeliveryStep(form: OrderForm) {
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
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<OrderForm>(initialForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [paidReturn, setPaidReturn] = useState(false);
  const [error, setError] = useState('');
  const [initData, setInitData] = useState('');

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
      setStep(5);
    }
    return () => window.clearTimeout(timer);
  }, [tg]);

  const total = useMemo(() => {
    if (form.product === 'b2b') return null;
    return PRODUCTS[form.product].price * form.quantity;
  }, [form.product, form.quantity]);

  const update = <K extends keyof OrderForm>(key: K, value: OrderForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const next = () => {
    setError('');
    if (step === 2 && !form.noApartmentNumber && !form.apartmentNumber.trim()) {
      setError('Укажите номер квартиры или отметьте, что номер не нужен.');
      return;
    }
    if (step === 3) {
      const validationError = validateDeliveryStep(form);
      if (validationError) {
        setError(validationError);
        return;
      }
    }
    setStep((s) => Math.min(s + 1, 4));
  };

  const submitOrder = async () => {
    setIsSubmitting(true);
    setError('');
    try {
      const telegramInitData = initData || tg?.initData || '';
      if (!telegramInitData) {
        throw new Error('Откройте приложение через бота в Telegram (не в браузере) и попробуйте снова');
      }

      const res = await fetch(`${API_URL}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, initData: telegramInitData })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Не удалось оформить заказ');

      setOrderId(data.orderId);

      if (data.paymentUrl) {
        tg?.HapticFeedback?.notificationOccurred('success');
        if (tg?.openLink) tg.openLink(data.paymentUrl);
        else window.open(data.paymentUrl, '_blank');
        setStep(5);
        return;
      }

      tg?.HapticFeedback?.notificationOccurred('success');
      setStep(5);
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
    : form.paymentMethod === 'yookassa' && total
      ? `Оплатить ${total.toLocaleString('ru-RU')} ₽`
      : 'Оформить заказ';

  return (
    <main className="app">
      <header className="topbar">
        <div className="brand-mark">К</div>
        <div>
          <div className="brand">Курьерка</div>
          <div className="muted">Дом для ваших доставок</div>
        </div>
      </header>

      {step < 5 && <Progress step={step} />}

      {step === 0 && (
        <section className="card hero">
          <div className="badge">Доставка по Москве и регионам</div>
          <div className="product-visual">
            <div className="door"></div>
            <div className="box">
              <span>{form.noApartmentNumber ? '' : form.apartmentNumber || '48'}</span>
              <div className="shelf"></div>
            </div>
          </div>
          <h1>Закажите Курьерку за минуту</h1>
          <p>Бокс у двери, куда курьеры оставляют ваши заказы. Без пакетов на полу и ожидания звонка.</p>
          <button className="btn btn-primary btn-large" onClick={next}>
            <span className="btn-icon">🛒</span>
            Заказать за 5 500 ₽
          </button>
          <button className="btn btn-outline" onClick={() => { update('product', 'b2b'); update('quantity', 50); setStep(1); }}>
            Мне нужен опт / для ЖК
          </button>
        </section>
      )}

      {step === 1 && (
        <section className="card">
          <h2>Выберите формат</h2>
          <div className="options">
            {(Object.keys(PRODUCTS) as ProductKey[]).map((key) => (
              <button key={key} className={`option ${form.product === key ? 'selected' : ''}`} onClick={() => update('product', key)}>
                <div className="option-top">
                  <b>{PRODUCTS[key].title}</b>
                  <strong>{PRODUCTS[key].price ? `${PRODUCTS[key].price.toLocaleString('ru-RU')} ₽` : 'расчёт'}</strong>
                </div>
                <span>{PRODUCTS[key].subtitle}</span>
              </button>
            ))}
          </div>
          {form.product === 'b2b' && (
            <label className="field">Количество
              <input type="number" min="50" value={form.quantity} onChange={(e) => update('quantity', Number(e.target.value))} />
            </label>
          )}
          <FooterButtons back={() => setStep(0)} next={next} />
        </section>
      )}

      {step === 2 && (
        <section className="card">
          <h2>Номер квартиры</h2>
          <p className="muted">Добавим номер, чтобы курьеры быстрее находили вашу Курьерку.</p>
          <label className="field">Номер квартиры
            <input disabled={form.noApartmentNumber} value={form.apartmentNumber} onChange={(e) => update('apartmentNumber', e.target.value)} placeholder="Например, 48" />
          </label>
          <label className="check"><input type="checkbox" checked={form.noApartmentNumber} onChange={(e) => update('noApartmentNumber', e.target.checked)} /> Номер не нужен</label>
          {error && <div className="error">{error}</div>}
          <FooterButtons back={() => setStep(1)} next={next} />
        </section>
      )}

      {step === 3 && (
        <section className="card">
          <h2>Доставка</h2>
          <label className="field">Имя
            <input value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="Например, Анна Иванова" />
            <small>Минимум 2 символа</small>
          </label>
          <label className="field">Телефон
            <input value={form.phone} onChange={(e) => update('phone', e.target.value)} placeholder="+7 999 123-45-67" />
            <small>Минимум 7 символов</small>
          </label>
          <label className="field">Город
            <input value={form.city} onChange={(e) => update('city', e.target.value)} />
          </label>
          <label className="field">Адрес / ПВЗ
            <textarea value={form.address} onChange={(e) => update('address', e.target.value)} placeholder="Улица, дом, квартира или пункт выдачи" />
            <small>Минимум 5 символов</small>
          </label>
          <label className="field">Тип доставки
            <select value={form.deliveryType} onChange={(e) => update('deliveryType', e.target.value as DeliveryType)}>
              <option value="moscow-courier">Москва — доставка курьером</option>
              <option value="pickup-point">Регион — отправка в ПВЗ</option>
              <option value="b2b-contact">Опт / ЖК — связаться для расчёта</option>
            </select>
          </label>
          <label className="field">Комментарий
            <textarea value={form.comment} onChange={(e) => update('comment', e.target.value)} placeholder="Код домофона, удобное время, пожелания" />
          </label>
          {error && <div className="error">{error}</div>}
          <FooterButtons back={() => setStep(2)} next={next} />
        </section>
      )}

      {step === 4 && (
        <section className="card">
          <h2>Проверьте заказ</h2>
          <div className="summary">
            <Row label="Товар" value={PRODUCTS[form.product].title} />
            <Row label="Количество" value={String(form.quantity)} />
            <Row label="Номер" value={form.noApartmentNumber ? 'не нужен' : form.apartmentNumber} />
            <Row label="Город" value={form.city} />
            <Row label="Сумма" value={total === null ? 'рассчитаем индивидуально' : `${total.toLocaleString('ru-RU')} ₽`} />
          </div>

          <p className="section-label">Способ оплаты</p>
          <div className="payment-box">
            <button
              className={`pay-card ${form.paymentMethod === 'yookassa' ? 'active' : ''}`}
              onClick={() => update('paymentMethod', 'yookassa')}
              disabled={total === null}
            >
              <span className="pay-icon">💳</span>
              <b>Оплатить картой</b>
              <span>ЮKassa · СБП · карта</span>
            </button>
            <button
              className={`pay-card ${form.paymentMethod === 'request' ? 'active' : ''}`}
              onClick={() => update('paymentMethod', 'request')}
            >
              <span className="pay-icon">📝</span>
              <b>Оставить заявку</b>
              <span>Свяжемся и уточним детали</span>
            </button>
          </div>

          {error && <div className="error">{error}</div>}
          <FooterButtons back={() => setStep(3)} next={submitOrder} nextText={submitLabel} disabled={isSubmitting} />
        </section>
      )}

      {step === 5 && (
        <section className="card success">
          <div className="success-icon">✓</div>
          <h1>{paidReturn ? 'Оплата прошла' : form.paymentMethod === 'yookassa' ? 'Переходим к оплате' : 'Заказ принят'}</h1>
          {orderId && <p>Номер заказа: <b>#{orderId}</b></p>}
          <p className="muted">
            {paidReturn
              ? 'Спасибо! Мы получили оплату и скоро свяжемся с вами.'
              : form.paymentMethod === 'yookassa'
                ? 'Откроется страница ЮKassa. После оплаты мы пришлём подтверждение в Telegram.'
                : 'Мы получили заявку и свяжемся с вами в Telegram или по телефону.'}
          </p>
          <button className="btn btn-primary btn-large" onClick={() => tg?.close()}>Закрыть</button>
        </section>
      )}
    </main>
  );
}

function Progress({ step }: { step: number }) {
  return <div className="progress"><span style={{ width: `${Math.max(12, (step + 1) * 20)}%` }} /></div>;
}

function FooterButtons({ back, next, nextText = 'Продолжить', disabled = false }: { back: () => void; next: () => void; nextText?: string; disabled?: boolean }) {
  return (
    <div className="footer">
      <button className="btn btn-secondary" onClick={back}>Назад</button>
      <button className="btn btn-primary" disabled={disabled} onClick={next}>{nextText}</button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="row"><span>{label}</span><b>{value || '—'}</b></div>;
}

createRoot(document.getElementById('root')!).render(<App />);
