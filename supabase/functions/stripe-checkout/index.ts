// Supabase Edge Function: stripe-checkout
//
// Abre uma sessão de pagamento da Stripe para o plano Meu Carrin Mais. Quem paga é a Stripe,
// na página dela: o cartão nunca passa pelo aplicativo nem por este servidor.
//
// Exige sessão do Supabase. O preço é escolhido pela chave de busca ("mais_mensal" ou
// "mais_anual"), que é a mesma nos modos de teste e de produção — nada de identificador
// colado no código.
//
// Segredos (supabase secrets set ...):
//   STRIPE_SECRET_KEY  chave secreta da Stripe (sk_live_... ou sk_test_...)
//   APP_URL            opcional (padrão https://app.meucarrin.com)
import {
  HttpError, PRECOS, type Preco, adminClient, appUrl, clienteDoUsuario, cors, json, stripeClient, usuarioDaRequisicao,
} from '../_shared/stripe.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  try {
    const usuario = await usuarioDaRequisicao(req);
    const corpo = (await req.json().catch(() => null)) as { preco?: string } | null;
    const preco = corpo?.preco;
    if (!preco || !(PRECOS as readonly string[]).includes(preco)) {
      throw new HttpError(400, 'preco_invalido', 'Escolha um dos planos, no mensal ou no anual.');
    }

    const stripe = stripeClient();
    const admin = adminClient();

    const { data: precos } = await stripe.prices.list({ lookup_keys: [preco as Preco], active: true, limit: 1 });
    if (!precos.length) throw new HttpError(500, 'preco_ausente', 'Esse plano não está disponível agora.');

    const cliente = await clienteDoUsuario(stripe, admin, usuario);

    // Quem já assina não paga de novo: trocar entre mensal e anual, ou atualizar o cartão, é no
    // portal. Conferido na Stripe, que é a verdade, e não só na tela (defeito provado em
    // e2e/stripe-cenarios.mjs: a função abria um segundo pagamento).
    const vivas = await stripe.subscriptions.list({ customer: cliente, status: 'all', limit: 20 });
    if (vivas.data.some((s) => s.status === 'active' || s.status === 'trialing' || s.status === 'past_due')) {
      throw new HttpError(409, 'ja_assina', 'Você já tem uma assinatura. Para trocar entre mensal e anual ou atualizar o cartão, use Gerenciar assinatura.');
    }
    // Um pagamento aberto em outra aba deixa de valer: só a sessão mais nova pode ser concluída.
    const abertas = await stripe.checkout.sessions.list({ customer: cliente, status: 'open', limit: 20 });
    for (const s of abertas.data) await stripe.checkout.sessions.expire(s.id).catch(() => {});

    const sessao = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: cliente,
      line_items: [{ price: precos[0].id, quantity: 1 }],
      // Sem lista de meios de pagamento: em modo assinatura a Stripe só oferece o que
      // aceita cobrança recorrente, e conta brasileira não faz Pix recorrente — ou seja, cartão.
      locale: 'pt-BR',
      // Preço sempre em reais, como a landing e os termos anunciam. Sem isto, o "Adaptive
      // Pricing" da conta converte para a moeda de quem acessa (quem abrisse de fora do país
      // veria, por exemplo, "US$ 1,73/mês" num plano anunciado por R$ 9,90).
      adaptive_pricing: { enabled: false },
      allow_promotion_codes: true,
      client_reference_id: usuario.id,
      subscription_data: { metadata: { supabase_user_id: usuario.id } },
      success_url: `${appUrl()}/planos?pagamento=concluido`,
      cancel_url: `${appUrl()}/planos?pagamento=cancelado`,
    });

    if (!sessao.url) throw new HttpError(502, 'sem_url', 'A Stripe não devolveu o endereço de pagamento.');
    return json(200, { url: sessao.url });
  } catch (e) {
    if (e instanceof HttpError) return json(e.status, { error: e.code, message: e.message });
    console.error('stripe_checkout_erro', e instanceof Error ? e.message : String(e));
    return json(500, { error: 'internal', message: 'Não foi possível abrir o pagamento. Tente de novo.' });
  }
});
