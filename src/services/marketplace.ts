/**
 * Acesso ao marketplace no Supabase. Toda regra importante é validada pelo servidor
 * (funções SQL); este módulo apenas chama as funções e traduz os erros.
 */
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Platform } from 'react-native';
import type { ConfirmationType, ImageType, LocationStatus, PromotionDraft, PromotionStatus, ReportReason } from '@/domain/marketplace';
import { isCloudConfigured } from '@/lib/config';
import { newId } from '@/lib/id';
import { getSupabase } from './supabase';

export class MarketplaceError extends Error {
  constructor(message: string, public code: 'not_configured' | 'needs_account' | 'server' | 'network' = 'server') {
    super(message);
  }
}

function client() {
  const sb = getSupabase();
  if (!sb || !isCloudConfigured()) {
    throw new MarketplaceError('O marketplace precisa do servidor do Confere Aí, que ainda não foi configurado neste aplicativo.', 'not_configured');
  }
  return sb;
}

function translate(e: { message?: string; code?: string } | null): never {
  const msg = e?.message ?? 'Erro desconhecido';
  if (/Failed to fetch|Network request failed|fetch failed/i.test(msg)) throw new MarketplaceError('Sem conexão com o servidor. Verifique a internet e tente novamente.', 'network');
  if (/Entre na sua conta|Crie uma conta|JWT|permission denied/i.test(msg)) throw new MarketplaceError('Entre na sua conta para participar do marketplace.', 'needs_account');
  if (/check constraint/i.test(msg)) throw new MarketplaceError('Alguns dados não são válidos. Revise as informações.');
  throw new MarketplaceError(msg);
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await client().rpc(fn, args);
  if (error) translate(error);
  return data as T;
}

export async function hasAccount(): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  const { data } = await sb.auth.getSession();
  return !!data.session && !data.session.user.is_anonymous;
}

/* ------------------------------------------------------------------ */
/* Tipos                                                               */
/* ------------------------------------------------------------------ */

export interface OfferRow {
  id: string;
  product_name: string;
  brand: string | null;
  category: string;
  package_label: string | null;
  promotional_price_cents: number;
  regular_price_cents: number | null;
  sale_unit: string;
  min_quantity: number | null;
  condition_types: string[];
  starts_on: string;
  ends_on: string;
  created_at: string;
  status: PromotionStatus;
  location_compatible: boolean;
  photo_verified: boolean;
  community_confirmed: boolean;
  moderator_verified: boolean;
  independent_confirmations: number;
  location_id: string;
  supermarket_id: string;
  supermarket_name: string;
  logo_url: string | null;
  address: string;
  neighborhood: string | null;
  city: string;
  state: string;
  store_latitude: number;
  store_longitude: number;
  distance_km: number | null;
  cover_image_path: string | null;
  favorited: boolean;
}

export interface SearchParams {
  city?: string | null;
  state?: string | null;
  category?: string | null;
  supermarketId?: string | null;
  locationId?: string | null;
  minPriceCents?: number | null;
  maxPriceCents?: number | null;
  query?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  maxKm?: number | null;
  sort?: 'recent' | 'price' | 'distance';
  limit?: number;
  offset?: number;
}

export interface StoreLocation {
  location_id: string;
  supermarket_id: string;
  name: string;
  logo_url: string | null;
  address: string;
  neighborhood: string | null;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  status: 'approved' | 'pending';
  distance_km: number | null;
  mine: boolean;
}

export interface MapStore {
  location_id: string;
  supermarket_name: string;
  logo_url: string | null;
  address: string;
  neighborhood: string | null;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  active_offers: number;
  top_offers: { id: string; product_name: string; promotional_price_cents: number; sale_unit: string }[] | null;
}

export interface OfferDetail {
  id: string;
  product_name: string;
  brand: string | null;
  category: string;
  package_label: string | null;
  product_type: string;
  barcode: string | null;
  description: string | null;
  promotional_price_cents: number;
  regular_price_cents: number | null;
  sale_unit: string;
  min_quantity: number | null;
  condition_types: string[];
  conditions: string | null;
  starts_on: string;
  ends_on: string;
  created_at: string;
  status: PromotionStatus;
  location_status: LocationStatus;
  photo_status: 'pending' | 'accepted' | 'rejected';
  moderation_status: string;
  location_compatible: boolean;
  photo_verified: boolean;
  community_confirmed: boolean;
  moderator_verified: boolean;
  independent_confirmations: number;
  negative_reports: number;
  open_reports: number;
  author_level: string;
  is_mine: boolean;
  is_admin: boolean;
  favorited: boolean;
  my_confirmation: { type: ConfirmationType; at: string } | null;
  store: { location_id: string; supermarket_id: string; name: string; logo_url: string | null; address: string; neighborhood: string | null; city: string; state: string; latitude: number; longitude: number; approved: boolean };
  images: { path: string; type: ImageType }[];
  confirmation_summary: Partial<Record<ConfirmationType, number>> | null;
  location_check: { distance_m: number | null; accuracy_m: number | null; radius_m: number; status: LocationStatus; checked_at: string } | null;
}

