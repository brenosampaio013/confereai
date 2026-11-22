// Supabase Edge Function: stripe-portal
//
// Abre o portal de cobrança da Stripe, onde a pessoa troca o cartão, baixa recibos e cancela
// a assinatura. Nada disso é reimplementado aqui: cancelamento e reembolso são fluxos da
// Stripe, e é ela quem guarda os dados de pagamento.
//
// Segredos: STRIPE_SECRET_KEY, APP_URL (opcional).
import { HttpError, adminClient, appUrl, cors, json, stripeClient, usuarioDaRequisicao } from '../_shared/stripe.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  try {
    const usuario = await usuarioDaRequisicao(req);
    const admin = adminClient();
    const { data } = await admin.from('subscriptions').select('stripe_customer_id').eq('user_id', usuario.id).maybeSingle();
    if (!data?.stripe_customer_id) {
      throw new HttpError(404, 'sem_assinatura', 'Você ainda não tem assinatura para gerenciar.');
    }

    const stripe = stripeClient();
    const sessao = await stripe.billingPortal.sessions.create({
      customer: data.stripe_customer_id,
      return_url: `${appUrl()}/planos`,
      locale: 'pt-BR',
    });
    return json(200, { url: sessao.url });
  } catch (e) {
    if (e instanceof HttpError) return json(e.status, { error: e.code, message: e.message });
    console.error('stripe_portal_erro', e instanceof Error ? e.message : String(e));
    return json(500, { error: 'internal', message: 'Não foi possível abrir o portal de cobrança.' });
  }
});
