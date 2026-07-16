export type ProductId = 'classic' | 'leo' | 'mat-orange' | 'mat-graphite' | 'markers';
export type ProductKind = 'box' | 'accessory';

export type Product = {
  id: ProductId;
  title: string;
  price: number;
  image: string;
  kind: ProductKind;
  subtitle: string;
  description: string;
  includes?: string[];
};

export const PRODUCTS: Product[] = [
  {
    id: 'classic',
    title: 'Курьерка',
    price: 5500,
    image: '/products/classic.png',
    kind: 'box',
    subtitle: 'Прозрачное оргстекло, графит',
    description: 'Прозрачное оргстекло, цвет надписи и цифр: графит, размер: 43×22×50 см.',
    includes: [
      'Инструкция к Курьерке',
      'Табличка для курьеров',
      'Два комплекта наклеек номера квартиры',
      'Силиконовые ножки'
    ]
  },
  {
    id: 'leo',
    title: 'Курьерка Лео',
    price: 7500,
    image: '/products/leo.jpg',
    kind: 'box',
    subtitle: 'Прозрачное оргстекло, принт Лео',
    description: 'Прозрачное оргстекло, цвет принта: Лео, размер: 43×22×50 см.',
    includes: [
      'Инструкция к Курьерке',
      'Табличка для курьеров',
      'Два комплекта наклеек номера квартиры',
      'Силиконовые ножки'
    ]
  },
  {
    id: 'mat-orange',
    title: 'Коврик на полку оранжевый',
    price: 300,
    image: '/products/mat-orange.jpg',
    kind: 'accessory',
    subtitle: 'Мягкая полка для заказов',
    description: 'Оранжевый коврик на полку Курьерки — заказы лежат аккуратно и не скользят.'
  },
  {
    id: 'mat-graphite',
    title: 'Коврик на полку графитовый',
    price: 300,
    image: '/products/mat-graphite.jpg',
    kind: 'accessory',
    subtitle: 'Мягкая полка для заказов',
    description: 'Графитовый коврик на полку Курьерки — заказы лежат аккуратно и не скользят.'
  },
  {
    id: 'markers',
    title: 'Акриловые маркеры',
    price: 350,
    image: '/products/markers.jpg',
    kind: 'accessory',
    subtitle: 'Для подписи и декора',
    description: 'Акриловые маркеры, чтобы подписать или украсить Курьерку.'
  }
];

export const PRODUCT_MAP = Object.fromEntries(PRODUCTS.map((p) => [p.id, p])) as Record<ProductId, Product>;

export function formatPrice(value: number) {
  return `${value.toLocaleString('ru-RU')} ₽`;
}
