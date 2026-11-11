import type { CartItem } from '../src/domain/types';
import { MILLI } from '../src/domain/units';

let n = 0;
export function cartItem(p: Partial<CartItem> & { name: string; unitPriceCents: number }): CartItem {
  n += 1;
  const now = '2026-10-30T12:00:00.000Z';
  return {
    id: p.id ?? `c${n}`,
    purchaseId: 'p1',
    productId: null,
    barcode: null,
    brand: null,
    packageLabel: null,
    saleUnit: 'un',
    quantityMilli: MILLI,
    discountCents: 0,
    priceSource: 'manual',
    regularPriceCents: null,
    promoNote: null,
    addedVia: 'scan',
    createdAt: now,
    updatedAt: now,
    ...p,
  };
}
