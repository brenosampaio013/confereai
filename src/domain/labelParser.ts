/**
 * Interpretação do texto de etiquetas de gôndola. O resultado é sempre uma sugestão a ser
 * revisada pelo usuário: o preço por kg/L nunca é confundido com o preço da embalagem, e
 * preços promocionais exigem a confirmação das condições.
 */
import { Cents, parseBRL } from './money';
import { extractPackageMeasure, PackageMeasure } from './units';
import { normalizeText } from './matching';

export interface LabelReading {
  productName: string | null;
  brand: string | null;
  barcode: string | null;
  /** Preço da embalagem/unidade (sem promoção). */
  regularPriceCents: Cents | null;
  /** Preço promocional, quando a etiqueta apresenta "DE ... POR ..." ou destaque de oferta. */
  promoPriceCents: Cents | null;
  /** Condições encontradas (ex.: "LEVE 3 PAGUE 2", "VÁLIDO ATÉ 31/10", "CLUBE"). */
  promoConditions: string[];
  /** Preço por unidade de medida (R$/kg, R$/L, R$/100 g...). */
  referencePrice: { cents: Cents; per: 'kg' | 'l' | '100g' | '100ml' | 'un' } | null;
  packageMeasure: PackageMeasure | null;
  /** A etiqueta indica venda por peso (somente preço por kg). */
  soldByWeight: boolean;
  /** Campos que não puderam ser lidos com segurança. */
  missing: ('name' | 'price')[];
  notes: string[];
}

const PRICE_RE = /(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+[.,]\d{2})/g;
const PER_RE = /(?:R\$\s*)?\/?\s*(KG|KILO|QUILO|L|LT|LITRO|100\s?G|100\s?GR|100\s?ML|UN|UNID)\b/;
const PROMO_KEYWORDS = /(LEVE\s+\d+\s+PAGUE\s+\d+|A\s+PARTIR\s+DE\s+\d+\s*\w*|ACIMA\s+DE\s+\d+\s*\w*|CLUBE[^\d]*|CART[AÃ]O[^\d]*|S[OÓ]CIO[^\d]*|APP[^\d]*|V[AÁ]LID[OA]\s+(AT[EÉ]|DE)\s+[\d/]+(\s+A\s+[\d/]+)?|ENQUANTO\s+DURAR(EM)?\s+OS\s+ESTOQUES|LIMITE\s+DE\s+\d+\s*\w*|\d+\s*UN(IDADES)?\s+POR\s+\w+|NA\s+COMPRA\s+DE\s+\d+\s*\w*)/g;

export function parseLabel(lines: string[]): LabelReading {
  const clean = lines.map((l) => normalizeText(l).replace(/\s+/g, ' ').trim()).filter(Boolean);
  const notes: string[] = [];
  let regular: Cents | null = null;
  let promo: Cents | null = null;
  let reference: LabelReading['referencePrice'] = null;
  const conditions = new Set<string>();
  const productPrices: Cents[] = [];

  for (const line of clean) {
    for (const m of line.matchAll(PROMO_KEYWORDS)) conditions.add(m[0].trim());

    const deRe = /\bDE\s*:?\s*(?:R\$\s*)?(\d+[.,]\d{2})\s*(?:POR|PARA)\s*:?\s*(?:R\$\s*)?(\d+[.,]\d{2})/;
    const de = deRe.exec(line);
    if (de) {
      regular = parseBRL(de[1]);
      promo = parseBRL(de[2]);
      continue;
    }
    const prices = Array.from(line.matchAll(PRICE_RE));
    if (!prices.length) continue;
    for (const p of prices) {
      const after = line.slice((p.index ?? 0) + p[0].length, (p.index ?? 0) + p[0].length + 12);
      const before = line.slice(Math.max(0, (p.index ?? 0) - 14), p.index ?? 0);
      const perMatch = PER_RE.exec(after.trim().startsWith('/') || /^\s*(\/|POR|O)\s*/.test(after) ? after : '') ?? (/(PRE[CÇ]O\s+(POR|DO|P\/)|R\$\s*\/|\/\s*$)/.test(before) ? PER_RE.exec(before) : null);
      const cents = parseBRL(p[1]);
      if (cents == null) continue;
      if (perMatch) {
        const u = perMatch[1].replace(/\s/g, '');
        const per = /KG|KILO|QUILO/.test(u) ? 'kg' : /^100G/.test(u) ? '100g' : /^100ML/.test(u) ? '100ml' : /UN/.test(u) ? 'un' : 'l';
        if (per !== 'un') {
          reference = { cents, per };
          continue;
        }
      }
      if (/OFERTA|PROMO|POR\s*$|AGORA/.test(before)) {
        promo = cents;
        continue;
      }
      productPrices.push(cents);
    }
  }

  if (regular == null && productPrices.length) {
    if (productPrices.length >= 2 && promo == null) {
      // Dois preços sem rótulo: o maior tende a ser o normal e o menor o promocional,
      // mas isso é incerto e precisa ser confirmado.
      const sorted = [...new Set(productPrices)].sort((a, b) => b - a);
      regular = sorted[0];
      if (sorted.length > 1) {
        promo = sorted[sorted.length - 1];
        notes.push('A etiqueta tem mais de um preço. Confirme qual é o preço normal e qual é o promocional.');
      }
    } else {
      regular = productPrices[0];
    }
  }

  const barcode = clean.map((l) => l.replace(/\s/g, '')).find((l) => /^\d{8}$|^\d{12,14}$/.test(l)) ?? null;
  const textLines = clean.filter(
    (l) =>
      /[A-Z]{3,}/.test(l) &&
      !new RegExp(PRICE_RE.source).test(l) &&
      !/^(OFERTA|PROMO|PRECO|R\$|DE |POR )/.test(l) &&
      !new RegExp(PROMO_KEYWORDS.source).test(l) &&
      !/(R\$\s*\/|\/\s*(KG|L|LT|100\s?G|100\s?ML)\b)/.test(l),
  );
  const productName = textLines.sort((a, b) => b.length - a.length)[0] ?? null;
  const packageMeasure = extractPackageMeasure(clean.join(' '));
  const soldByWeight = reference?.per === 'kg' && regular == null && promo == null;
  if (soldByWeight) notes.push('A etiqueta mostra apenas o preço por quilo: o produto parece ser vendido por peso.');
  if (reference && (regular != null || promo != null)) notes.push('O preço por kg/L é apenas referência e não foi usado como preço da embalagem.');
  if (promo != null) notes.push('Preço promocional encontrado. Confirme se você atende às condições da oferta antes de usá-lo.');

  const missing: LabelReading['missing'] = [];
  if (!productName) missing.push('name');
  if (regular == null && promo == null && !soldByWeight) missing.push('price');

  return {
    productName,
    brand: null,
    barcode,
    regularPriceCents: regular,
    promoPriceCents: promo,
    promoConditions: Array.from(conditions),
    referencePrice: reference,
    packageMeasure,
    soldByWeight,
    missing,
    notes,
  };
}
