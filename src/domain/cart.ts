import { Cents, sumCents } from './money';
import type { CartItem } from './types';
import { isWeighed, lineSubtotal, MILLI, QuantityMilli } from './units';

/** Subtotal bruto do item: preço por unidade de venda × quantidade. */
export function itemGrossCents(item: Pick<CartItem, 'unitPriceCents' | 'quantityMilli'>): Cents {
  return lineSubtotal(item.unitPriceCents, item.quantityMilli);
}

/** Subtotal líquido (após desconto do item), nunca negativo. */
export function itemNetCents(
  item: Pick<CartItem, 'unitPriceCents' | 'quantityMilli' | 'discountCents'>,
): Cents {
  return Math.max(0, itemGrossCents(item) - item.discountCents);
}

export interface CartTotals {
  grossCents: Cents;
  discountCents: Cents;
  totalCents: Cents;
  /** Número de linhas no carrinho. */
  lineCount: number;
  /** Soma de unidades (itens pesados contam como 1). */
  unitCount: number;
}

export function cartTotals(items: readonly CartItem[]): CartTotals {
  const gross = sumCents(items.map(itemGrossCents));
  const net = sumCents(items.map(itemNetCents));
  return {
    grossCents: gross,
    discountCents: gross - net,
    totalCents: net,
    lineCount: items.length,
    unitCount: items.reduce(
      (acc, i) => acc + (isWeighed(i.saleUnit) ? 1 : Math.round(i.quantityMilli / MILLI)),
      0,
    ),
  };
}

export function validateItem(item: Pick<CartItem, 'name' | 'quantityMilli' | 'unitPriceCents' | 'discountCents' | 'saleUnit'>): string[] {
  const errors: string[] = [];
  if (!item.name.trim()) errors.push('Informe o nome do produto.');
  if (!Number.isInteger(item.quantityMilli) || item.quantityMilli <= 0) errors.push('A quantidade deve ser maior que zero.');
  if (item.saleUnit === 'un' && item.quantityMilli % MILLI !== 0) errors.push('Produtos vendidos por unidade aceitam apenas quantidades inteiras.');
  if (!Number.isInteger(item.unitPriceCents) || item.unitPriceCents < 0) errors.push('Informe um preço válido.');
  if (!Number.isInteger(item.discountCents) || item.discountCents < 0) errors.push('O desconto não pode ser negativo.');
  else if (item.quantityMilli > 0 && item.discountCents > lineSubtotal(item.unitPriceCents, item.quantityMilli)) {
    errors.push('O desconto não pode ser maior que o subtotal do item.');
  }
  return errors;
}

/** Passo padrão de +/− : 1 unidade ou 100 g / 100 mL para itens pesados. */
export function quantityStep(item: Pick<CartItem, 'saleUnit'>): QuantityMilli {
  return isWeighed(item.saleUnit) ? 100 : MILLI;
}

/**
 * Ajusta a quantidade. Retorna null quando a quantidade chegaria a zero
 * (a interface deve pedir confirmação para remover em vez de zerar silenciosamente).
 */
export function adjustQuantity(item: CartItem, deltaMilli: QuantityMilli): QuantityMilli | null {
  const next = item.quantityMilli + deltaMilli;
  if (next <= 0) return null;
  return next;
}

export function addItem(items: readonly CartItem[], item: CartItem): CartItem[] {
  if (items.some((i) => i.id === item.id)) return [...items];
  return [...items, item];
}

export function removeItem(items: readonly CartItem[], id: string): CartItem[] {
  return items.filter((i) => i.id !== id);
}

export function updateItem(items: readonly CartItem[], id: string, patch: Partial<CartItem>, now: string): CartItem[] {
  return items.map((i) => (i.id === id ? { ...i, ...patch, id: i.id, updatedAt: now } : i));
}

export function findByBarcode(items: readonly CartItem[], barcode: string): CartItem | undefined {
  return items.find((i) => i.barcode != null && sameGtin(i.barcode, barcode));
}

/** Compara códigos GTIN ignorando zeros à esquerda (UPC-A 12 ≡ EAN-13 com 0 inicial). */
export function sameGtin(a: string, b: string): boolean {
  const na = a.replace(/\D/g, '').replace(/^0+/, '');
  const nb = b.replace(/\D/g, '').replace(/^0+/, '');
  return na.length > 0 && na === nb;
}

/** Valida o dígito verificador de EAN-8, UPC-A, EAN-13 e GTIN-14. */
export function isValidGtin(code: string): boolean {
  if (!/^\d{8}$|^\d{12,14}$/.test(code)) return false;
  const digits = code.split('').map(Number);
  const check = digits.pop()!;
  let sum = 0;
  for (let i = digits.length - 1, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) sum += digits[i] * w;
  return (10 - (sum % 10)) % 10 === check;
}

/** Expande UPC-E (8 dígitos) para UPC-A, permitindo encontrar o mesmo produto. */
export function upcEToUpcA(upce: string): string | null {
  if (!/^[01]\d{7}$/.test(upce)) return null;
  const n = upce.slice(1, 7);
  const [d1, d2, d3, d4, d5, d6] = n.split('');
  let body: string;
  if (d6 === '0' || d6 === '1' || d6 === '2') body = `${d1}${d2}${d6}0000${d3}${d4}${d5}`;
  else if (d6 === '3') body = `${d1}${d2}${d3}00000${d4}${d5}`;
  else if (d6 === '4') body = `${d1}${d2}${d3}${d4}00000${d5}`;
  else body = `${d1}${d2}${d3}${d4}${d5}0000${d6}`;
  return `${upce[0]}${body}${upce[7]}`;
}

/** Normaliza o código lido pela câmera para armazenamento/busca. */
export function normalizeBarcode(raw: string, type?: string): string {
  const digits = raw.trim();
  if (type === 'upc_e' && /^\d{8}$/.test(digits)) return upcEToUpcA(digits) ?? digits;
  return digits;
}
