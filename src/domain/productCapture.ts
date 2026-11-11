/**
 * Leitura da foto "produto + etiqueta de preço" feita pela IA.
 *
 * A IA devolve os textos como estão impressos (preços como "28,99"); a conversão para
 * centavos e todas as validações são feitas aqui, por regras fixas. Nada é salvo sem o
 * usuário conferir: o resultado só preenche o formulário de revisão.
 */
import { isValidGtin } from './cart';
import type { LabelReading } from './labelParser';
import { Cents, parseBRL } from './money';
import { extractPackageMeasure } from './units';

/** Resposta bruta do serviço (todos os campos são opcionais e não confiáveis). */
export interface RawProductCapture {
  product_name?: string | null;
  brand?: string | null;
  package_text?: string | null;
  barcode?: string | null;
  regular_price?: string | null;
  promo_price?: string | null;
  price_basis?: string | null;
  reference_price?: string | null;
  reference_per?: string | null;
  promo_conditions?: string[] | null;
  label_matches_product?: string | null;
  uncertain_fields?: string[] | null;
}

export type Association = 'match' | 'uncertain' | 'no_label' | 'no_product';

export interface CaptureReading extends LabelReading {
  association: Association;
  /** Campos que a IA marcou como incertos (nomes em português para exibição). */
  uncertain: string[];
}

const MAX_PRICE: Cents = 10_000_000; // R$ 100.000,00: acima disso é erro de leitura

const text = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.replace(/\s+/g, ' ').trim();
  if (!t || /^\[?ileg[ií]vel\]?$/i.test(t) || /^(null|n\/a|desconhecid[oa])$/i.test(t)) return null;
  return t.slice(0, max);
};

const price = (v: unknown): Cents | null => {
  const t = text(v, 20);
  if (!t) return null;
  const c = parseBRL(t.replace(/^R\$\s*/i, ''));
  return c != null && c > 0 && c <= MAX_PRICE ? c : null;
};

const FIELD_LABEL: Record<string, string> = {
  product_name: 'nome',
  brand: 'marca',
  package_text: 'peso/volume',
  barcode: 'código de barras',
  regular_price: 'preço normal',
  promo_price: 'preço promocional',
  reference_price: 'preço por kg/L',
  promo_conditions: 'condições da promoção',
};

export function normalizeProductCapture(raw: RawProductCapture | null | undefined): CaptureReading {
  const r = raw ?? {};
  const notes: string[] = [];
  let regular = price(r.regular_price);
  let promo = price(r.promo_price);
  const reference = price(r.reference_price);
  const basis = (text(r.price_basis, 10) ?? 'unit').toLowerCase();
  const perRaw = (text(r.reference_per, 10) ?? '').toLowerCase().replace(/\s/g, '');
  const per: NonNullable<LabelReading['referencePrice']>['per'] | null =
    perRaw === 'kg' ? 'kg' : perRaw === 'l' ? 'l' : perRaw === '100g' ? '100g' : perRaw === '100ml' ? '100ml' : null;

  // Promoção sem preço normal: o único preço lido é tratado como preço do produto.
  if (regular == null && promo != null && !(r.promo_conditions ?? []).length) {
    regular = promo;
    promo = null;
  }
  // Um "promocional" maior ou igual ao normal é leitura trocada: mantém o menor como promocional.
  if (regular != null && promo != null && promo >= regular) {
    if (promo === regular) promo = null;
    else {
      [regular, promo] = [promo, regular];
      notes.push('Os preços normal e promocional pareciam trocados na leitura. Confira os dois valores.');
    }
  }

  const soldByWeight = (basis === 'kg' || basis === 'l') && (regular != null || reference != null);
  let referencePrice: LabelReading['referencePrice'] = null;
  if (soldByWeight) {
    // Vendido por peso: o preço da etiqueta É o preço por kg/L.
    referencePrice = { cents: (promo ?? regular ?? reference)!, per: basis === 'l' ? 'l' : 'kg' };
  } else if (reference != null && per) {
    referencePrice = { cents: reference, per };
  }

  const digits = (text(r.barcode, 20) ?? '').replace(/\D/g, '');
  const barcode = isValidGtin(digits) ? digits : null;
  if (digits && !barcode) notes.push('O código de barras lido na foto não passou na verificação e foi descartado.');

  const assocRaw = (text(r.label_matches_product, 20) ?? '').toLowerCase();
  const association: Association =
    assocRaw === 'yes' ? 'match' : assocRaw === 'no_label' ? 'no_label' : assocRaw === 'no_product' ? 'no_product' : 'uncertain';
  if (association === 'uncertain') notes.push('Não foi possível confirmar que a etiqueta é deste produto. Confira se o preço é o do item fotografado.');
  if (association === 'no_label') notes.push('Nenhuma etiqueta de preço foi encontrada na foto. Digite o preço.');
  if (association === 'no_product') notes.push('A foto mostra só a etiqueta. Confira o nome do produto.');
  if (promo != null) notes.push('Preço promocional encontrado. Use-o apenas se você atende às condições da oferta.');
  if (soldByWeight) notes.push(`Produto vendido por ${basis === 'l' ? 'litro' : 'quilo'}: informe o peso/volume que você está levando.`);

  const productName = text(r.product_name, 200);
  const packageText = text(r.package_text, 40);
  const missing: LabelReading['missing'] = [];
  if (!productName) missing.push('name');
  if (regular == null && promo == null && !soldByWeight) missing.push('price');

  return {
    productName,
    brand: text(r.brand, 120),
    barcode,
    regularPriceCents: soldByWeight ? null : regular,
    promoPriceCents: soldByWeight ? null : promo,
    promoConditions: (Array.isArray(r.promo_conditions) ? r.promo_conditions : []).map((c) => text(c, 120)).filter((c): c is string => !!c).slice(0, 6),
    referencePrice,
    packageMeasure: packageText ? extractPackageMeasure(packageText) : null,
    soldByWeight,
    missing,
    notes,
    association,
    uncertain: (Array.isArray(r.uncertain_fields) ? r.uncertain_fields : []).map((f) => FIELD_LABEL[String(f)]).filter((f): f is string => !!f),
  };
}

/** Chave de identidade de um produto sem código de barras (nome + marca + embalagem). */
export function productIdentityKey(name: string, brand: string | null, packageAmount: number | null, packageUnit: string | null): string {
  const norm = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  return `${norm(name)}|${norm(brand ?? '')}|${packageAmount ?? ''}${packageAmount ? packageUnit ?? '' : ''}`;
}
