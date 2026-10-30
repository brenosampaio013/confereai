import { Cents } from './money';
import type { PriceSource } from './types';
import type { SaleUnit } from './units';

export interface PriceRecord {
  id: string;
  productId: string;
  purchaseId: string | null;
  storeName: string | null;
  saleUnit: SaleUnit;
  /** Preço por unidade de venda. */
  unitPriceCents: Cents;
  source: PriceSource;
  promo: boolean;
  recordedAt: string;
}

export interface PriceComparison {
  previous: PriceRecord;
  currentCents: Cents;
  diffCents: Cents;
  sameStore: boolean | null;
}

/**
 * Compara o preço atual com o último preço registrado pelo usuário para o MESMO produto
 * (mesmo cadastro → mesma marca, embalagem e medida) e mesma unidade de venda.
 * Não extrapola tendências: é apenas a diferença em relação ao último registro.
 */
export function compareWithLastPrice(
  history: readonly PriceRecord[],
  productId: string,
  saleUnit: SaleUnit,
  currentCents: Cents,
  opts: { excludePurchaseId?: string; storeName?: string | null } = {},
): PriceComparison | null {
  const candidates = history
    .filter((h) => h.productId === productId && h.saleUnit === saleUnit && h.purchaseId !== opts.excludePurchaseId)
    .sort((a, b) => (a.recordedAt < b.recordedAt ? 1 : -1));
  const previous = candidates[0];
  if (!previous) return null;
  return {
    previous,
    currentCents,
    diffCents: currentCents - previous.unitPriceCents,
    sameStore:
      opts.storeName && previous.storeName
        ? opts.storeName.trim().toUpperCase() === previous.storeName.trim().toUpperCase()
        : null,
  };
}
