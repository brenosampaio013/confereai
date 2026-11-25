// Medição do funil (decisão 5 da reformulação 2.0), no PostgreSQL real (PGlite).
// Só contagem de eventos: nenhum dado de pessoa entra na tabela.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, as, err } from './helpers.mjs';

const ANA = '00000000-0000-4000-8000-0000000000a1';
let db;
const q = async (user, sql, params) => (await as(db, user, () => db.query(sql, params))).rows;
const registrar = (user, evento, origem, dados) =>
  q(user, 'select public.registrar_evento($1, $2, $3::jsonb)', [evento, origem, dados === undefined ? null : JSON.stringify(dados)]);
const linhas = async () => (await db.query('select event, source, props, ref, user_id is null as sem_dono from (select *, null::uuid as user_id from public.analytics_events) e order by id')).rows;

before(async () => {
  db = await createDb();
  await db.query('insert into auth.users (id) values ($1)', [ANA]);
});
after(async () => { await db.close(); });

test('visitante do site e pessoa com conta registram os eventos do funil', async () => {
  await registrar(null, 'page_view', 'site', { pagina: '/' });
  await registrar(null, 'pricing_viewed', 'site');
  await registrar(ANA, 'checkout_started', 'app', { plano: 'mais', periodo: 'anual' });
  await registrar(ANA, 'free_limit_reached', 'app', { tipo: 'cupom' });
  const r = await linhas();
  assert.deepEqual(r.map((l) => [l.event, l.source]), [
    ['page_view', 'site'], ['pricing_viewed', 'site'], ['checkout_started', 'app'], ['free_limit_reached', 'app'],
  ]);
  assert.deepEqual(r[2].props, { plano: 'mais', periodo: 'anual' });
});

test('a tabela não tem nenhuma coluna que identifique a pessoa', async () => {
  const { rows } = await db.query(
    "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'analytics_events' order by ordinal_position",
  );
  assert.deepEqual(rows.map((r) => r.column_name), ['id', 'event', 'source', 'props', 'ref', 'created_at']);
});

test('eventos fora da lista do briefing são recusados', async () => {
  for (const ruim of ['clique', 'login', 'PAGE_VIEW', '']) {
    assert.match(await err(registrar(null, ruim, 'site')), /evento inválido/);
  }
});

test('o app e o site não conseguem registrar eventos de assinatura (só o webhook)', async () => {
  for (const ev of ['subscription_completed', 'subscription_canceled']) {
    assert.match(await err(registrar(ANA, ev, 'app', { plano: 'mais' })), /evento inválido/);
  }
  assert.match(await err(registrar(null, 'page_view', 'servidor')), /origem inválida/);
});

test('dados livres que poderiam carregar informação pessoal são recusados', async () => {
  const casos = [
    [{ email: 'ana@exemplo.test' }, /dado não permitido/],
    [{ pagina: '/?email=ana@exemplo.test' }, /valor inválido/],
    [{ pagina: '/planos?ref=x' }, /valor inválido/],
    [{ lugar: 'Ana Souza' }, /valor inválido/],
    [{ lugar: '11987654321' }, /valor inválido/],
    [{ plano: 'familia' }, /valor inválido/],
    [{ periodo: 'semanal' }, /valor inválido/],
    [{ tipo: 3 }, /valor inválido/],
    [[1, 2], /dados inválidos/],
  ];
  for (const [dados, erro] of casos) assert.match(await err(registrar(null, 'upgrade_clicked', 'site', dados)), erro, JSON.stringify(dados));
});

test('ninguém lê, altera ou apaga os eventos pelo app ou pelo site', async () => {
  for (const user of [null, ANA]) {
    assert.match(await err(q(user, 'select * from public.analytics_events')), /permission denied/);
    assert.match(await err(q(user, "insert into public.analytics_events (event, source) values ('page_view', 'site')")), /permission denied/);
    assert.match(await err(q(user, 'update public.analytics_events set event = event')), /permission denied/);
    assert.match(await err(q(user, 'delete from public.analytics_events')), /permission denied/);
  }
});

test('o servidor grava os eventos de assinatura uma vez só por referência', async () => {
  const ins = "insert into public.analytics_events (event, source, props, ref) values ($1, 'servidor', $2::jsonb, $3) on conflict (ref) do nothing";
  await db.query(ins, ['subscription_completed', '{"plano":"mais","periodo":"mensal"}', 'concluida:abc']);
  await db.query(ins, ['subscription_completed', '{"plano":"mais","periodo":"mensal"}', 'concluida:abc']);
  await db.query(ins, ['subscription_canceled', '{"plano":"mais","periodo":"mensal"}', 'cancelada:abc']);
  const { rows } = await db.query("select event, count(*)::int n from public.analytics_events where source = 'servidor' group by event order by event");
  assert.deepEqual(rows, [{ event: 'subscription_canceled', n: 1 }, { event: 'subscription_completed', n: 1 }]);
});

test('o servidor não consegue gravar um evento fora da lista', async () => {
  assert.match(await err(db.query("insert into public.analytics_events (event, source) values ('qualquer', 'servidor')")), /violates check constraint/);
});
