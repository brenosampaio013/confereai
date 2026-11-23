// Ciclo da assinatura contra a Stripe DE TESTE, com as funções reais rodando aqui.
//
// Não entra em `npm run test:e2e`: exige uma chave `sk_test_` da Stripe, que não existe nas
// máquinas de build. É o roteiro para reconferir o pagamento quando algo mudar.
//
// Como rodar:
//   1. Tenha a chave de teste disponível para o processo (variável STRIPE_SECRET_KEY, ou um
//      proxy que a injete nas chamadas a api.stripe.com).
//   2. node e2e/fake-supabase.mjs 8091 &
//   3. SEGREDO=whsec_qualquer_coisa_so_deste_teste
//      deno run --allow-all supabase/functions/stripe-webhook/index.ts   (porta 8000)
//      com SUPABASE_URL=http://localhost:8091, SUPABASE_SERVICE_ROLE_KEY=<jwt role=service_role>,
//      STRIPE_WEBHOOK_SECRET=$SEGREDO
//   4. node e2e/pagamento-stripe.mjs
//      (atrás de proxy de saída, use NODE_USE_ENV_PROXY=1 — o fetch do Node não lê HTTPS_PROXY sozinho)
//
// O que ele faz: cria cliente e assinatura de teste com o cartão 4242, pega os avisos REAIS da
// Stripe, assina cada um como ela assina e entrega à função de webhook; confere o espelho no
// banco a cada passo; agenda o cancelamento, cancela, e confirma a volta ao plano grátis.
// Nenhum dinheiro se move: tudo acontece no modo de teste da Stripe.
import { createHmac } from 'node:crypto';
import assert from 'node:assert/strict';

const API = 'https://api.stripe.com/v1';
const CHAVE = process.env.STRIPE_SECRET_KEY ?? 'sk_test_proxy_injected';
const SEGREDO = process.env.STRIPE_WEBHOOK_SECRET;
const WEBHOOK = process.env.WEBHOOK_URL ?? 'http://localhost:8000/';
const FAKE = process.env.FAKE_SUPABASE ?? 'http://localhost:8091';
if (!SEGREDO) throw new Error('defina STRIPE_WEBHOOK_SECRET com o mesmo valor dado à função');

const resultados = [];
const passo = async (nome, fn) => {
  try {
    await fn();
    resultados.push(`ok   ${nome}`);
  } catch (e) {
    resultados.push(`FAIL ${nome}: ${String(e.message).split('\n')[0]}`);
  }
};

