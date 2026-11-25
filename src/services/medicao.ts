/**
 * Envia eventos do funil para o Supabase (`registrar_evento`). Nunca atrapalha o uso: sem
 * servidor, sem conexão ou com erro, o evento simplesmente não é contado.
 */
import { dadosDoEvento, type DadosDoEvento, type EventoDoApp } from '@/domain/medicao';
import { getSupabase } from './supabase';

export function registrar(evento: EventoDoApp, dados: DadosDoEvento = {}): void {
  void enviar(evento, dados);
}

async function enviar(evento: EventoDoApp, dados: DadosDoEvento): Promise<boolean> {
  try {
    const sb = getSupabase();
    if (!sb) return false;
    const { error } = await sb.rpc('registrar_evento', { p_evento: evento, p_origem: 'app', p_dados: dadosDoEvento(dados) });
    return !error;
  } catch {
    return false;
  }
}

/** Primeiro uso deste aparelho: conta uma vez só. Se não der para enviar agora, tenta na próxima abertura. */
export async function registrarPrimeiroUso(preferencias: {
  getSetting(chave: string): Promise<string | null>;
  setSetting(chave: string, valor: string | null): Promise<void>;
}): Promise<void> {
  if (await preferencias.getSetting('medicao_primeiro_uso')) return;
  if (await enviar('app_first_use', {})) await preferencias.setSetting('medicao_primeiro_uso', '1');
}
