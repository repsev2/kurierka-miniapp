export type ProductId = 'classic' | 'leo' | 'mat-orange' | 'mat-graphite' | 'markers';
export type ProductKind = 'box' | 'accessory';

export type Product = {
  id: ProductId;
  title: string;
  price: number;
  image: string;
  kind: ProductKind;
  subtitle?: string;
  description: string;
  includes?: string[];
};

export const DELIVERY_PRICES = {
  'moscow-courier': 600,
  'pickup-point': 900
} as const;

export const BOXES: Product[] = [
  {
    id: 'classic',
    title: 'Прозрачная',
    price: 5500,
    image: '/products/classic.png',
    kind: 'box',
    subtitle: 'Оргстекло, принт Графит',
    description: 'Прозрачное оргстекло, принт Графит, размер: 43×22×50 см.',
    includes: [
      'Инструкция к Курьерке',
      'Табличка для курьеров',
      'Два комплекта наклеек номера квартиры',
      'Силиконовые ножки'
    ]
  },
  {
    id: 'leo',
    title: 'Лео',
    price: 7500,
    image: '/products/leo.png',
    kind: 'box',
    subtitle: 'Оргстекло, принт Лео',
    description: 'Прозрачное оргстекло, принт Лео, размер: 43×22×50 см.',
    includes: [
      'Инструкция к Курьерке',
      'Табличка для курьеров',
      'Два комплекта наклеек номера квартиры',
      'Силиконовые ножки'
    ]
  }
];

export const EXTRAS: Product[] = [
  {
    id: 'mat-orange',
    title: 'Коврик на полку оранжевый',
    price: 300,
    image: '/products/mat-orange.jpg',
    kind: 'accessory',
    description: 'Оранжевый коврик на полку Курьерки.'
  },
  {
    id: 'mat-graphite',
    title: 'Коврик на полку графитовый',
    price: 300,
    image: '/products/mat-graphite.jpg',
    kind: 'accessory',
    description: 'Графитовый коврик на полку Курьерки.'
  },
  {
    id: 'markers',
    title: 'Акриловые маркеры',
    price: 350,
    image: '/products/markers.jpg',
    kind: 'accessory',
    description: 'Акриловые маркеры, чтобы подписать или украсить Курьерку.'
  }
];

export const PRODUCTS: Product[] = [...BOXES, ...EXTRAS];

export const PRODUCT_MAP = Object.fromEntries(PRODUCTS.map((p) => [p.id, p])) as Record<ProductId, Product>;

export function formatPrice(value: number) {
  return `${value.toLocaleString('ru-RU')} ₽`;
}
