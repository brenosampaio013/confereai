/**
 * Regras e textos do marketplace de promoções (lado do aplicativo).
 * O servidor é a autoridade: aqui ficam apenas apresentação, validação prévia para dar
 * retorno imediato ao usuário e uma prévia da verificação de proximidade.
 */
import { Cents, formatBRL } from './money';

export type CategoryId =
  | 'carnes' | 'peixes' | 'hortifruti' | 'laticinios' | 'mercearia' | 'bebidas'
  | 'limpeza' | 'higiene' | 'congelados' | 'padaria' | 'pet';

export const CATEGORIES: { id: CategoryId; label: string; icon: string; color: string }[] = [
  { id: 'carnes', label: 'Carnes e aves', icon: 'restaurant-outline', color: '#B4413C' },
  { id: 'peixes', label: 'Peixes e frutos do mar', icon: 'fish-outline', color: '#2A6F97' },
  { id: 'hortifruti', label: 'Frutas e verduras', icon: 'leaf-outline', color: '#3A8F3E' },
  { id: 'laticinios', label: 'Laticínios', icon: 'water-outline', color: '#5B7DB1' },
  { id: 'mercearia', label: 'Mercearia', icon: 'basket-outline', color: '#A06A1B' },
  { id: 'bebidas', label: 'Bebidas', icon: 'wine-outline', color: '#7B4B94' },
  { id: 'limpeza', label: 'Limpeza', icon: 'sparkles-outline', color: '#1E8C93' },
  { id: 'higiene', label: 'Higiene', icon: 'happy-outline', color: '#C2577B' },
  { id: 'congelados', label: 'Congelados', icon: 'snow-outline', color: '#3D7EA6' },
  { id: 'padaria', label: 'Padaria', icon: 'cafe-outline', color: '#9C6B30' },
  { id: 'pet', label: 'Pet shop', icon: 'paw-outline', color: '#6B7A2E' },
];
export const categoryLabel = (id: string) => CATEGORIES.find((c) => c.id === id)?.label ?? id;

export type SaleUnitId = 'un' | 'kg' | '100g' | 'l' | 'pack';
export const SALE_UNITS: { id: SaleUnitId; label: string; suffix: string }[] = [
  { id: 'un', label: 'Unidade', suffix: '/un' },
  { id: 'kg', label: 'Quilo', suffix: '/kg' },
  { id: '100g', label: '100 g', suffix: '/100 g' },
  { id: 'l', label: 'Litro', suffix: '/L' },
  { id: 'pack', label: 'Pacote/leve-pague', suffix: '/pacote' },
];
export const unitSuffix = (u: string) => SALE_UNITS.find((s) => s.id === u)?.suffix ?? '';

export const PRODUCT_TYPES = [
  { id: 'packaged', label: 'Embalado' },
  { id: 'weighed', label: 'Pesado na hora' },
  { id: 'fresh', label: 'Fresco / hortifrúti' },
  { id: 'bulk', label: 'A granel' },
] as const;

export type ConditionType = 'any_customer' | 'loyalty_members' | 'store_app_payment' | 'min_quantity' | 'weekend_only' | 'limited_stock' | 'other';
export const CONDITIONS: { id: ConditionType; label: string; special: boolean }[] = [
  { id: 'any_customer', label: 'Válida para qualquer cliente', special: false },
  { id: 'loyalty_members', label: 'Somente clientes cadastrados', special: true },
  { id: 'store_app_payment', label: 'Pagamento no aplicativo do mercado', special: true },
  { id: 'min_quantity', label: 'Compra mínima', special: true },
  { id: 'weekend_only', label: 'Somente no fim de semana', special: true },
  { id: 'limited_stock', label: 'Enquanto durar o estoque', special: true },
  { id: 'other', label: 'Outra condição', special: true },
];
export const conditionLabel = (id: string, minQuantity?: number | null) =>
  id === 'min_quantity' && minQuantity ? `Compra mínima de ${minQuantity} unidades` : CONDITIONS.find((c) => c.id === id)?.label ?? id;

