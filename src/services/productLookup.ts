/**
 * Busca de produto pelo código de barras.
 * 1) Cadastro local do usuário.
 * 2) (Opcional) Open Food Facts — base pública e colaborativa. O resultado é apenas uma
 *    SUGESTÃO de nome/marca/embalagem para o usuário confirmar; preço nunca vem de fora.
 */
import { config } from '@/lib/config';
import { extractPackageMeasure, PackageMeasure } from '@/domain/units';
import { isOnline } from './network';

export interface ProductSuggestion {
  name: string;
  brand: string | null;
  packageMeasure: PackageMeasure | null;
  quantityText: string | null;
  source: 'open_food_facts';
}

export async function lookupPublicProduct(barcode: string): Promise<ProductSuggestion | null> {
  if (!config.openFoodFacts || !/^\d{8,14}$/.test(barcode)) return null;
  if (!(await isOnline())) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=product_name,product_name_pt,brands,quantity`,
      { signal: controller.signal, headers: { 'User-Agent': 'ConfereAi/1.0 (app de conferência de compras)' } },
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.status !== 1 || !data.product) return null;
    const p = data.product;
    const name = String(p.product_name_pt || p.product_name || '').trim();
    if (!name) return null;
    const quantityText = p.quantity ? String(p.quantity) : null;
    return {
      name,
      brand: p.brands ? String(p.brands).split(',')[0].trim() : null,
      packageMeasure: quantityText ? extractPackageMeasure(quantityText) : null,
      quantityText,
      source: 'open_food_facts',
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
