// Cenários difíceis da assinatura contra a Stripe DE TESTE, com as funções reais rodando aqui.
//
// Complementa o e2e/pagamento-stripe.mjs (o caminho feliz). Não entra em `npm run test:e2e`:
// exige a chave `sk_test_` da Stripe. Nenhum dinheiro se move; tudo é modo de teste.
//
// Como rodar (a chave de teste vem da variável STRIPE_SECRET_KEY ou de um proxy que a injete):
//   1. node e2e/fake-supabase.mjs 8091 &
//   2. As duas funções, com SUPABASE_URL=http://localhost:8091, SUPABASE_SERVICE_ROLE_KEY e
//      SUPABASE_ANON_KEY (tokens do fake-supabase) e STRIPE_SECRET_KEY:
//        STRIPE_WEBHOOK_SECRET=$SEGREDO DENO_SERVE_ADDRESS=tcp:127.0.0.1:8000 deno run --allow-all supabase/functions/stripe-webhook/index.ts
//        DENO_SERVE_ADDRESS=tcp:127.0.0.1:8001 deno run --allow-all supabase/functions/stripe-checkout/index.ts
//   3. STRIPE_WEBHOOK_SECRET=$SEGREDO node e2e/stripe-cenarios.mjs
//      (atrás de proxy de saída, use NODE_USE_ENV_PROXY=1)
//
// Cenários: cartão recusado; inadimplência na renovação (relógio de teste da Stripe); pedido de
// segundo pagamento por quem já assina; duas assinaturas da mesma pessoa; aviso repetido.
import assert from 'node:assert/strict';
import { Stripe, entregar, novoUsuario, passo, relatorio, sql, ultimoEvento } from './stripe-comum.mjs';

const CHECKOUT = process.env.CHECKOUT_URL ?? 'http://localhost:8001/';
const espelho = async (usuario) =>
  (await sql(`select plan, status, stripe_subscription_id, cancel_at_period_end from public.subscriptions where user_id = '${usuario}'`))[0];
const planoDe = async (usuario) => (await sql(`select public.plan_of('${usuario}') as p`))[0].p;
const contagem = async (evento) =>
  (await sql(`select count(*)::int as n from public.analytics_events where event = '${evento}'`))[0].n;
const precoMensal = async () => (await Stripe.get('/prices?lookup_keys[]=mais_mensal&active=true')).data[0].id;

/** Cliente da Stripe ligado ao usuário, com o cartão de teste dado como padrão. */
async function clienteCom(usuario, email, cartaoDeTeste, extra = {}) {
  const cliente = (await Stripe.post('/customers', { email, 'metadata[supabase_user_id]': usuario, ...extra })).id;
  await sql(`insert into public.subscriptions (user_id, stripe_customer_id) values ('${usuario}', '${cliente}') on conflict (user_id) do nothing`);
  const cartao = (await Stripe.post(`/payment_methods/${cartaoDeTeste}/attach`, { customer: cliente })).id;
  await Stripe.post(`/customers/${cliente}`, { 'invoice_settings[default_payment_method]': cartao });
  return cliente;
}
const assinar = async (cliente, usuario) =>
  Stripe.post('/subscriptions', { customer: cliente, 'items[0][price]': await precoMensal(), 'metadata[supabase_user_id]': usuario });

const limpar = [];

// ---------------------------------------------------------------------------------------------
await passo('cartão recusado: a assinatura fica incompleta e não libera o plano', async () => {
  const { usuario, email } = await novoUsuario('recusado');
  // 4000 0000 0000 0341: vincula ao cliente, mas toda cobrança é recusada.
  const cliente = await clienteCom(usuario, email, 'pm_card_chargeCustomerFail');
  limpar.push(() => Stripe.del(`/customers/${cliente}`));
  const antes = await contagem('subscription_completed');
  const assinatura = await assinar(cliente, usuario);
  assert.equal(assinatura.status, 'incomplete');
  const r = await entregar(await ultimoEvento('customer.subscription.created', assinatura.id));
  assert.equal(r.status, 200);
  assert.equal((await espelho(usuario)).status, 'incomplete');
  assert.equal(await planoDe(usuario), 'gratis');
  assert.equal(await contagem('subscription_completed'), antes, 'cobrança recusada não conta como assinatura');
});

// ---------------------------------------------------------------------------------------------
let ativo; // { usuario, token, cliente, assinatura } com uma assinatura ativa, para os próximos
await passo('aviso repetido conta a assinatura uma vez só (espelho e medição)', async () => {
  const u = await novoUsuario('repetido');
  const cliente = await clienteCom(u.usuario, u.email, 'pm_card_visa');
  limpar.push(() => Stripe.del(`/customers/${cliente}`));
  const antes = await contagem('subscription_completed');
  const assinatura = await assinar(cliente, u.usuario);
  assert.equal(assinatura.status, 'active');
  const evento = await ultimoEvento('customer.subscription.created', assinatura.id);
  for (let i = 0; i < 3; i += 1) assert.equal((await entregar(evento)).status, 200);
  await entregar(await ultimoEvento('invoice.paid', assinatura.id));
  assert.equal((await espelho(u.usuario)).status, 'active');
  assert.equal(await planoDe(u.usuario), 'mais');
  assert.equal(await contagem('subscription_completed'), antes + 1);
  ativo = { ...u, cliente, assinatura };
});

