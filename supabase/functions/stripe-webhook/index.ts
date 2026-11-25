// Supabase Edge Function: stripe-webhook
//
// Recebe os avisos da Stripe e atualiza o espelho da assinatura no banco. É o único lugar que
// escreve em `public.subscriptions`, com a chave de serviço — o aplicativo não consegue se
// promover a assinante.
//
// Duas decisões que importam:
//
// 1. A assinatura (cabeçalho `stripe-signature`) é verificada sobre o corpo cru, antes de
//    qualquer leitura. Sem isso, qualquer pessoa na internet liberaria o plano pago com um POST.
//    Por isso esta função roda com `verify_jwt = false`: quem chama é a Stripe, não um usuário.
// 2. Avisos podem chegar fora de ordem ou repetidos. Em vez de aplicar o que vem no aviso,
//    buscamos a assinatura na Stripe e gravamos o estado atual dela. Assim a ordem não importa
//    e reenvio não causa dano.
//
// Segredos (supabase secrets set ...):
//   STRIPE_SECRET_KEY      chave secreta da Stripe
//   STRIPE_WEBHOOK_SECRET  segredo do endpoint (whsec_...), dado pela Stripe ao criar o webhook
import Stripe from 'npm:stripe@23.2.0';
import {
  adminClient, eventoDoFunil, fimDoPeriodo, idDaAssinatura, json, planoDoPreco, precoDaAssinatura, stripeClient,
} from '../_shared/stripe.ts';

const INTERESSAM = new Set([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
  'invoice.paid',
  'invoice.payment_failed',
]);

/** De quem é esta assinatura. Procura no que a Stripe guardou e, por último, no próprio espelho. */
async function donoDaAssinatura(
  stripe: Stripe,
  admin: ReturnType<typeof adminClient>,
  assinatura: Stripe.Subscription,
): Promise<string | null> {
  const naAssinatura = assinatura.metadata?.supabase_user_id;
  if (naAssinatura) return naAssinatura;

  const clienteId = typeof assinatura.customer === 'string' ? assinatura.customer : assinatura.customer?.id;
  if (!clienteId) return null;

  const cliente = await stripe.customers.retrieve(clienteId);
  if (!cliente.deleted && cliente.metadata?.supabase_user_id) return cliente.metadata.supabase_user_id;

  const { data } = await admin.from('subscriptions').select('user_id').eq('stripe_customer_id', clienteId).maybeSingle();
  return data?.user_id ?? null;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const segredo = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!segredo) {
    console.error('webhook_sem_segredo');
    return json(500, { error: 'webhook_nao_configurado' });
  }
  const assinaturaDoCabecalho = req.headers.get('stripe-signature');
  if (!assinaturaDoCabecalho) return json(400, { error: 'sem_assinatura' });

  const stripe = stripeClient();
  const corpoCru = await req.text();

  let evento: Stripe.Event;
  try {
    evento = await stripe.webhooks.constructEventAsync(
      corpoCru,
      assinaturaDoCabecalho,
      segredo,
      undefined,
      Stripe.createSubtleCryptoProvider(),
    );
  } catch (e) {
    // Não registramos o corpo: ele pode conter dados do cliente.
    console.error('assinatura_invalida', e instanceof Error ? e.message : String(e));
    return json(400, { error: 'assinatura_invalida' });
  }

  if (!INTERESSAM.has(evento.type)) return json(200, { ignorado: evento.type });

  try {
    const assinaturaId = idDaAssinatura(evento);
    if (!assinaturaId) return json(200, { ignorado: 'sem_assinatura_no_evento' });

    // A verdade é o estado atual na Stripe, não o que veio no aviso.
    const assinatura = await stripe.subscriptions.retrieve(assinaturaId);
    const admin = adminClient();
    const dono = await donoDaAssinatura(stripe, admin, assinatura);
    if (!dono) {
      console.error('assinatura_sem_dono', assinaturaId);
      return json(200, { ignorado: 'sem_dono' });
    }

    const chaveDoPreco = precoDaAssinatura(assinatura);
    const plano = planoDoPreco(chaveDoPreco);
    if (!plano) {
      console.error('preco_desconhecido', assinaturaId, chaveDoPreco);
      return json(200, { ignorado: 'preco_desconhecido' });
    }

    const clienteId = typeof assinatura.customer === 'string' ? assinatura.customer : assinatura.customer?.id;
    const { error } = await admin.from('subscriptions').upsert(
      {
        user_id: dono,
        stripe_customer_id: clienteId!,
        stripe_subscription_id: assinatura.id,
        plan: plano,
        status: assinatura.status,
        price_lookup_key: chaveDoPreco,
        current_period_end: fimDoPeriodo(assinatura),
        cancel_at_period_end: assinatura.cancel_at_period_end ?? false,
      },
      { onConflict: 'user_id' },
    );
    if (error) {
      // Devolver erro faz a Stripe tentar de novo, que é o que queremos.
      console.error('espelho_falhou', error.message);
      return json(500, { error: 'espelho_falhou' });
    }

    // Medição do funil: assinatura concluída ou cancelada, uma vez por assinatura. Nada que
    // identifique a pessoa vai para a tabela, e uma falha aqui não derruba o aviso (o espelho,
    // que é o que libera o plano, já foi gravado).
    const funil = await eventoDoFunil(assinatura.id, assinatura.status, chaveDoPreco);
    if (funil) {
      const { error: erroDaMedicao } = await admin
        .from('analytics_events')
        .upsert({ event: funil.event, source: 'servidor', props: funil.props, ref: funil.ref }, { onConflict: 'ref', ignoreDuplicates: true });
      if (erroDaMedicao) console.error('medicao_falhou', erroDaMedicao.message);
    }

    return json(200, { ok: true, plano, status: assinatura.status });
  } catch (e) {
    console.error('webhook_erro', e instanceof Error ? e.message : String(e));
    return json(500, { error: 'internal' });
  }
});
