export const PRODUCT_IDS = ['classic', 'leo', 'mat-orange', 'mat-graphite', 'markers'] as const;
export type ProductId = (typeof PRODUCT_IDS)[number];

export const PRODUCTS = {
  classic: { title: 'Курьерка', price: 5500, kind: 'box' as const },
  leo: { title: 'Курьерка Лео', price: 7500, kind: 'box' as const },
  'mat-orange': { title: 'Коврик на полку оранжевый', price: 300, kind: 'accessory' as const },
  'mat-graphite': { title: 'Коврик на полку графитовый', price: 300, kind: 'accessory' as const },
  markers: { title: 'Акриловые маркеры', price: 350, kind: 'accessory' as const }
} as const;

export function isProductId(value: string): value is ProductId {
  return (PRODUCT_IDS as readonly string[]).includes(value);
}