export const IMAGE_TYPES = [
  { id: 'price_tag', label: 'Etiqueta de preço', evidence: true },
  { id: 'promo_sign', label: 'Placa promocional', evidence: true },
  { id: 'store_ad', label: 'Anúncio do supermercado', evidence: true },
  { id: 'product', label: 'Produto', evidence: false },
] as const;
export type ImageType = (typeof IMAGE_TYPES)[number]['id'];

export const CONFIRMATION_TYPES = [
  { id: 'found', label: 'Encontrei essa promoção', positive: true },
  { id: 'price_correct', label: 'O preço está correto', positive: true },
  { id: 'price_different', label: 'O preço está diferente', positive: false },
  { id: 'ended', label: 'A promoção já acabou', positive: false },
  { id: 'not_found', label: 'Não encontrei esse produto', positive: false },
] as const;
export type ConfirmationType = (typeof CONFIRMATION_TYPES)[number]['id'];

export const REPORT_REASONS = [
  { id: 'wrong_price', label: 'Preço incorreto' },
  { id: 'nonexistent', label: 'Promoção inexistente' },
  { id: 'misleading_photo', label: 'Fotografia enganosa' },
  { id: 'wrong_store', label: 'Supermercado incorreto' },
  { id: 'expired', label: 'Oferta vencida' },
  { id: 'different_product', label: 'Produto diferente da descrição' },
  { id: 'inappropriate', label: 'Conteúdo inadequado' },
  { id: 'spam', label: 'Spam' },
  { id: 'fraud', label: 'Publicação fraudulenta' },
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number]['id'];

export type PromotionStatus = 'draft' | 'pending_review' | 'published' | 'partially_verified' | 'community_confirmed' | 'contested' | 'expired' | 'removed';
export const STATUS_LABEL: Record<PromotionStatus, string> = {
  draft: 'Rascunho',
  pending_review: 'Aguardando análise',
  published: 'Publicada',
  partially_verified: 'Verificada parcialmente',
  community_confirmed: 'Confirmada pela comunidade',
  contested: 'Contestada',
  expired: 'Expirada',
  removed: 'Removida',
};

export const REPUTATION_LABEL: Record<string, string> = {
  new: 'Novo colaborador',
  active: 'Colaborador ativo',
  trusted: 'Colaborador confiável',
  highlight: 'Colaborador destaque',
};

export type LocationStatus = 'compatible' | 'far' | 'low_accuracy' | 'unavailable';

/* ------------------------------------------------------------------ */
/* Indicadores de verificação: sempre separados, nunca um selo genérico */
/* ------------------------------------------------------------------ */

export interface VerificationFlags {
  location_compatible: boolean;
  photo_verified: boolean;
  community_confirmed: boolean;
  moderator_verified: boolean;
  independent_confirmations: number;
}

export interface Badge {
  key: 'location' | 'photo' | 'community' | 'moderation';
  label: string;
  detail: string;
  icon: string;
}

export function verificationBadges(f: VerificationFlags): Badge[] {
  const out: Badge[] = [];
  if (f.location_compatible) {
    out.push({ key: 'location', label: 'Localização compatível', icon: 'location-outline', detail: 'Quem publicou estava perto desta unidade no momento da publicação. Isso não comprova o preço.' });
  }
  if (f.photo_verified) {
    out.push({ key: 'photo', label: 'Comprovada por foto', icon: 'camera-outline', detail: 'A foto da etiqueta ou do material promocional foi analisada e aceita pela moderação.' });
  }
  if (f.community_confirmed) {
    out.push({ key: 'community', label: 'Confirmada pela comunidade', icon: 'people-outline', detail: `${f.independent_confirmations} pessoas diferentes confirmaram a oferta na loja.` });
  }
  if (f.moderator_verified) {
    out.push({ key: 'moderation', label: 'Verificada pela moderação', icon: 'shield-checkmark-outline', detail: 'Um moderador analisou as evidências e aprovou a publicação.' });
  }
  return out;
}

/** Texto honesto quando não há confirmação suficiente. */
export function confirmationText(count: number, minRequired = 3): string {
  if (count === 0) return 'Ainda sem confirmações de outras pessoas.';
  if (count < minRequired) return `${count} ${count === 1 ? 'confirmação' : 'confirmações'} de outras pessoas (ainda não é suficiente para considerar confirmada).`;
  return `${count} confirmações de pessoas diferentes.`;
}

