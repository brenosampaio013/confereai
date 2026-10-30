/**
 * Comparação de descrições de produtos entre o carrinho e o cupom.
 * Cupons usam abreviações ("LT INT ITALAC 1L"), então a comparação é por tokens com
 * prefixos. Medidas de embalagem diferentes (1 kg × 500 g) impedem a correspondência.
 */
import { extractPackageMeasure, samePackage } from './units';

const ABBREVIATIONS: Record<string, string> = {
  LT: 'LEITE',
  INT: 'INTEGRAL',
  DESN: 'DESNATADO',
  SEMI: 'SEMIDESNATADO',
  REFRIG: 'REFRIGERANTE',
  REF: 'REFRIGERANTE',
  ARR: 'ARROZ',
  FEIJ: 'FEIJAO',
  ACUC: 'ACUCAR',
  CHOC: 'CHOCOLATE',
  BISC: 'BISCOITO',
  DET: 'DETERGENTE',
  SAB: 'SABAO',
  AMAC: 'AMACIANTE',
  MARG: 'MARGARINA',
  MAC: 'MACARRAO',
  OL: 'OLEO',
  CAF: 'CAFE',
  QJO: 'QUEIJO',
  PRES: 'PRESUNTO',
  IOG: 'IOGURTE',
  REQ: 'REQUEIJAO',
  CERV: 'CERVEJA',
  PAP: 'PAPEL',
  HIG: 'HIGIENICO',
  TP1: 'TIPO1',
  CX: 'CAIXA',
  PCT: 'PACOTE',
  FRANG: 'FRANGO',
};

const STOPWORDS = new Set(['DE', 'DA', 'DO', 'DAS', 'DOS', 'E', 'C', 'COM', 'SEM', 'UN', 'UND', 'UNID', 'PCT', 'PACOTE', 'CAIXA', 'EMB', 'TIPO']);
const MEASURE_TOKEN = /^\d+([.,]\d+)?(KG|G|GR|MG|ML|L|LT|LTS|UN)?$/;

export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase();
}

export function tokenize(s: string): string[] {
  const t = normalizeText(s)
    .replace(/(\d)\s+(KG|G|GR|ML|L|LT)\b/g, '$1$2')
    .replace(/TIPO\s*1/g, 'TIPO1')
    .split(/[^A-Z0-9]+/)
    .filter(Boolean)
    .map((w) => ABBREVIATIONS[w] ?? w)
    .filter((w) => !STOPWORDS.has(w) && !MEASURE_TOKEN.test(w) && w.length > 1);
  return Array.from(new Set(t));
}

function tokensMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 3 && long.startsWith(short);
}

/** Coeficiente de Dice sobre tokens, aceitando prefixos (abreviações). 0–1. */
export function descriptionSimilarity(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (!ta.length || !tb.length) return 0;
  const used = new Set<number>();
  let matches = 0;
  for (const x of ta) {
    const j = tb.findIndex((y, idx) => !used.has(idx) && tokensMatch(x, y));
    if (j >= 0) {
      used.add(j);
      matches++;
    }
  }
  return (2 * matches) / (ta.length + tb.length);
}

/**
 * Similaridade considerando a embalagem: retorna 0 quando as medidas declaradas
 * são conhecidas e diferentes (ex.: 1 kg × 500 g).
 */
export function productSimilarity(cartText: string, receiptText: string, cartPackage?: string | null): number {
  const pa = extractPackageMeasure(cartPackage ? `${cartText} ${cartPackage}` : cartText);
  const pb = extractPackageMeasure(receiptText);
  if (samePackage(pa, pb) === false) return 0;
  const base = descriptionSimilarity(cartText, receiptText);
  return samePackage(pa, pb) === true ? Math.min(1, base + 0.1) : base;
}
