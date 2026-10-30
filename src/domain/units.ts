import { Cents, divRoundHalfUp, divTruncate } from './money';

/**
 * Unidade de venda do item.
 * - 'un': vendido por unidade; o preço é por unidade.
 * - 'kg': vendido por peso; o preço é por quilograma.
 * - 'l' : vendido por volume; o preço é por litro.
 *
 * Quantidades são armazenadas como inteiros em milésimos da unidade de venda
 * ("milli"): 1 unidade = 1000; 1,250 kg = 1250 (gramas); 0,5 L = 500 (mL).
 * Assim produtos vendidos em gramas ou mililitros também são representados sem
 * ponto flutuante.
 */
export type SaleUnit = 'un' | 'kg' | 'l';

export const MILLI = 1000;

export type QuantityMilli = number;

export function unitsToMilli(units: number): QuantityMilli {
  if (!Number.isInteger(units) || units < 0) throw new Error('Quantidade de unidades deve ser inteira e não negativa');
  return units * MILLI;
}

export function isWeighed(unit: SaleUnit): boolean {
  return unit === 'kg' || unit === 'l';
}

/**
 * Converte quantidade digitada para milésimos.
 * Para 'un' aceita apenas inteiros. Para 'kg'/'l' aceita até 3 casas decimais ("1,250").
 * `inputUnit` permite digitar em g/mL ("250" g → 250).
 */
export function parseQuantity(
  input: string,
  unit: SaleUnit,
  inputUnit?: 'g' | 'ml',
): QuantityMilli | null {
  const s = String(input ?? '').trim().replace(/\s+/g, '');
  if (!s) return null;
  if (inputUnit) {
    if (!/^\d+$/.test(s)) return null;
    const v = Number(s);
    return v > 0 ? v : null;
  }
  const m = /^(\d+)(?:[.,](\d{1,3}))?$/.exec(s);
  if (!m) return null;
  if (unit === 'un') {
    if (m[2] && Number(m[2]) !== 0) return null;
    const v = Number(m[1]);
    return v > 0 ? v * MILLI : null;
  }
  const v = Number(m[1]) * MILLI + Number(((m[2] ?? '') + '000').slice(0, 3));
  return v > 0 ? v : null;
}

/** Texto amigável: "2 un", "1,250 kg", "0,500 L". */
export function formatQuantity(q: QuantityMilli, unit: SaleUnit): string {
  if (unit === 'un') {
    if (q % MILLI === 0) return `${q / MILLI} un`;
    return `${formatMilli(q)} un`;
  }
  return `${formatMilli(q)} ${unit === 'kg' ? 'kg' : 'L'}`;
}

export function formatMilli(q: QuantityMilli): string {
  const int = Math.trunc(q / MILLI);
  const frac = String(Math.abs(q % MILLI)).padStart(3, '0');
  return `${int},${frac}`;
}

export function quantityToInput(q: QuantityMilli, unit: SaleUnit): string {
  if (unit === 'un') return String(Math.round(q / MILLI));
  return formatMilli(q);
}

export type RoundingMode = 'half_up' | 'truncate';

/**
 * Subtotal = preço por unidade de venda × quantidade.
 * Para itens pesados o resultado é arredondado ao centavo (meio para cima por padrão).
 * Alguns PDVs truncam; por isso a conferência aceita a diferença de 1 centavo entre os modos.
 */
export function lineSubtotal(
  unitPriceCents: Cents,
  quantityMilli: QuantityMilli,
  mode: RoundingMode = 'half_up',
): Cents {
  const product = unitPriceCents * quantityMilli;
  if (!Number.isSafeInteger(product)) throw new Error('Valor fora do intervalo suportado');
  return mode === 'half_up' ? divRoundHalfUp(product, MILLI) : divTruncate(product, MILLI);
}

/** Possíveis subtotais aceitáveis conforme o modo de arredondamento do PDV. */
export function acceptableSubtotals(unitPriceCents: Cents, quantityMilli: QuantityMilli): Cents[] {
  const a = lineSubtotal(unitPriceCents, quantityMilli, 'half_up');
  const b = lineSubtotal(unitPriceCents, quantityMilli, 'truncate');
  return a === b ? [a] : [a, b];
}

/* ------------------------------------------------------------------ */
/* Conteúdo da embalagem (peso/volume declarado no produto)            */
/* ------------------------------------------------------------------ */

export type PackageMeasure = { amount: number; unit: 'g' | 'ml' | 'un' };

/**
 * Extrai o conteúdo declarado de uma descrição: "ARROZ 5KG" → 5000 g; "LEITE 1L" → 1000 ml;
 * "SABAO PO 1,6KG" → 1600 g; "OVOS C/12" → 12 un. Retorna o valor normalizado
 * (gramas, mililitros ou unidades) para permitir comparar "5KG" com "5000G".
 */
export function extractPackageMeasure(text: string): PackageMeasure | null {
  const t = text.toUpperCase().replace(/(\d)\s+(?=(KG|G|GR|MG|ML|L|LT|LTS|LITROS?|UN)\b)/g, '$1');
  const re = /(\d+(?:[.,]\d+)?)(KG|GR|G|MG|ML|LTS|LT|LITROS?|L)\b/g;
  let match: RegExpExecArray | null;
  let last: PackageMeasure | null = null;
  while ((match = re.exec(t))) {
    const num = match[1].replace(',', '.');
    const [i, f = ''] = num.split('.');
    // milésimos para evitar ponto flutuante
    const milli = Number(i) * 1000 + Number((f + '000').slice(0, 3));
    const u = match[2];
    if (u === 'KG') last = { amount: milli, unit: 'g' };
    else if (u === 'G' || u === 'GR') last = { amount: Math.round(milli / 1000), unit: 'g' };
    else if (u === 'MG') last = { amount: Math.round(milli / 1_000_000), unit: 'g' };
    else if (u === 'ML') last = { amount: Math.round(milli / 1000), unit: 'ml' };
    else last = { amount: milli, unit: 'ml' };
  }
  if (last) return last;
  const pack = /\bC\/\s?(\d{1,3})\b/.exec(t);
  if (pack) return { amount: Number(pack[1]), unit: 'un' };
  return null;
}

export function formatPackageMeasure(m: PackageMeasure): string {
  if (m.unit === 'un') return `${m.amount} un`;
  if (m.unit === 'g') return m.amount >= 1000 ? `${formatTrim(m.amount)} kg` : `${m.amount} g`;
  return m.amount >= 1000 ? `${formatTrim(m.amount)} L` : `${m.amount} mL`;
}

function formatTrim(milli: number): string {
  const int = Math.trunc(milli / 1000);
  const frac = String(milli % 1000).padStart(3, '0').replace(/0+$/, '');
  return frac ? `${int},${frac}` : `${int}`;
}

/** true/false quando ambas as medidas são conhecidas; null quando não é possível afirmar. */
export function samePackage(a: PackageMeasure | null, b: PackageMeasure | null): boolean | null {
  if (!a || !b) return null;
  return a.unit === b.unit && a.amount === b.amount;
}

/** Normaliza unidades impressas em cupons (UN, KG, PC, CX, LT...). */
export function normalizeReceiptUnit(raw: string | null | undefined): SaleUnit {
  const u = (raw ?? '').toUpperCase();
  if (u === 'KG' || u === 'G' || u === 'GR') return 'kg';
  if (u === 'L' || u === 'LT' || u === 'ML') return 'l';
  return 'un';
}
