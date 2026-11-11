import type { Cents } from './money';
import type { QuantityMilli, SaleUnit } from './units';

export type PriceSource =
  | 'manual' // digitado pelo usuário
  | 'label_ocr' // lido da etiqueta e confirmado pelo usuário
  | 'photo_ai' // identificado pela IA na foto do produto com a etiqueta, confirmado pelo usuário
  | 'previous' // preço registrado anteriormente pelo usuário, reconfirmado
  | 'receipt'; // valor vindo do cupom fiscal (correção a partir da nota)

export const PRICE_SOURCE_LABEL: Record<PriceSource, string> = {
  manual: 'Digitado',
  label_ocr: 'Etiqueta (OCR)',
  photo_ai: 'Foto (IA)',
  previous: 'Preço anterior',
  receipt: 'Cupom fiscal',
};

export interface Product {
  id: string;
  barcode: string | null;
  name: string;
  brand: string | null;
  category: string | null;
  /** Conteúdo declarado, ex.: 5000 (g) para 5 kg. */
  packageAmount: number | null;
  packageUnit: 'g' | 'ml' | 'un' | null;
  /** Como o produto é vendido. */
  saleUnit: SaleUnit;
  imageUri: string | null;
  /** Origem do cadastro: usuário, base pública (Open Food Facts) ou base da comunidade do Confere Aí. */
  source: 'user' | 'open_food_facts' | 'community';
  createdAt: string;
  updatedAt: string;
}

export interface CartItem {
  id: string;
  purchaseId: string;
  productId: string | null;
  barcode: string | null;
  /** Nome no momento do registro (o cadastro pode mudar depois). */
  name: string;
  brand: string | null;
  packageLabel: string | null;
  saleUnit: SaleUnit;
  quantityMilli: QuantityMilli;
  /** Preço por unidade de venda (por unidade, por kg ou por litro). */
  unitPriceCents: Cents;
  /** Desconto total do item (não por unidade). */
  discountCents: Cents;
  priceSource: PriceSource;
  /** Preço normal (sem promoção) quando o preço registrado é promocional. */
  regularPriceCents: Cents | null;
  /** Condições da promoção, quando o preço é promocional. */
  promoNote: string | null;
  addedVia: 'scan' | 'manual';
  createdAt: string;
  updatedAt: string;
}

export type PurchaseStatus = 'active' | 'checked' | 'closed';

export interface Purchase {
  id: string;
  storeName: string | null;
  storeCnpj: string | null;
  /** Unidade cadastrada (marketplace) à qual a compra foi vinculada, se houver. */
  storeLocationId: string | null;
  /** Orçamento planejado para a compra, em centavos. */
  budgetCents: Cents | null;
  status: PurchaseStatus;
  /** 'cart' quando os produtos foram registrados; 'receipt_only' quando só a nota foi conferida. */
  mode: 'cart' | 'receipt_only';
  startedAt: string;
  closedAt: string | null;
  updatedAt: string;
}

/* ------------------------------------------------------------------ */
/* Cupom fiscal                                                        */
/* ------------------------------------------------------------------ */

export type FieldIssue =
  | 'missing_quantity'
  | 'missing_unit_price'
  | 'missing_total'
  | 'math_mismatch'
  | 'possible_overlap'
  | 'unreadable'
  | 'ambiguous_discount';

export interface ReceiptItem {
  id: string;
  /** Número sequencial impresso (001, 002...) quando legível. */
  seq: number | null;
  code: string | null;
  description: string;
  quantityMilli: QuantityMilli | null;
  unit: SaleUnit;
  rawUnit: string | null;
  unitPriceCents: Cents | null;
  /** Valor total da linha (antes de desconto do item). */
  totalCents: Cents | null;
  /** Desconto aplicado especificamente a este item (positivo). */
  discountCents: Cents;
  /** Acréscimo aplicado a este item. */
  surchargeCents: Cents;
  /** 0–1. Abaixo de 0.75 exige revisão. */
  confidence: number;
  issues: FieldIssue[];
  /** Índice da imagem (parte do cupom) de onde a linha veio. */
  sourcePart: number;
  rawLines: string[];
  /** Usuário revisou/editou manualmente. */
  userEdited: boolean;
}

export interface ReceiptTotals {
  itemCount: number | null;
  subtotalCents: Cents | null;
  discountCents: Cents | null;
  surchargeCents: Cents | null;
  totalCents: Cents | null;
}

export interface ParsedReceipt {
  storeName: string | null;
  cnpj: string | null;
  issuedAt: string | null; // ISO local "2026-10-30T14:22:10"
  accessKey: string | null;
  items: ReceiptItem[];
  /** Descontos que não puderam ser atribuídos a um item específico. */
  unassignedDiscountCents: Cents;
  totals: ReceiptTotals;
  /** Linhas que pareciam relevantes mas não foram interpretadas. */
  unparsedLines: string[];
  warnings: string[];
}

/* ------------------------------------------------------------------ */
/* Conferência                                                         */
/* ------------------------------------------------------------------ */

export type Severity = 'green' | 'yellow' | 'red';

export type DivergenceKind =
  | 'possible_duplicate'
  | 'quantity_more'
  | 'quantity_less'
  | 'price_higher'
  | 'price_lower'
  | 'not_in_cart'
  | 'not_in_receipt'
  | 'discount'
  | 'total_mismatch'
  | 'math_mismatch'
  | 'needs_review'
  | 'match_uncertain';

export type DivergenceGroup =
  | 'ok'
  | 'duplicates'
  | 'quantity'
  | 'price'
  | 'not_found'
  | 'discounts'
  | 'review';

export type Resolution = 'open' | 'confirmed_ok' | 'flag_cashier' | 'dismissed';

export interface Divergence {
  /** Chave estável (independe de nova execução) para preservar resoluções. */
  key: string;
  kind: DivergenceKind;
  group: DivergenceGroup;
  severity: Severity;
  title: string;
  explanation: string;
  cartItemId: string | null;
  receiptItemIds: string[];
  /** Diferença potencial em centavos (positivo = cobrado a mais). Null quando não calculável. */
  potentialDiffCents: Cents | null;
  resolution: Resolution;
}

export type MatchMethod = 'barcode' | 'manual' | 'description';

export interface ItemMatch {
  cartItemId: string;
  receiptItemIds: string[];
  method: MatchMethod;
  /** Correspondência por descrição sem preço/medida que confirmem. */
  uncertain: boolean;
}

export interface ReconciliationReport {
  scenario: 'cart_vs_receipt' | 'receipt_only';
  overall: Severity;
  complete: boolean;
  cartTotalCents: Cents | null;
  receiptTotalCents: Cents | null;
  /** Total da nota − total registrado. */
  differenceCents: Cents | null;
  itemsChecked: number;
  matches: ItemMatch[];
  okCartItemIds: string[];
  okReceiptItemIds: string[];
  divergences: Divergence[];
  limitations: string[];
  generatedAt: string;
}