const stripe = async (caminho, corpo, metodo = corpo ? 'POST' : 'GET') => {
  const r = await fetch(`${API}${caminho}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${CHAVE}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: corpo ? new URLSearchParams(corpo).toString() : undefined,
  });
  const d = await r.json();
  if (d.error) throw new Error(`${caminho}: ${d.error.message}`);
  return d;
};

const sql = async (texto) =>
  (await (await fetch(`${FAKE}/__debug/sql`, { method: 'POST', body: JSON.stringify({ sql: texto }) })).json());

/** Entrega um aviso real da Stripe à função, assinado como ela assina. */
async function entregar(evento, { assinaturaErrada = false } = {}) {
  const corpo = JSON.stringify(evento);
  const t = Math.floor(Date.now() / 1000);
  const v1 = assinaturaErrada ? '0'.repeat(64) : createHmac('sha256', SEGREDO).update(`${t}.${corpo}`).digest('hex');
  const r = await fetch(WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'stripe-signature': `t=${t},v1=${v1}` },
    body: corpo,
  });
  return { status: r.status, corpo: await r.json().catch(() => null) };
}

/**
 * O aviso real da Stripe para esta assinatura. Ela leva alguns segundos para publicar o evento,
 * por isso a espera; e filtramos pelo id da assinatura para não pegar o de uma rodada anterior.
 */
const ultimoEvento = async (tipo, assinaturaId) => {
  for (let tentativa = 0; tentativa < 15; tentativa += 1) {
    const { data } = await stripe('/events?limit=40');
    const e = data.find((x) => x.type === tipo && JSON.stringify(x.data.object).includes(assinaturaId));
    if (e) return e;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`a Stripe não publicou o aviso ${tipo} desta assinatura em 30 s`);
};
const espelho = async () =>
  (await sql(`select plan, status, cancel_at_period_end from public.subscriptions where user_id = '${usuario}'`))[0];

// --- o usuário e o cliente ------------------------------------------------
const email = `pagante.${Date.now()}@auto.local`;
const sessao = await (await fetch(`${FAKE}/auth/v1/signup`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password: 'Compra2026!' }),
})).json();
const usuario = sessao.user.id;
const cliente = (await stripe('/customers', { email, 'metadata[supabase_user_id]': usuario })).id;
await sql(`insert into public.subscriptions (user_id, stripe_customer_id) values ('${usuario}', '${cliente}')`);
// pm_card_visa é o apelido de teste do cartão 4242 4242 4242 4242; anexar gera um id próprio.
const cartao = (await stripe('/payment_methods/pm_card_visa/attach', { customer: cliente })).id;
await stripe(`/customers/${cliente}`, { 'invoice_settings[default_payment_method]': cartao });

let assinatura;
await passo('assinar o plano mensal cobra R$ 9,90 e deixa a assinatura ativa', async () => {
  const preco = (await stripe('/prices?lookup_keys[]=mais_mensal&active=true')).data[0];
  assert.equal(preco.unit_amount, 990);
  assert.equal(preco.currency, 'brl');
  assinatura = await stripe('/subscriptions', {
    customer: cliente,
    'items[0][price]': preco.id,
    'metadata[supabase_user_id]': usuario,
  });
  assert.equal(assinatura.status, 'active');
  assert.ok(assinatura.latest_invoice, 'deveria ter gerado fatura');
});

await passo('aviso com assinatura errada é recusado e não libera plano nenhum', async () => {
  const r = await entregar(await ultimoEvento('customer.subscription.created', assinatura.id), { assinaturaErrada: true });
  assert.equal(r.status, 400);
  assert.equal((await espelho()).plan, 'gratis');
});

await passo('aviso verdadeiro libera o plano Mais no espelho', async () => {
  const r = await entregar(await ultimoEvento('customer.subscription.created', assinatura.id));
  assert.equal(r.status, 200);
  assert.deepEqual(await espelho(), { plan: 'mais', status: 'active', cancel_at_period_end: false });
});

await passo('aviso repetido e fatura paga fora de ordem não causam dano', async () => {
  await entregar(await ultimoEvento('customer.subscription.created', assinatura.id));
  await entregar(await ultimoEvento('invoice.paid', assinatura.id));
  assert.deepEqual(await espelho(), { plan: 'mais', status: 'active', cancel_at_period_end: false });
  assert.equal((await sql(`select count(*)::int as n from public.subscriptions where user_id = '${usuario}'`))[0].n, 1);
});

await passo('cancelamento agendado mantém o plano e marca que não renova', async () => {
  await stripe(`/subscriptions/${assinatura.id}`, { cancel_at_period_end: 'true' });
  await entregar(await ultimoEvento('customer.subscription.updated', assinatura.id));
  assert.deepEqual(await espelho(), { plan: 'mais', status: 'active', cancel_at_period_end: true });
});

await passo('cancelamento efetivado devolve a pessoa ao plano grátis', async () => {
  await stripe(`/subscriptions/${assinatura.id}`, null, 'DELETE');
  await entregar(await ultimoEvento('customer.subscription.deleted', assinatura.id));
  assert.equal((await espelho()).status, 'canceled');
  const plano = (await sql(`select public.plan_of('${usuario}') as p`))[0].p;
  assert.equal(plano, 'gratis');
});

await stripe(`/customers/${cliente}`, null, 'DELETE'); // limpa o cliente de teste
console.log(resultados.join('\n'));
process.exit(resultados.some((r) => r.startsWith('FAIL')) ? 1 : 0);
