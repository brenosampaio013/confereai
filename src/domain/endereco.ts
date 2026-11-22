/**
 * Regras de endereço e coordenada das unidades de supermercado, sem React e sem rede.
 *
 * O banco só aceita coordenadas dentro do retângulo do Brasil (ver a restrição de
 * `supermarket_locations` em supabase/migrations/20261109120000_marketplace.sql). Conferir isso
 * aqui também evita o que acontecia antes: um toque no mapa fora do país era aceito pela tela,
 * e só o servidor recusava — com a mensagem genérica "alguns dados não são válidos".
 */

/** Mesmos limites da restrição do banco. Mudou lá, muda aqui. */
export const LIMITES_BRASIL = { latMin: -34, latMax: 6, lngMin: -75, lngMax: -28 } as const;

export function dentroDoBrasil(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= LIMITES_BRASIL.latMin &&
    latitude <= LIMITES_BRASIL.latMax &&
    longitude >= LIMITES_BRASIL.lngMin &&
    longitude <= LIMITES_BRASIL.lngMax
  );
}

/** Um lugar encontrado na busca, já no formato dos campos do formulário. */
export interface LugarEncontrado {
  /** Linha legível para a pessoa escolher entre os resultados. */
  rotulo: string;
  /** Nome do estabelecimento, quando o resultado é um comércio (e não apenas uma rua). */
  nome: string | null;
  endereco: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  latitude: number;
  longitude: number;
}

/** Resposta crua do buscador: todos os campos são opcionais e não confiáveis. */
export interface LugarBruto {
  lat?: string | number;
  lon?: string | number;
  name?: string | null;
  category?: string | null;
  type?: string | null;
  display_name?: string | null;
  address?: Record<string, string | undefined> | null;
}

/** Só comércios viram sugestão de nome; uma rua não é o nome de um mercado. */
const COMERCIO = new Set(['shop', 'amenity', 'building']);

const primeiro = (...valores: (string | undefined)[]) => valores.find((v) => v && v.trim())?.trim() ?? null;

/**
 * Converte um resultado do buscador nos campos do formulário.
 * Devolve null quando o resultado não serve: sem coordenada utilizável ou fora do Brasil.
 */
export function interpretarLugar(bruto: LugarBruto): LugarEncontrado | null {
  const latitude = Number(bruto.lat);
  const longitude = Number(bruto.lon);
  if (!dentroDoBrasil(latitude, longitude)) return null;

  const a = bruto.address ?? {};
  const rua = primeiro(a.road, a.pedestrian, a.footway);
  const numero = primeiro(a.house_number);
  const endereco = rua ? [rua, numero].filter(Boolean).join(', ') : null;
  const bairro = primeiro(a.suburb, a.neighbourhood, a.city_district, a.quarter);
  const cidade = primeiro(a.city, a.town, a.village, a.municipality);
  const iso = primeiro(a['ISO3166-2-lvl4']);
  const uf = iso && /^BR-[A-Z]{2}$/.test(iso) ? iso.slice(3) : null;
  const nome = bruto.category && COMERCIO.has(bruto.category) ? primeiro(bruto.name ?? undefined) : null;

  const rotulo =
    [nome, endereco, bairro, cidade && uf ? `${cidade} - ${uf}` : cidade].filter(Boolean).join(' · ') ||
    primeiro(bruto.display_name ?? undefined) ||
    `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;

  return { rotulo, nome, endereco, bairro, cidade, uf, latitude, longitude };
}