export interface GpsFix {
  latitude: number;
  longitude: number;
  accuracy: number;
  capturedAt: string;
}

/* ------------------------------------------------------------------ */
/* Consultas                                                           */
/* ------------------------------------------------------------------ */

export const searchOffers = (p: SearchParams) =>
  rpc<OfferRow[]>('search_promotions', {
    p_city: p.city || null, p_state: p.state || null, p_category: p.category || null, p_supermarket_id: p.supermarketId || null,
    p_location_id: p.locationId || null, p_min_price_cents: p.minPriceCents ?? null, p_max_price_cents: p.maxPriceCents ?? null,
    p_query: p.query?.trim() || null, p_latitude: p.latitude ?? null, p_longitude: p.longitude ?? null, p_max_km: p.maxKm ?? null,
    p_sort: p.sort ?? 'recent', p_limit: p.limit ?? 40, p_offset: p.offset ?? 0,
  });

export const mapStores = (p: Pick<SearchParams, 'city' | 'state' | 'category' | 'latitude' | 'longitude' | 'maxKm'>) =>
  rpc<MapStore[]>('map_store_offers', {
    p_city: p.city || null, p_state: p.state || null, p_category: p.category || null,
    p_latitude: p.latitude ?? null, p_longitude: p.longitude ?? null, p_max_km: p.maxKm ?? null,
  });

export const listCities = () => rpc<{ city: string; state: string; active_offers: number }[]>('marketplace_cities');

export const listStores = (p: { query?: string; city?: string; state?: string; latitude?: number | null; longitude?: number | null }) =>
  rpc<StoreLocation[]>('list_store_locations', {
    p_query: p.query?.trim() || null, p_city: p.city || null, p_state: p.state || null,
    p_latitude: p.latitude ?? null, p_longitude: p.longitude ?? null, p_limit: 40,
  });

export const getOffer = (id: string) => rpc<OfferDetail | null>('get_promotion', { p_id: id });

export const myOffers = () =>
  rpc<{ id: string; product_name: string; promotional_price_cents: number; sale_unit: string; status: PromotionStatus; location_status: LocationStatus;
    photo_status: string; moderation_status: string; independent_confirmations: number; open_reports: number; ends_on: string; created_at: string;
    supermarket_name: string; cover_image_path: string | null }[]>('my_promotions');

export const myReputation = async () => (await rpc<{ score: number; level: string; published: number; confirmed: number }[]>('my_reputation'))[0] ?? null;

