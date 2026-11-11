/**
 * Base de preços da comunidade.
 *
 * - Envio: preços que o usuário registrou em compras vinculadas a uma unidade cadastrada
 *   são enviados em lote (somente com conta e com a contribuição ligada no Perfil).
 * - Consulta: último preço informado em cada unidade. Nunca identifica quem informou.
 */
import type { Repository } from '@/data/repository';
import type { Product } from '@/domain/types';
import { isCloudConfigured } from '@/lib/config';
import { isOnline } from './network';
import { getSupabase } from './supabase';

export const SHARE_PRICES_SETTING = 'share_prices';

export interface CommunityPrice {
  location_id: string;
  supermarket_name: string;
  address: string;
  neighborhood: string | null;
  city: string;
  state: string;
  unit_price_cents: number;
  regular_price_cents: number | null;
  promo: boolean;
  sale_unit: string;
  observed_at: string;
  reporters: number;
}

export interface CommunityProduct {
  name: string;
  brand: string | null;
  package_amount: number | null;
  package_unit: 'g' | 'ml' | 'un' | null;
  sale_unit: 'un' | 'kg' | 'l';
}

/** A contribuição vem ligada; o usuário pode desligar no Perfil. */
export async function isSharingEnabled(repo: Repository): Promise<boolean> {
  return (await repo.getSetting(SHARE_PRICES_SETTING)) !== 'off';
}

/** Envia os preços pendentes. Devolve quantos o servidor aceitou (0 quando não se aplica). */
export async function sharePendingPrices(repo: Repository): Promise<number> {
  const sb = getSupabase();
  if (!sb || !isCloudConfigured()) return 0;
  if (!(await isSharingEnabled(repo))) return 0;
  const { data: auth } = await sb.auth.getSession();
  if (!auth.session || auth.session.user.is_anonymous) return 0;
  const pending = await repo.listUnsharedPrices(50);
  if (!pending.length || !(await isOnline())) return 0;
  const { data, error } = await sb.rpc('report_prices', {
    p_reports: pending.map((p) => ({
      id: p.id,
      location_id: p.locationId,
      barcode: p.barcode,
      name: p.name,
      brand: p.brand,
      package_amount: p.packageAmount,
      package_unit: p.packageUnit,
      sale_unit: p.saleUnit,
      unit_price_cents: p.unitPriceCents,
      regular_price_cents: p.regularPriceCents != null && p.regularPriceCents > p.unitPriceCents ? p.regularPriceCents : null,
      promo: p.promo,
      observed_at: p.recordedAt,
    })),
  });
  if (error || !data) return 0; // tenta de novo na próxima sincronização
  const result = data as { handled?: string[]; accepted?: number };
  const known = new Set(pending.map((p) => p.id));
  await repo.markPricesShared((result.handled ?? []).filter((id) => known.has(id)));
  return result.accepted ?? 0;
}

export async function communityPrices(product: Pick<Product, 'barcode' | 'name' | 'brand' | 'packageAmount' | 'packageUnit' | 'saleUnit'>): Promise<CommunityPrice[]> {
  const sb = getSupabase();
  if (!sb || !(await isOnline())) return [];
  const { data, error } = await sb.rpc('community_prices', {
    p_barcode: product.barcode,
    p_name: product.name,
    p_brand: product.brand,
    p_package_amount: product.packageAmount,
    p_package_unit: product.packageUnit,
    p_sale_unit: product.saleUnit,
  });
  if (error) throw new Error('Não foi possível consultar os preços da comunidade agora.');
  return (data ?? []) as CommunityPrice[];
}

export async function lookupCommunityProduct(barcode: string): Promise<CommunityProduct | null> {
  const sb = getSupabase();
  if (!sb || !/^\d{8,14}$/.test(barcode) || !(await isOnline())) return null;
  try {
    const { data, error } = await sb.rpc('lookup_shared_product', { p_barcode: barcode });
    if (error || !Array.isArray(data) || !data[0]) return null;
    return data[0] as CommunityProduct;
  } catch {
    return null;
  }
}