// ---------------------------------------------------------------------------------------------
await passo('quem já assina não consegue abrir um segundo pagamento', async () => {
  assert.ok(ativo, 'depende do cenário anterior');
  const r = await fetch(CHECKOUT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ativo.token}` },
    body: JSON.stringify({ preco: 'mais_anual' }),
  });
  const corpo = await r.json();
  assert.equal(r.status, 409, `esperava recusa, veio ${r.status} ${JSON.stringify(corpo).slice(0, 80)}`);
  assert.equal(corpo.error, 'ja_assina');
});

// ---------------------------------------------------------------------------------------------
await passo('duas abas de pagamento: só a mais nova continua valendo', async () => {
  const u = await novoUsuario('duas-abas');
  const abrir = async () => {
    const r = await fetch(CHECKOUT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${u.token}` },
      body: JSON.stringify({ preco: 'mais_mensal' }),
    });
    assert.equal(r.status, 200);
    return (await r.json()).url;
  };
  const primeira = await abrir();
  const segunda = await abrir();
  const id = (url) => /\/(cs_test_[A-Za-z0-9]+)/.exec(url)[1];
  assert.equal((await Stripe.get(`/checkout/sessions/${id(primeira)}`)).status, 'expired');
  assert.equal((await Stripe.get(`/checkout/sessions/${id(segunda)}`)).status, 'open');
  const cliente = (await sql(`select stripe_customer_id from public.subscriptions where user_id = '${u.usuario}'`))[0]?.stripe_customer_id;
  if (cliente) limpar.push(() => Stripe.del(`/customers/${cliente}`));
});

// ---------------------------------------------------------------------------------------------
await passo('com duas assinaturas, cancelar uma não tira o plano de quem ainda paga a outra', async () => {
  assert.ok(ativo, 'depende do cenário anterior');
  // Duas abas de pagamento concluídas, ou um clique duplo: a Stripe aceita as duas.
  const segunda = await assinar(ativo.cliente, ativo.usuario);
  assert.equal(segunda.status, 'active');
  await entregar(await ultimoEvento('customer.subscription.created', segunda.id));
  await Stripe.del(`/subscriptions/${ativo.assinatura.id}`); // a pessoa cancela a primeira
  await entregar(await ultimoEvento('customer.subscription.deleted', ativo.assinatura.id));
  const e = await espelho(ativo.usuario);
  assert.equal(e.status, 'active', `o espelho deveria seguir a assinatura viva: ${JSON.stringify(e)}`);
  assert.equal(e.stripe_subscription_id, segunda.id);
  assert.equal(await planoDe(ativo.usuario), 'mais');
});

// ---------------------------------------------------------------------------------------------
await passo('renovação recusada (relógio de teste): fica em atraso, com o prazo de 3 dias do plano', async () => {
  const { usuario, email } = await novoUsuario('atraso');
  const agora = Math.floor(Date.now() / 1000);
  const relogio = await Stripe.post('/test_helpers/test_clocks', { frozen_time: String(agora), name: 'meu-carrin-atraso' });
  limpar.push(() => Stripe.del(`/test_helpers/test_clocks/${relogio.id}`)); // apaga cliente e assinatura junto
  const cliente = await clienteCom(usuario, email, 'pm_card_visa', { test_clock: relogio.id });
  const assinatura = await assinar(cliente, usuario);
  assert.equal(assinatura.status, 'active');
  await entregar(await ultimoEvento('customer.subscription.created', assinatura.id));
  assert.equal(await planoDe(usuario), 'mais');

  // O cartão passa a recusar, e o relógio anda para depois da renovação.
  const ruim = (await Stripe.post('/payment_methods/pm_card_chargeCustomerFail/attach', { customer: cliente })).id;
  await Stripe.post(`/customers/${cliente}`, { 'invoice_settings[default_payment_method]': ruim });
  await Stripe.post(`/test_helpers/test_clocks/${relogio.id}/advance`, { frozen_time: String(agora + 35 * 24 * 3600) });
  for (let i = 0; i < 40; i += 1) {
    if ((await Stripe.get(`/test_helpers/test_clocks/${relogio.id}`)).status === 'ready') break;
    await new Promise((r) => setTimeout(r, 3000));
  }
  const atual = await Stripe.get(`/subscriptions/${assinatura.id}`);
  assert.equal(atual.status, 'past_due', `a Stripe deveria marcar atraso, está ${atual.status}`);
  const r = await entregar(await ultimoEvento('invoice.payment_failed', assinatura.id, 60));
  assert.equal(r.status, 200);
  assert.equal((await espelho(usuario)).status, 'past_due');
  // O fim do período está no tempo do relógio de teste (no futuro): o plano segue valendo no prazo.
  assert.equal(await planoDe(usuario), 'mais');
});

for (const f of limpar.reverse()) await f().catch(() => {});
relatorio();
