/**
 * Resumo financeiro das compras. Funções puras sobre centavos inteiros.
 * Os meses seguem o fuso do aparelho (uma compra às 23h do dia 31 pertence àquele mês).
 */
import { Cents, divRoundHalfUp, sumCents } from './money';
import { normalizeText } from './matching';
import type { CartItem } from './types';
import { lineSubtotal } from './units';

export interface SpendRecord {
  id: string;
  storeName: string | null;
  /** Data da compra (ISO). */
  date: string;
  totalCents: Cents;
  /** Descontos e promoções registrados na compra. */
  savingsCents: Cents;
  budgetCents: Cents | null;
}

/** 'AAAA-MM' no fuso local. */
export function monthKey(d: string | Date): string {
  const dt = typeof d === 'string' ? new Date(d) : d;
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
}

export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number);
  const idx = y * 12 + (m - 1) + delta;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MONTHS_LONG = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const monthShort = (key: string) => MONTHS[Number(key.split('-')[1]) - 1];
export const monthLong = (key: string) => `${MONTHS_LONG[Number(key.split('-')[1]) - 1]} de ${key.split('-')[0]}`;

export interface MonthSummary {
  month: string;
  totalCents: Cents;
  count: number;
  /** Média por compra (arredondada ao centavo); null sem compras. */
  averageCents: Cents | null;
  biggest: SpendRecord | null;
  savingsCents: Cents;
  previousTotalCents: Cents;
  previousCount: number;
  /** Total do mês − total do mês anterior. */
  diffCents: Cents;
  /** Variação percentual inteira; null quando o mês anterior não teve gastos. */
  diffPercent: number | null;
}

export function summarizeMonth(records: readonly SpendRecord[], month: string): MonthSummary {
  const cur = records.filter((r) => monthKey(r.date) === month);
  const prevKey = shiftMonth(month, -1);
  const prev = records.filter((r) => monthKey(r.date) === prevKey);
  const total = sumCents(cur.map((r) => r.totalCents));
  const prevTotal = sumCents(prev.map((r) => r.totalCents));
  const biggest = cur.reduce<SpendRecord | null>((best, r) => (!best || r.totalCents > best.totalCents ? r : best), null);
  return {
    month,
    totalCents: total,
    count: cur.length,
    averageCents: cur.length ? divRoundHalfUp(total, cur.length) : null,
    biggest,
    savingsCents: sumCents(cur.map((r) => r.savingsCents)),
    previousTotalCents: prevTotal,
    previousCount: prev.length,
    diffCents: total - prevTotal,
    diffPercent: prevTotal > 0 ? Math.round(((total - prevTotal) * 100) / prevTotal) : null,
  };
}

export interface MonthPoint {
  month: string;
  label: string;
  totalCents: Cents;
  count: number;
}

/** Série dos últimos `n` meses terminando em `endMonth` (meses sem compra aparecem com zero). */
export function monthlySeries(records: readonly SpendRecord[], endMonth: string, n = 6): MonthPoint[] {
  const out: MonthPoint[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const key = shiftMonth(endMonth, -i);
    const list = records.filter((r) => monthKey(r.date) === key);
    out.push({ month: key, label: monthShort(key), totalCents: sumCents(list.map((r) => r.totalCents)), count: list.length });
  }
  return out;
}

export interface StoreSpend {
  store: string;
  totalCents: Cents;
  count: number;
}

export const UNKNOWN_STORE = 'Supermercado não informado';

/** Gasto por supermercado no mês (ou em todo o histórico quando `month` é null). */
export function spendByStore(records: readonly SpendRecord[], month: string | null): StoreSpend[] {
  const map = new Map<string, StoreSpend>();
  for (const r of records) {
    if (month && monthKey(r.date) !== month) continue;
    const label = r.storeName?.trim() || UNKNOWN_STORE;
    const key = normalizeText(label);
    const cur = map.get(key) ?? { store: label, totalCents: 0, count: 0 };
    cur.totalCents += r.totalCents;
    cur.count += 1;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => b.totalCents - a.totalCents || a.store.localeCompare(b.store));
}

/**
 * Economia registrada nos itens: descontos informados + diferença entre o preço normal
 * e o preço promocional pago (quando o preço normal foi registrado).
 */
export function itemsSavings(items: readonly Pick<CartItem, 'unitPriceCents' | 'quantityMilli' | 'discountCents' | 'regularPriceCents'>[]): Cents {
  let total = 0;
  for (const i of items) {
    total += i.discountCents;
    if (i.regularPriceCents != null && i.regularPriceCents > i.unitPriceCents) {
      total += lineSubtotal(i.regularPriceCents, i.quantityMilli) - lineSubtotal(i.unitPriceCents, i.quantityMilli);
    }
  }
  return total;
}

/* ------------------------------------------------------------------ */
/* Comparação entre duas compras                                       */
/* ------------------------------------------------------------------ */

type ComparableItem = Pick<CartItem, 'productId' | 'barcode' | 'name' | 'brand' | 'packageLabel' | 'saleUnit' | 'unitPriceCents'>;

export interface ComparedProduct {
  name: string;
  saleUnit: CartItem['saleUnit'];
  priceA: Cents;
  priceB: Cents;
  /** B − A (positivo = ficou mais caro na compra B). */
  diffCents: Cents;
}

export interface PurchaseComparison {
  common: ComparedProduct[];
  onlyA: string[];
  onlyB: string[];
  /** Soma das diferenças de preço unitário dos produtos em comum. */
  commonDiffCents: Cents;
}

function itemKey(i: ComparableItem): string {
  if (i.productId) return `p:${i.productId}`;
  if (i.barcode) return `b:${i.barcode.replace(/^0+/, '')}`;
  return `n:${normalizeText([i.name, i.brand ?? '', i.packageLabel ?? ''].join(' '))}`;
}

/** Compara os preços unitários dos produtos que aparecem nas duas compras (mesma unidade de venda). */
export function comparePurchases(a: readonly ComparableItem[], b: readonly ComparableItem[]): PurchaseComparison {
  const mapB = new Map<string, ComparableItem>();
  for (const i of b) if (!mapB.has(itemKey(i))) mapB.set(itemKey(i), i);
  const seen = new Set<string>();
  const matched = new Set<string>();
  const common: ComparedProduct[] = [];
  const onlyA: string[] = [];
  for (const i of a) {
    const k = itemKey(i);
    if (seen.has(k)) continue;
    seen.add(k);
    const other = mapB.get(k);
    if (other && other.saleUnit === i.saleUnit) {
      matched.add(k);
      common.push({ name: i.name, saleUnit: i.saleUnit, priceA: i.unitPriceCents, priceB: other.unitPriceCents, diffCents: other.unitPriceCents - i.unitPriceCents });
    } else onlyA.push(i.name);
  }
  const onlyB = [...mapB.entries()].filter(([k]) => !matched.has(k)).map(([, o]) => o.name);
  return { common, onlyA, onlyB, commonDiffCents: sumCents(common.map((c) => c.diffCents)) };
}