export async function isAdmin(): Promise<boolean> {
  if (!isCloudConfigured()) return false;
  try {
    return await rpc<boolean>('is_admin');
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Publicação                                                          */
/* ------------------------------------------------------------------ */

export type PublishResult =
  | { kind: 'duplicate'; duplicateOf: string }
  | { kind: 'published'; id: string; status: PromotionStatus; locationStatus: LocationStatus; distanceM: number | null; accuracyM: number | null };

/** Comprime e envia a foto ao armazenamento privado; devolve o caminho. */
async function uploadImage(folder: string, uri: string): Promise<string> {
  const sb = client();
  const ctx = ImageManipulator.manipulate(uri);
  ctx.resize({ width: 1600 });
  const saved = await (await ctx.renderAsync()).saveAsync({ compress: 0.75, format: SaveFormat.JPEG, base64: Platform.OS !== 'web' });
  let body: Blob | ArrayBuffer;
  if (Platform.OS === 'web') {
    body = await (await fetch(saved.uri)).blob();
  } else {
    const bin = globalThis.atob(saved.base64 ?? '');
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    body = bytes.buffer;
  }
  const size = body instanceof Blob ? body.size : body.byteLength;
  if (!size) throw new MarketplaceError('A imagem ficou vazia ao ser preparada. Fotografe novamente.');
  const path = `${folder}/${newId()}.jpg`;
  const { error } = await sb.storage.from('promotion-images').upload(path, body, { contentType: 'image/jpeg', upsert: false });
  if (error) translate(error);
  return path;
}

export async function publishOffer(d: PromotionDraft, gps: GpsFix | null, onProgress?: (step: string) => void): Promise<PublishResult> {
  onProgress?.('Validando a publicação…');
  const res = await rpc<{ id?: string; duplicate_of?: string; location_status: LocationStatus; distance_m: number | null; accuracy_m: number | null }>('create_promotion', {
    p: {
      location_id: d.locationId,
      product_name: d.productName.trim(),
      brand: d.brand.trim() || null,
      category: d.category,
      package_label: d.packageLabel.trim() || null,
      product_type: d.productType,
      barcode: d.barcode || null,
      description: d.description.trim() || null,
      promotional_price_cents: d.promoPriceCents,
      regular_price_cents: d.regularPriceCents,
      sale_unit: d.saleUnit,
      min_quantity: d.conditionTypes.includes('min_quantity') ? d.minQuantity : null,
      condition_types: d.conditionTypes,
      conditions: d.conditions.trim() || null,
      starts_on: d.startsOn,
      ends_on: d.endsOn,
      // Enviadas só para o servidor calcular a distância; não são gravadas.
      latitude: gps?.latitude ?? null,
      longitude: gps?.longitude ?? null,
      accuracy_m: gps?.accuracy ?? null,
      captured_at: gps?.capturedAt ?? null,
    },
  });
  if (res.duplicate_of) return { kind: 'duplicate', duplicateOf: res.duplicate_of };
  const id = res.id!;
  try {
    for (let i = 0; i < d.photos.length; i++) {
      onProgress?.(`Enviando foto ${i + 1} de ${d.photos.length}…`);
      const path = await uploadImage(`p/${id}`, d.photos[i].uri);
      await rpc('add_promotion_image', { p_promotion_id: id, p_path: path, p_type: d.photos[i].type });
    }
    onProgress?.('Publicando…');
    const sub = await rpc<{ status: PromotionStatus }>('submit_promotion', { p_id: id });
    return { kind: 'published', id, status: sub.status, locationStatus: res.location_status, distanceM: res.distance_m, accuracyM: res.accuracy_m };
  } catch (e) {
    // Sem fotos válidas não há publicação: descarta o rascunho.
    await client().rpc('delete_my_draft', { p_id: id });
    throw e;
  }
}

export const findSimilar = (locationId: string, product: string, brand: string, pkg: string) =>
  rpc<{ id: string; product_name: string; promotional_price_cents: number; sale_unit: string; ends_on: string; independent_confirmations: number }[]>('find_similar_promotions', {
    p_location_id: locationId, p_product: product, p_brand: brand || null, p_package: pkg || null,
  });

export const suggestStore = (s: { name: string; cnpj?: string; address: string; neighborhood?: string; city: string; state: string; latitude: number; longitude: number }) =>
  rpc<{ location_id: string; existing: boolean; status?: string }>('suggest_store', { p: s });

export const endMyOffer = (id: string) => rpc<string>('end_my_promotion', { p_id: id });
export const updateMyOffer = (id: string, description: string | null, conditions: string | null, endsOn: string | null) =>
  rpc<string>('update_my_promotion', { p_id: id, p_description: description, p_conditions: conditions, p_ends_on: endsOn });

/* ------------------------------------------------------------------ */
/* Comunidade                                                          */
/* ------------------------------------------------------------------ */

export async function confirmOffer(id: string, type: ConfirmationType, opts: { reportedPriceCents?: number | null; photoUri?: string | null; gps?: GpsFix | null } = {}) {
  const evidence = opts.photoUri ? await uploadImage(`c/${id}`, opts.photoUri) : null;
  return rpc<{ status: PromotionStatus; independent: boolean; location_status: LocationStatus }>('confirm_promotion', {
    p_id: id, p_type: type, p_reported_price_cents: opts.reportedPriceCents ?? null, p_evidence_path: evidence,
    p_latitude: opts.gps?.latitude ?? null, p_longitude: opts.gps?.longitude ?? null, p_accuracy_m: opts.gps?.accuracy ?? null, p_captured_at: opts.gps?.capturedAt ?? null,
  });
}

export const reportOffer = (id: string, reason: ReportReason, description: string) =>
  rpc<{ status: PromotionStatus }>('report_promotion', { p_id: id, p_reason: reason, p_description: description || null });

export async function setFavorite(id: string, favorite: boolean) {
  const sb = client();
  const { error } = favorite
    ? await sb.from('promotion_favorites').insert({ promotion_id: id })
    : await sb.from('promotion_favorites').delete().eq('promotion_id', id);
  if (error && !/duplicate key/.test(error.message)) translate(error);
}

/* ------------------------------------------------------------------ */
/* Imagens privadas (URLs assinadas por tempo limitado)                */
/* ------------------------------------------------------------------ */

const signedCache = new Map<string, { url: string; expires: number }>();

export async function signedImageUrls(paths: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const missing: string[] = [];
  for (const p of paths) {
    const c = signedCache.get(p);
    if (c && c.expires > Date.now() + 60_000) out[p] = c.url;
    else missing.push(p);
  }
  if (missing.length) {
    const { data, error } = await client().storage.from('promotion-images').createSignedUrls(missing, 3600);
    if (error) translate(error);
    for (const item of data ?? []) {
      if (item.signedUrl && item.path) {
        out[item.path] = item.signedUrl;
        signedCache.set(item.path, { url: item.signedUrl, expires: Date.now() + 3600_000 });
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Notificações e preferências                                         */
/* ------------------------------------------------------------------ */

export interface AppNotification { id: number; kind: string; promotion_id: string | null; title: string; body: string; read_at: string | null; created_at: string }

export async function listNotifications(): Promise<AppNotification[]> {
  const { data, error } = await client().from('notifications').select('id, kind, promotion_id, title, body, read_at, created_at').order('created_at', { ascending: false }).limit(100);
  if (error) translate(error);
  return data ?? [];
}

export const markNotificationsRead = () => rpc('mark_notifications_read', { p_ids: null });

export interface NotificationPrefs {
  city: string | null;
  state: string | null;
  notify_nearby: boolean;
  favorite_categories: string[];
  favorite_terms: string[];
  notify_my_promotions: boolean;
  notify_expiring_favorites: boolean;
  push_enabled: boolean;
}

export async function getPrefs(): Promise<NotificationPrefs | null> {
  const { data, error } = await client().from('notification_preferences').select('*').maybeSingle();
  if (error) translate(error);
  return data;
}

export async function savePrefs(p: NotificationPrefs) {
  const { error } = await client().from('notification_preferences').upsert({ ...p, updated_at: new Date().toISOString() });
  if (error) translate(error);
}

export async function savePushToken(token: string, platform: 'ios' | 'android' | 'web') {
  const { error } = await client().from('push_tokens').upsert({ token, platform });
  if (error) translate(error);
}

/* ------------------------------------------------------------------ */
/* Moderação                                                           */
/* ------------------------------------------------------------------ */

export interface AdminQueue {
  reports: { id: string; promotion_id: string; reason: ReportReason; description: string | null; created_at: string; product_name: string; store: string }[];
  pending_promotions: { id: string; product_name: string; status: PromotionStatus; location_status: LocationStatus; photo_status: string; created_at: string; store: string }[];
  pending_locations: { id: string; name: string; cnpj: string | null; address: string; neighborhood: string | null; city: string; state: string; latitude: number; longitude: number; created_at: string; nearby_approved: number }[];
}

export const adminQueue = () => rpc<AdminQueue>('admin_queue');
export const adminAudit = (id: string) => rpc<Record<string, unknown>>('admin_promotion_audit', { p_id: id });
export const adminModerate = (id: string, action: 'approve' | 'accept_photo' | 'reject_photo' | 'suspend' | 'remove' | 'restore', notes?: string) =>
  rpc<string>('admin_moderate_promotion', { p_id: id, p_action: action, p_notes: notes || null });
export const adminResolveReport = (id: string, upheld: boolean, notes?: string) => rpc<string>('admin_resolve_report', { p_report_id: id, p_upheld: upheld, p_notes: notes || null });
export const adminReviewLocation = (id: string, approve: boolean, radius?: number | null, logoUrl?: string | null) =>
  rpc('admin_review_location', { p_location_id: id, p_approve: approve, p_radius_m: radius ?? null, p_logo_url: logoUrl || null, p_notes: null });
export const adminBanUser = (userId: string, days: number | null, reason: string) =>
  rpc('admin_set_user_ban', { p_user: userId, p_until: days ? new Date(Date.now() + days * 86400e3).toISOString() : null, p_reason: reason });
