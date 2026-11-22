/**
 * Assinatura (Edge Functions `stripe-checkout`, `stripe-portal` e a função `my_plan` do banco).
 *
 * O aplicativo não conhece chave nenhuma da Stripe e não processa cartão: ele pede um endereço
 * de pagamento ao servidor e abre esse endereço no navegador. Quem cobra é a Stripe, na página
 * dela; quem libera o plano é o webhook, no servidor. Nada aqui concede plano a ninguém.
 */
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { type EstadoDoPlano, lerEstado, type PrecoId } from '@/domain/planos';
import { getSupabase } from './supabase';
import { isOnline } from './network';

export type PlanoErroMotivo = 'not_configured' | 'offline' | 'needs_account' | 'sem_assinatura' | 'service_error';

export class PlanoError extends Error {
  constructor(public motivo: PlanoErroMotivo, message: string) {
    super(message);
  }
}

/** Estado do plano de quem está conectado. Devolve null sem servidor ou sem conta. */
export async function meuPlano(): Promise<EstadoDoPlano | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data: sessao } = await sb.auth.getSession();
  if (!sessao.session || sessao.session.user.is_anonymous) return null;
  const { data, error } = await sb.rpc('my_plan');
  if (error) throw new PlanoError('service_error', 'Não foi possível ler o seu plano agora.');
  return lerEstado(data);
}

/** Lê a mensagem que a função devolveu, para o aviso na tela ser o do servidor, não um genérico. */
async function mensagemDoErro(error: unknown, padrao: string): Promise<{ status: number; message: string }> {
  const ctx = (error as { context?: Response }).context;
  let status = 0;
  let message = padrao;
  if (ctx && typeof ctx.status === 'number') {
    status = ctx.status;
    try {
      const corpo = await ctx.json();
      if (corpo?.message) message = corpo.message;
    } catch {
      // corpo não-JSON
    }
  }
  return { status, message };
}

async function endereco(funcao: 'stripe-checkout' | 'stripe-portal', body: Record<string, unknown>): Promise<string> {
  const sb = getSupabase();
  if (!sb) throw new PlanoError('not_configured', 'A assinatura não está configurada neste aplicativo.');
  if (!(await isOnline())) throw new PlanoError('offline', 'Sem conexão com a internet.');
  const { data: sessao } = await sb.auth.getSession();
  if (!sessao.session || sessao.session.user.is_anonymous) {
    throw new PlanoError('needs_account', 'Entre na sua conta para assinar.');
  }

  const { data, error } = await sb.functions.invoke<{ url?: string }>(funcao, { body });
  if (error) {
    const { status, message } = await mensagemDoErro(error, 'Não foi possível abrir a página de pagamento.');
    if (status === 401) throw new PlanoError('needs_account', 'Sua sessão expirou. Entre novamente.');
    if (status === 404) throw new PlanoError('sem_assinatura', message);
    throw new PlanoError('service_error', message);
  }
  if (!data?.url) throw new PlanoError('service_error', 'O servidor não devolveu o endereço de pagamento.');
  return data.url;
}

/** Abre o pagamento da Stripe. Na web troca a página; no celular abre o navegador do sistema. */
export async function assinar(preco: PrecoId): Promise<void> {
  const url = await endereco('stripe-checkout', { preco });
  await abrir(url);
}

/** Abre o portal da Stripe, onde se troca o cartão, baixa recibo e cancela. */
export async function gerenciarAssinatura(): Promise<void> {
  const url = await endereco('stripe-portal', {});
  await abrir(url);
}

async function abrir(url: string): Promise<void> {
  if (Platform.OS === 'web') {
    // Mesma aba: a Stripe devolve a pessoa para /planos no fim, e bloqueador de pop-up não atrapalha.
    globalThis.location.assign(url);
    return;
  }
  await WebBrowser.openBrowserAsync(url, { dismissButtonStyle: 'close', showTitle: true });
}
