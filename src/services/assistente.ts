/**
 * Assistente de voz (Edge Function `assistente`).
 *
 * O aplicativo grava, envia e mostra o que voltou. Ele não conhece chave de IA nenhuma, não
 * guarda o áudio e não coloca nada no carrinho por conta própria: quem confirma é a pessoa.
 */
import { File } from 'expo-file-system';
import * as Speech from 'expo-speech';
import { Platform } from 'react-native';
import { type ItemSugerido, lerItens } from '@/domain/assistente';
import { getSupabase } from './supabase';
import { isOnline } from './network';

export type AssistenteMotivo =
  | 'not_configured'
  | 'offline'
  | 'needs_account'
  | 'sem_plano'
  | 'quota'
  | 'audio'
  | 'service_error';

export class AssistenteError extends Error {
  constructor(public motivo: AssistenteMotivo, message: string) {
    super(message);
  }
}

export interface Entendimento {
  transcricao: string;
  resposta: string;
  itens: ItemSugerido[];
}

/** O tipo que o gravador produz em cada plataforma (o servidor aceita os dois). */
export const tipoDoAudio = () => (Platform.OS === 'web' ? 'audio/webm' : 'audio/m4a');

/**
 * Lê o áudio gravado como base64 e o descarta em seguida: a gravação não fica no aparelho.
 * Na web o gravador devolve um endereço `blob:` e o `base64()` do expo-file-system não existe
 * (ele é só de Android/iOS), então ali a leitura é pelo próprio navegador.
 */
async function lerEApagar(uri: string): Promise<string> {
  if (Platform.OS === 'web') {
    const resposta = await fetch(uri);
    const blob = await resposta.blob();
    const base64 = await new Promise<string>((resolve, reject) => {
      const leitor = new FileReader();
      leitor.onerror = () => reject(new AssistenteError('audio', 'Não consegui ler a gravação.'));
      // O resultado vem como "data:audio/webm;base64,XXXX": só o depois da vírgula interessa.
      leitor.onload = () => resolve(String(leitor.result).split(',')[1] ?? '');
      leitor.readAsDataURL(blob);
    });
    URL.revokeObjectURL(uri);
    return base64;
  }
  const arquivo = new File(uri);
  try {
    return await arquivo.base64();
  } finally {
    try {
      arquivo.delete();
    } catch {
      // Já pode ter sido removido pelo sistema; não é motivo para falhar.
    }
  }
}

export async function enviarFala(uri: string): Promise<Entendimento> {
  const sb = getSupabase();
  if (!sb) throw new AssistenteError('not_configured', 'O assistente não está configurado neste aplicativo.');
  if (!(await isOnline())) throw new AssistenteError('offline', 'Sem internet. O assistente precisa de conexão; você pode digitar os itens.');
  const { data: sessao } = await sb.auth.getSession();
  if (!sessao.session || sessao.session.user.is_anonymous) {
    throw new AssistenteError('needs_account', 'Entre na sua conta para falar com o assistente.');
  }

  const audio = await lerEApagar(uri);
  const { data, error } = await sb.functions.invoke<unknown>('assistente', {
    body: { audio, mimeType: tipoDoAudio() },
  });

  if (error) {
    let status = 0;
    let mensagem = 'Não consegui processar sua fala. Tente de novo.';
    let codigo = '';
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.status === 'number') {
      status = ctx.status;
      try {
        const corpo = await ctx.json();
        if (corpo?.message) mensagem = corpo.message;
        if (corpo?.error) codigo = corpo.error;
      } catch {
        // corpo não-JSON
      }
    }
    if (codigo === 'plano_sem_assistente') throw new AssistenteError('sem_plano', mensagem);
    if (status === 429) throw new AssistenteError('quota', mensagem);
    if (status === 401) throw new AssistenteError('needs_account', mensagem);
    if (status === 413 || status === 400) throw new AssistenteError('audio', mensagem);
    if (status === 503) throw new AssistenteError('not_configured', mensagem);
    throw new AssistenteError('service_error', mensagem);
  }

  const d = (data ?? {}) as { transcricao?: unknown; resposta?: unknown; itens?: unknown };
  return {
    transcricao: typeof d.transcricao === 'string' ? d.transcricao : '',
    resposta: typeof d.resposta === 'string' ? d.resposta : '',
    itens: lerItens(d.itens),
  };
}

/** Lê a resposta em voz alta, com a voz do próprio aparelho (não custa nada e não sai daqui). */
export function falar(texto: string) {
  if (!texto) return;
  Speech.stop();
  Speech.speak(texto, { language: 'pt-BR', rate: 1.0 });
}

export const calarse = () => Speech.stop();
