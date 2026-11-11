import { Cents } from './money';
import type { PriceSource } from './types';
import type { SaleUnit } from './units';

export interface PriceRecord {
  id: string;
  productId: string;
  purchaseId: string | null;
  storeName: string | null;
  /** Unidade cadastrada do supermercado (quando a compra foi vinculada a uma). */
  storeLocationId?: string | null;
  saleUnit: SaleUnit;
  /** Preço por unidade de venda. */
  unitPriceCents: Cents;
  source: PriceSource;
  promo: boolean;
  /** Preço normal informado junto com o promocional, quando houver. */
  regularPriceCents?: Cents | null;
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

/* ------------------------------------------------------------------ */
/* Idade do preço e comparação entre supermercados                     */
/* ------------------------------------------------------------------ */

/** Até 7 dias: atual. Até 30 dias: recente. Depois disso: antigo (não é tratado como preço de hoje). */
export type Freshness = 'current' | 'recent' | 'old';
export const CURRENT_DAYS = 7;
export const RECENT_DAYS = 30;

export function ageInDays(recordedAt: string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(recordedAt).getTime()) / 86_400_000));
}

export function freshness(recordedAt: string, now: Date): Freshness {
  const d = ageInDays(recordedAt, now);
  return d <= CURRENT_DAYS ? 'current' : d <= RECENT_DAYS ? 'recent' : 'old';
}

export function ageLabel(recordedAt: string, now: Date): string {
  const d = ageInDays(recordedAt, now);
  if (d === 0) return 'hoje';
  if (d === 1) return 'ontem';
  if (d < 60) return `há ${d} dias`;
  const m = Math.floor(d / 30);
  return m < 24 ? `há ${m} meses` : `há ${Math.floor(d / 365)} anos`;
}

export interface StorePrice {
  store: string;
  storeLocationId: string | null;
  /** Registro mais recente deste produto neste supermercado. */
  last: PriceRecord;
  freshness: Freshness;
  /** Quantidade de registros neste supermercado. */
  count: number;
  minCents: Cents;
  maxCents: Cents;
}

export interface StoreComparison {
  stores: StorePrice[];
  /** Supermercado mais barato considerando APENAS preços não antigos; null se não houver ao menos um. */
  cheapest: StorePrice | null;
  /** Diferença entre o mais caro e o mais barato entre os preços não antigos (0 com menos de dois). */
  spreadCents: Cents;
  /** Último preço registrado em qualquer supermercado. */
  latest: PriceRecord | null;
}

const storeKey = (h: PriceRecord) => h.storeLocationId ?? (h.storeName ? h.storeName.trim().toUpperCase() : '');

/**
 * Agrupa o histórico de UM produto por supermercado (mesma unidade de venda).
 * Preços com mais de 30 dias aparecem na lista, mas não participam do "mais barato".
 */
export function compareStores(history: readonly PriceRecord[], saleUnit: SaleUnit, now: Date): StoreComparison {
  const groups = new Map<string, PriceRecord[]>();
  const sorted = history.filter((h) => h.saleUnit === saleUnit).sort((a, b) => (a.recordedAt < b.recordedAt ? 1 : -1));
  for (const h of sorted) {
    const k = storeKey(h);
    groups.set(k, [...(groups.get(k) ?? []), h]);
  }
  const stores: StorePrice[] = [...groups.values()].map((list) => ({
    store: list[0].storeName?.trim() || 'Supermercado não informado',
    storeLocationId: list[0].storeLocationId ?? null,
    last: list[0],
    freshness: freshness(list[0].recordedAt, now),
    count: list.length,
    minCents: Math.min(...list.map((l) => l.unitPriceCents)),
    maxCents: Math.max(...list.map((l) => l.unitPriceCents)),
  }));
  const rank = { current: 0, recent: 0, old: 1 } as const;
  stores.sort((a, b) => rank[a.freshness] - rank[b.freshness] || a.last.unitPriceCents - b.last.unitPriceCents);
  const fresh = stores.filter((s) => s.freshness !== 'old' && s.store !== 'Supermercado não informado');
  return {
    stores,
    cheapest: fresh.length ? fresh[0] : null,
    spreadCents: fresh.length > 1 ? fresh[fresh.length - 1].last.unitPriceCents - fresh[0].last.unitPriceCents : 0,
    latest: sorted[0] ?? null,
  };
}
