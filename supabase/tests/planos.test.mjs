// Planos e cota mensal de leitura automática, no PostgreSQL real (PGlite), com as migrações do projeto.
// Os identificadores de Stripe abaixo são FICTÍCIOS, criados só para o teste.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, as, err } from './helpers.mjs';

let db;
const ANA = '11111111-1111-4111-8111-111111111111';
const BENTO = '22222222-2222-4222-8222-222222222222';

const q = async (user, sql, params) => (await as(db, user, () => db.query(sql, params))).rows;
const plano = async (user) => (await q(user, 'select public.my_plan() as p'))[0].p;
const cota = async (user, kind) => (await q(user, 'select * from public.ocr_allowance($1)', [kind]))[0];

/** Grava leituras já feitas, como o servidor faria (o gatilho exige sessão e crava o dono). */
const usar = (user, kind, quantas) =>
  as(db, user, () => db.query(
    `insert into public.ocr_usage (kind, images, provider)
     select $1, 1, 'teste' from generate_series(1, $2)`,
    [kind, quantas],
  ));

const assinar = (user, { status = 'active', plan = 'mais', fim = null, preco = 'mais_mensal' } = {}) =>
  db.query(
    `insert into public.subscriptions (user_id, stripe_customer_id, stripe_subscription_id, plan, status, price_lookup_key, current_period_end)
     values ($1::uuid, 'cus_' || ($1::text), 'sub_' || ($1::text), $2, $3, $4, $5)
     on conflict (user_id) do update set plan = $2, status = $3, price_lookup_key = $4, current_period_end = $5`,
    [user, plan, status, preco, fim],
  );

before(async () => {
  db = await createDb();
  await db.query('insert into auth.users (id) values ($1), ($2)', [ANA, BENTO]);
});
after(async () => { await db.close(); });

test('sem assinatura, a pessoa está no plano grátis com os limites da landing', async () => {
  const p = await plano(ANA);
  assert.equal(p.plano, 'gratis');
  assert.equal(p.status, 'none');
  assert.equal(p.etiqueta.limite, 20);
  assert.equal(p.cupom.limite, 4);
  assert.equal(p.etiqueta.resta, 20);
});

test('cada tipo de leitura consome o seu próprio balde', async () => {
  await usar(ANA, 'label', 3);
  await usar(ANA, 'product', 2); // foto do produto também é etiqueta
  await usar(ANA, 'receipt', 1);
  const etiqueta = await cota(ANA, 'label');
  const cupom = await cota(ANA, 'receipt');
  assert.deepEqual(
    { usado: etiqueta.used, resta: etiqueta.remaining, balde: etiqueta.bucket },
    { usado: 5, resta: 15, balde: 'etiqueta' },
  );
  assert.deepEqual({ usado: cupom.used, resta: cupom.remaining }, { usado: 1, resta: 3 });
});

test('a cota não fica negativa quando o limite já foi passado', async () => {
  await usar(BENTO, 'receipt', 9);
  const c = await cota(BENTO, 'receipt');
  assert.equal(c.monthly_limit, 4);
  assert.equal(c.remaining, 0);
});

test('leitura do mês passado não conta na cota deste mês', async () => {
  await as(db, ANA, () => db.query(
    `insert into public.ocr_usage (kind, images, provider, created_at)
     values ('receipt', 1, 'teste', public.month_start() - interval '1 day')`,
  ));
  assert.equal((await cota(ANA, 'receipt')).used, 1); // só a deste mês
});

test('assinante do Mais passa a ter um balde único de 300 leituras', async () => {
  await assinar(ANA);
  const p = await plano(ANA);
  assert.equal(p.plano, 'mais');
  assert.equal(p.etiqueta.limite, 300);
  assert.equal(p.cupom.limite, 300);
  // Usou 5 etiquetas + 1 cupom neste mês: o balde total já contou os seis.
  assert.equal(p.etiqueta.resta, 294);
});

test('cobrança atrasada mantém o plano por três dias, e depois não', async () => {
  await assinar(ANA, { status: 'past_due', fim: new Date(Date.now() - 24 * 3600 * 1000) });
  assert.equal((await plano(ANA)).plano, 'mais');
  await assinar(ANA, { status: 'past_due', fim: new Date(Date.now() - 5 * 24 * 3600 * 1000) });
  assert.equal((await plano(ANA)).plano, 'gratis');
});

test('assinatura cancelada volta para o plano grátis', async () => {
  await assinar(ANA, { status: 'canceled' });
  const p = await plano(ANA);
  assert.equal(p.plano, 'gratis');
  assert.equal(p.etiqueta.limite, 20);
});

test('tipo de leitura inventado é recusado', async () => {
  assert.match(await err(q(ANA, 'select * from public.ocr_allowance($1)', ['qualquer'])), /inválido/);
});

