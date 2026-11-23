// Pedaços que as três funções da assinatura compartilham.
//
// A chave secreta da Stripe existe só aqui, nos segredos da função. Ela nunca é embutida no
// aplicativo nem commitada: o aplicativo só chama estas funções com a sessão do usuário.
import Stripe from 'npm:stripe@23.2.0';
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0';

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

/** Planos vendidos. A chave de busca do preço na Stripe é "<plano>_<periodo>". */
export const PLANOS = ['mais', 'ia'] as const;
export type Plano = (typeof PLANOS)[number];
export const PRECOS = ['mais_mensal', 'mais_anual', 'ia_mensal', 'ia_anual'] as const;
export type Preco = (typeof PRECOS)[number];

/** Descobre o plano pela chave de busca do preço, sem depender de identificadores que mudam entre modos. */
export function planoDoPreco(lookupKey: string | null | undefined): Plano | null {
  const inicio = (lookupKey ?? '').split('_')[0];
  return (PLANOS as readonly string[]).includes(inicio) ? (inicio as Plano) : null;
}

export function stripeClient(): Stripe {
  const key = Deno.env.get('STRIPE_SECRET_KEY');
  if (!key) throw new HttpError(500, 'stripe_nao_configurada', 'Assinaturas ainda não estão configuradas.');
  return new Stripe(key, { httpClient: Stripe.createFetchHttpClient() });
}

/** Cliente com a chave de serviço: só o servidor escreve no espelho da assinatura. */
export function adminClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
}

/** Confere a sessão do usuário que chamou e devolve id e e-mail. */
export async function usuarioDaRequisicao(req: Request): Promise<{ id: string; email: string | null }> {
  const authorization = req.headers.get('Authorization');
  if (!authorization) throw new HttpError(401, 'unauthenticated', 'Entre na sua conta para assinar.');
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authorization } },
  });
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new HttpError(401, 'unauthenticated', 'Sessão inválida. Entre de novo.');
  return { id: data.user.id, email: data.user.email ?? null };
}

/** Endereço do aplicativo, para onde a Stripe devolve a pessoa depois do pagamento. */
export function appUrl(): string {
  return (Deno.env.get('APP_URL') ?? 'https://app.meucarrin.com').replace(/\/+$/, '');
}

/**
 * Fim do período pago. A Stripe moveu esse campo do objeto da assinatura para cada item
 * (versões 2025 em diante); lemos os dois lugares para não depender da versão da API.
 */
export function fimDoPeriodo(assinatura: Stripe.Subscription): string | null {
  const noObjeto = (assinatura as unknown as { current_period_end?: number }).current_period_end;
  const noItem = assinatura.items?.data?.[0]?.current_period_end;
  const segundos = noItem ?? noObjeto;
  return typeof segundos === 'number' ? new Date(segundos * 1000).toISOString() : null;
}

/** Tira o id da assinatura do objeto do aviso, qualquer que seja o tipo. */
export function idDaAssinatura(evento: Stripe.Event): string | null {
  const objeto = evento.data.object as unknown as Record<string, unknown>;
  if (evento.type.startsWith('customer.subscription.')) return typeof objeto.id === 'string' ? objeto.id : null;
  const assinatura = objeto.subscription ?? (objeto.parent as { subscription_details?: { subscription?: unknown } } | undefined)?.subscription_details?.subscription;
  if (typeof assinatura === 'string') return assinatura;
  if (assinatura && typeof assinatura === 'object' && typeof (assinatura as { id?: unknown }).id === 'string') {
    return (assinatura as { id: string }).id;
  }
  return null;
}

/** Chave de busca do preço assinado, que é o que diz o plano. */
export function precoDaAssinatura(assinatura: Stripe.Subscription): string | null {
  const preco = assinatura.items?.data?.[0]?.price;
  return preco?.lookup_key ?? null;
}

/** Acha o cliente da Stripe já ligado a esta conta, ou cria um. */
export async function clienteDoUsuario(
  stripe: Stripe,
  admin: SupabaseClient,
  usuario: { id: string; email: string | null },
): Promise<string> {
  const { data } = await admin.from('subscriptions').select('stripe_customer_id').eq('user_id', usuario.id).maybeSingle();
  if (data?.stripe_customer_id) return data.stripe_customer_id;

  const cliente = await stripe.customers.create({
    email: usuario.email ?? undefined,
    metadata: { supabase_user_id: usuario.id },
  });
  const { error } = await admin
    .from('subscriptions')
    .upsert({ user_id: usuario.id, stripe_customer_id: cliente.id, plan: 'gratis', status: 'none' }, { onConflict: 'user_id' });
  if (error) throw new HttpError(500, 'espelho_falhou', 'Não foi possível iniciar a assinatura. Tente de novo.');
  return cliente.id;
}
