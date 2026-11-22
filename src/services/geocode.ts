import { interpretarLugar, LugarBruto, LugarEncontrado } from '@/domain/endereco';

/**
 * Busca de endereços e estabelecimentos no mapa aberto do OpenStreetMap (Nominatim).
 *
 * É o serviço que dá o endereço e a coordenada REAIS do local — nada aqui é inventado: o que
 * não for encontrado volta como lista vazia, e a pessoa continua podendo tocar no mapa.
 *
 * Dois cuidados com o serviço, que é público e gratuito:
 *  - a busca só acontece quando a pessoa toca em "Procurar", nunca a cada tecla digitada;
 *  - os resultados são limitados ao Brasil, que é o único lugar onde o cadastro é aceito.
 * Se um dia o volume crescer, o caminho é passar a chamada por uma Edge Function com cache,
 * em vez de cada aparelho falar direto com o serviço.
 */

const BUSCA = 'https://nominatim.openstreetmap.org/search';
const ESPERA_MAXIMA = 10000;

export class BuscaError extends Error {}

export async function buscarLugares(
  texto: string,
  perto?: { latitude: number; longitude: number } | null,
): Promise<LugarEncontrado[]> {
  const termo = texto.trim();
  if (termo.length < 4) throw new BuscaError('Escreva pelo menos o nome da rua e a cidade.');

  const params = new URLSearchParams({
    q: termo,
    format: 'jsonv2',
    addressdetails: '1',
    countrycodes: 'br',
    limit: '6',
    'accept-language': 'pt-BR',
  });
  // Perto de onde a pessoa está, os resultados daquela região vêm primeiro (sem excluir os outros).
  if (perto) {
    const d = 0.5;
    params.set('viewbox', [perto.longitude - d, perto.latitude + d, perto.longitude + d, perto.latitude - d].join(','));
  }

  const cancelar = new AbortController();
  const relogio = setTimeout(() => cancelar.abort(), ESPERA_MAXIMA);
  let resposta: Response;
  try {
    resposta = await fetch(`${BUSCA}?${params.toString()}`, {
      signal: cancelar.signal,
      headers: { Accept: 'application/json' },
    });
  } catch {
    throw new BuscaError('Não foi possível buscar agora. Verifique a internet ou toque no mapa.');
  } finally {
    clearTimeout(relogio);
  }
  if (!resposta.ok) throw new BuscaError('A busca de endereços não respondeu. Tente de novo em instantes.');

  const bruto: unknown = await resposta.json().catch(() => null);
  if (!Array.isArray(bruto)) return [];
  return bruto
    .map((l) => interpretarLugar(l as LugarBruto))
    .filter((l): l is LugarEncontrado => l !== null)
    .slice(0, 5);
}