test('ninguém consegue se tornar assinante pelo aplicativo', async () => {
  // Inserir é recusado pela RLS (não há política de inserção).
  const inserir = err(q(BENTO, `insert into public.subscriptions (user_id, stripe_customer_id, plan, status)
    values ($1::uuid, 'cus_falso', 'mais', 'active')`, [BENTO]));
  assert.match(await inserir, /permission denied|row-level security/);

  // Alterar e apagar não dão erro: sem política, a RLS simplesmente não encontra linha para
  // mexer. O que importa é o efeito — por isso o teste confere o estado, não a mensagem.
  await assinar(BENTO, { status: 'canceled', plan: 'gratis' });
  await q(BENTO, `update public.subscriptions set status = 'active', plan = 'mais' where user_id = $1::uuid`, [BENTO]);
  await q(BENTO, 'delete from public.subscriptions where user_id = $1::uuid', [BENTO]);
  const depois = (await db.query('select plan, status from public.subscriptions where user_id = $1', [BENTO])).rows;
  assert.deepEqual(depois, [{ plan: 'gratis', status: 'canceled' }], 'a linha deveria ficar como o servidor deixou');
  assert.equal((await plano(BENTO)).plano, 'gratis');
});

test('nem com conta nem como visitante se apaga a tabela inteira', async () => {
  // TRUNCATE não passa por política de linha: se o privilégio existir, a RLS não protege.
  // Por isso ele é revogado na migração de privilégios.
  for (const quem of [BENTO, null]) {
    assert.match(await err(q(quem, 'truncate public.subscriptions')), /permission denied/);
    assert.match(await err(q(quem, 'truncate public.plan_limits')), /permission denied/);
    assert.match(await err(q(quem, 'truncate public.ocr_usage')), /permission denied/);
  }
  assert.equal((await db.query('select count(*)::int as n from public.plan_limits')).rows[0].n, 7);
});

test('cada pessoa vê apenas a própria assinatura', async () => {
  const vistas = await q(ANA, 'select user_id from public.subscriptions');
  assert.deepEqual(vistas, [{ user_id: ANA }]);
});

test('sem sessão, nada de plano nem de cota', async () => {
  assert.match(await err(q(null, 'select public.my_plan()')), /permission denied|not authenticated/);
  assert.match(await err(q(null, 'select * from public.ocr_allowance($1)', ['label'])), /permission denied|not authenticated/);
});

test('visitante enxerga a tabela de limites, que é informação pública', async () => {
  const linhas = await q(null, 'select plan, bucket, monthly_limit from public.plan_limits order by plan, bucket');
  assert.deepEqual(linhas, [
    { plan: 'gratis', bucket: 'cupom', monthly_limit: 4 },
    { plan: 'gratis', bucket: 'etiqueta', monthly_limit: 20 },
    { plan: 'gratis', bucket: 'voz', monthly_limit: 0 },
    { plan: 'ia', bucket: 'total', monthly_limit: 600 },
    { plan: 'ia', bucket: 'voz', monthly_limit: 150 },
    { plan: 'mais', bucket: 'total', monthly_limit: 300 },
    { plan: 'mais', bucket: 'voz', monthly_limit: 0 },
  ]);
});

test('o assistente de voz só existe no plano IA', async () => {
  // Grátis e Mais têm o balde de voz zerado: é isso que o servidor lê para recusar.
  assert.equal((await cota(ANA, 'voice')).remaining, 0);
  await assinar(ANA, { plan: 'mais', status: 'active' });
  assert.equal((await cota(ANA, 'voice')).remaining, 0);
  await assinar(ANA, { plan: 'ia', status: 'active', preco: 'ia_mensal' });
  const voz = await cota(ANA, 'voice');
  assert.equal(voz.monthly_limit, 150);
  assert.equal(voz.remaining, 150);
});

test('no plano IA a conversa consome o balde de voz e o total', async () => {
  await assinar(ANA, { plan: 'ia', status: 'active', preco: 'ia_mensal' });
  await usar(ANA, 'voice', 3);
  const voz = await cota(ANA, 'voice');
  assert.deepEqual({ usado: voz.used, resta: voz.remaining, balde: voz.bucket }, { usado: 3, resta: 147, balde: 'voz' });
  // As leituras por foto do mesmo mês somam no total de 600, junto com as conversas.
  const etiqueta = await cota(ANA, 'label');
  assert.equal(etiqueta.monthly_limit, 600);
  assert.equal(etiqueta.bucket, 'total');
});

test('a tela de planos mostra o uso do assistente', async () => {
  await assinar(ANA, { plan: 'ia', status: 'active', preco: 'ia_anual' });
  const p = await plano(ANA);
  assert.equal(p.plano, 'ia');
  assert.equal(p.voz.limite, 150);
  assert.ok(p.voz.usado >= 3, 'as conversas já feitas deveriam contar');
});