/* ------------------------------------------------------------------ */
/* Preço                                                               */
/* ------------------------------------------------------------------ */

export const formatOfferPrice = (cents: Cents, unit: string) => `${formatBRL(cents)}${unitSuffix(unit)}`;

/**
 * Desconto só é mostrado quando o preço anterior foi informado E há comprovação aceita
 * (foto aceita ou moderação). Sem isso, o preço anterior aparece apenas como informado.
 */
export function discountInfo(regular: Cents | null, promo: Cents, proven: boolean): { percent: number | null; regularText: string | null } {
  if (regular == null || regular <= promo) return { percent: null, regularText: null };
  if (!proven) return { percent: null, regularText: `Preço anterior informado por quem publicou: ${formatBRL(regular)}` };
  return { percent: Math.floor(((regular - promo) * 100) / regular), regularText: `Antes: ${formatBRL(regular)}` };
}

/* ------------------------------------------------------------------ */
/* Geolocalização (prévia; o servidor recalcula)                        */
/* ------------------------------------------------------------------ */

export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371008.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const a = Math.sin(toRad(lat2 - lat1) / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lng2 - lng1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Mesma regra do servidor (evaluate_location). */
export function previewLocationStatus(distanceM: number, accuracyM: number, radiusM = 200, maxAccuracyM = 100): LocationStatus {
  if (accuracyM > maxAccuracyM) return 'low_accuracy';
  if (distanceM - Math.min(accuracyM, maxAccuracyM) > radiusM) return 'far';
  if (distanceM > radiusM) return 'low_accuracy';
  return 'compatible';
}

export const LOCATION_MESSAGE: Record<LocationStatus, { title: string; text: string; tone: 'green' | 'yellow' | 'red' | 'neutral' }> = {
  compatible: { title: 'Localização compatível', text: 'Você está perto da unidade escolhida. A oferta recebe o indicador de localização compatível.', tone: 'green' },
  far: { title: 'Você parece estar longe do estabelecimento', text: 'Confira se escolheu a unidade certa. Se publicar assim, a oferta não recebe a verificação de localização e passa por análise.', tone: 'red' },
  low_accuracy: { title: 'Localização imprecisa', text: 'O GPS ainda não está preciso o bastante. Aguarde alguns segundos ao ar livre ou perto de uma janela e tente de novo.', tone: 'yellow' },
  unavailable: { title: 'Sem localização', text: 'Sem a localização, a oferta não recebe a verificação de proximidade e passa por análise antes de aparecer para todos.', tone: 'neutral' },
};

export function formatDistance(km: number | null | undefined): string | null {
  if (km == null) return null;
  if (km < 1) return `${Math.max(10, Math.round((km * 1000) / 10) * 10)} m`;
  return `${km < 10 ? km.toFixed(1).replace('.', ',') : Math.round(km)} km`;
}

/* ------------------------------------------------------------------ */
/* Datas                                                               */
/* ------------------------------------------------------------------ */

export function relativeTime(iso: string, now = Date.now()): string {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'agora mesmo';
  if (min < 60) return `há ${min} ${min === 1 ? 'minuto' : 'minutos'}`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} ${h === 1 ? 'hora' : 'horas'}`;
  const d = Math.floor(h / 24);
  return `há ${d} ${d === 1 ? 'dia' : 'dias'}`;
}

/** "2026-11-10" → "10/11/2026" */
export const formatDateBR = (isoDate: string) => {
  const [y, m, d] = isoDate.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};

export function validityText(endsOn: string, startsOn?: string, today = localToday()): string {
  if (startsOn && startsOn > today) return `Começa em ${formatDateBR(startsOn)}, até ${formatDateBR(endsOn)}`;
  if (endsOn === today) return 'Válida até hoje';
  if (endsOn < today) return `Encerrada em ${formatDateBR(endsOn)}`;
  return `Válida até ${formatDateBR(endsOn)}`;
}

export function localToday(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return localToday(new Date(y, m - 1, d + days));
}

/** "10/11/2026" → "2026-11-10" (ou null se inválida). */
export function parseDateBR(s: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim());
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return localToday(dt);
}

/* ------------------------------------------------------------------ */
/* Rascunho da publicação                                              */
/* ------------------------------------------------------------------ */

export interface PromotionDraft {
  productName: string;
  brand: string;
  category: CategoryId | null;
  packageLabel: string;
  productType: (typeof PRODUCT_TYPES)[number]['id'];
  barcode: string;
  description: string;
  photos: { uri: string; type: ImageType; width: number; height: number }[];
  promoPriceCents: Cents | null;
  regularPriceCents: Cents | null;
  saleUnit: SaleUnitId;
  minQuantity: number | null;
  conditionTypes: ConditionType[];
  conditions: string;
  startsOn: string;
  endsOn: string;
  locationId: string | null;
}

export const MAX_PHOTOS = 5;
export const MAX_VALIDITY_DAYS = 60;

export function emptyDraft(today = localToday()): PromotionDraft {
  return {
    productName: '', brand: '', category: null, packageLabel: '', productType: 'packaged', barcode: '', description: '',
    photos: [], promoPriceCents: null, regularPriceCents: null, saleUnit: 'un', minQuantity: null,
    conditionTypes: ['any_customer'], conditions: '', startsOn: today, endsOn: addDays(today, 3), locationId: null,
  };
}

export type DraftStep = 'product' | 'photos' | 'price' | 'store';

export function validateStep(step: DraftStep, d: PromotionDraft, today = localToday()): string[] {
  const e: string[] = [];
  if (step === 'product') {
    if (d.productName.trim().length < 2) e.push('Informe o nome do produto.');
    if (!d.category) e.push('Escolha a categoria.');
    if (d.barcode && !/^\d{8,14}$/.test(d.barcode)) e.push('O código de barras deve ter de 8 a 14 números.');
  }
  if (step === 'photos') {
    if (!d.photos.some((p) => IMAGE_TYPES.find((t) => t.id === p.type)?.evidence)) e.push('Adicione pelo menos uma foto da etiqueta, da placa ou do anúncio da oferta.');
    if (d.photos.length > MAX_PHOTOS) e.push(`Use no máximo ${MAX_PHOTOS} fotos.`);
  }
  if (step === 'price') {
    if (!d.promoPriceCents || d.promoPriceCents <= 0) e.push('Informe o preço promocional.');
    if (d.regularPriceCents != null && d.promoPriceCents != null && d.regularPriceCents <= d.promoPriceCents) e.push('O preço anterior deve ser maior que o promocional.');
    if (d.conditionTypes.length === 0) e.push('Escolha as condições da promoção.');
    if (d.conditionTypes.includes('any_customer') && d.conditionTypes.length > 1) e.push('"Qualquer cliente" não combina com condições especiais.');
    if (d.conditionTypes.includes('min_quantity') && !(d.minQuantity && d.minQuantity >= 1)) e.push('Informe a quantidade mínima.');
    if (d.conditionTypes.includes('other') && !d.conditions.trim()) e.push('Descreva a condição da promoção.');
    if (d.endsOn < today) e.push('A data de encerramento já passou.');
    if (d.endsOn < d.startsOn) e.push('O encerramento deve ser depois do início.');
    if (d.endsOn > addDays(d.startsOn, MAX_VALIDITY_DAYS)) e.push(`A validade máxima é de ${MAX_VALIDITY_DAYS} dias.`);
  }
  if (step === 'store' && !d.locationId) e.push('Escolha a unidade do supermercado.');
  return e;
}

/** Valida a imagem escolhida antes de enviar. */
export function validatePickedImage(a: { width?: number; height?: number; mimeType?: string | null; fileSize?: number | null }): string | null {
  if (!a.width || !a.height || a.width < 200 || a.height < 200) return 'Imagem muito pequena ou vazia. Fotografe de novo, mais de perto.';
  if (a.mimeType && !/^image\/(jpeg|jpg|png|webp|heic|heif)$/i.test(a.mimeType)) return 'Formato de arquivo não aceito. Use uma foto (JPEG, PNG ou WebP).';
  if (a.fileSize != null && a.fileSize > 25 * 1024 * 1024) return 'Arquivo grande demais (máximo 25 MB).';
  return null;
}
