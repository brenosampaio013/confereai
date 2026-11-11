// Orçamento/histórico (dados pessoais) e base compartilhada de preços, no PostgreSQL real (PGlite).
// Supermercados, produtos e preços abaixo são DADOS FICTÍCIOS criados somente para os testes.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createDb, as, err } from './helpers.mjs';

let db;
const ADMIN = randomUUID(); const A = randomUUID(); const B = randomUUID(); const ANON = randomUUID();
let loc1, loc2, pending;
const q = async (user, sql, params) => (await as(db, user, () => db.query(sql, params))).rows;
const now = () => new Date().toISOString();
const daysAgo = (n) => new Date(Date.now() - n * 86400e3).toISOString();
const report = async (user, list) => (await q(user, 'select public.report_prices($1) as r', [JSON.stringify(list)]))[0].r;
const prices = (user, args) => {
  const keys = Object.keys(args);
  return q(user, `select * from public.community_prices(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')})`, keys.map((k) => args[k]));
};
const arroz = (over = {}) => ({ id: randomUUID(), location_id: loc1, barcode: '7893500018469', name: 'Arroz Tio João', brand: 'Tio João', package_amount: 5000, package_unit: 'g', sale_unit: 'un', unit_price_cents: 2899, promo: false, observed_at: now(), ...over });

before(async () => {
  db = await createDb();
  await db.exec(`insert into auth.users (id, is_anonymous) values ('${ADMIN}', false), ('${A}', false), ('${B}', false), ('${ANON}', true);
                 insert into public.app_admins (user_id) values ('${ADMIN}');`);
  const m = (await db.query(`insert into public.supermarkets (name, normalized_name, status) values ('Supermercado A', 'supermercado a', 'approved'), ('Supermercado B', 'supermercado b', 'approved') returning id`)).rows;
  const l = (await db.query(
    `insert into public.supermarket_locations (supermarket_id, address, neighborhood, city, state, latitude, longitude, status) values
     ($1, 'Rua Um, 100', 'Centro', 'São Paulo', 'SP', -23.55, -46.63, 'approved'),
     ($2, 'Rua Dois, 200', 'Bairro', 'São Paulo', 'SP', -23.56, -46.64, 'approved'),
     ($2, 'Rua Três, 300', 'Vila', 'Campinas', 'SP', -22.90, -47.06, 'pending') returning id`, [m[0].id, m[1].id])).rows;
  [loc1, loc2, pending] = l.map((r) => r.id);
});
after(async () => { await db.close(); });

test('orçamento, unidade e preço normal são gravados na compra do próprio usuário', async () => {
  const pid = randomUUID(); const prod = randomUUID(); const item = randomUUID(); const ph = randomUUID();
  await q(A, `insert into public.purchases (id, status, mode, started_at, budget_cents, store_name, store_location_id) values ($1, 'active', 'cart', $2, 40000, 'Supermercado A', $3)`, [pid, now(), loc1]);
  await q(A, `insert into public.products (id, name, source) values ($1, 'Arroz', 'community')`, [prod]);
  await q(A, `insert into public.cart_items (id, purchase_id, product_id, name, sale_unit, quantity_milli, unit_price_cents, regular_price_cents, price_source, added_via, created_at)
              values ($1, $2, $3, 'Arroz', 'un', 1000, 2899, 3299, 'photo_ai', 'manual', $4)`, [item, pid, prod, now()]);
  await q(A, `insert into public.price_history (id, product_id, purchase_id, cart_item_id, store_name, store_location_id, sale_unit, unit_price_cents, regular_price_cents, source, promo, recorded_at)
              values ($1, $2, $3, $4, 'Supermercado A', $5, 'un', 2899, 3299, 'photo_ai', true, $6)`, [ph, prod, pid, item, loc1, now()]);
  assert.equal((await q(A, 'select budget_cents from public.purchases where id = $1', [pid]))[0].budget_cents, 40000);
  // Outra pessoa não vê nem altera a compra, o orçamento ou o histórico de preços.
  assert.equal((await q(B, 'select id from public.purchases')).length, 0);
  assert.equal((await q(B, 'select id from public.price_history')).length, 0);
  assert.equal((await q(B, 'select id from public.cart_items')).length, 0);
  await q(B, 'update public.purchases set budget_cents = 1 where id = $1', [pid]);
  assert.equal((await db.query('select budget_cents from public.purchases where id = $1', [pid])).rows[0].budget_cents, 40000);
  assert.match(await err(q(null, 'select budget_cents from public.purchases')), /permission denied/);
});

test('orçamento zero ou negativo e origens de preço desconhecidas são recusados', async () => {
  assert.match(await err(q(A, `insert into public.purchases (id, status, mode, started_at, budget_cents) values ($1, 'active', 'cart', $2, 0)`, [randomUUID(), now()])), /check constraint/);
  assert.match(await err(q(A, `insert into public.purchases (id, status, mode, started_at, budget_cents) values ($1, 'active', 'cart', $2, -100)`, [randomUUID(), now()])), /check constraint/);
  const pid = randomUUID();
  await q(A, `insert into public.purchases (id, status, mode, started_at) values ($1, 'active', 'cart', $2)`, [pid, now()]);
  assert.match(await err(q(A, `insert into public.cart_items (id, purchase_id, name, sale_unit, quantity_milli, unit_price_cents, price_source, added_via, created_at)
    values ($1, $2, 'X', 'un', 1000, 100, 'inventado', 'manual', $3)`, [randomUUID(), pid, now()])), /check constraint/);
});

test('a base compartilhada só é acessível pelas funções', async () => {
  for (const user of [A, null]) {
    assert.match(await err(q(user, 'select * from public.price_reports')), /permission denied/);
    assert.match(await err(q(user, 'select * from public.shared_products')), /permission denied/);
    assert.match(await err(q(user, `insert into public.shared_products (name_key, name) values ('x', 'Falso')`)), /permission denied/);
  }
  assert.match(await err(report(null, [arroz()])), /permission denied/);
  assert.match(await err(report(ANON, [arroz()])), /Crie uma conta/);
  assert.match(await err(q(A, 'select public.purge_old_price_reports()')), /permission denied/);
  assert.match(await err(q(A, `select public.admin_remove_user_prices('${B}')`)), /moderação|admin|permiss/i);
});

test('exemplo do pedido: Supermercado A R$ 28,99 × Supermercado B R$ 32,99', async () => {
  const r1 = await report(A, [arroz()]);
  assert.equal(r1.accepted, 1);
  await report(B, [arroz({ location_id: loc2, unit_price_cents: 3299 })]);
  const rows = await prices(null, { p_barcode: '7893500018469' }); // consulta funciona sem conta
  assert.deepEqual(rows.map((r) => [r.supermarket_name, r.neighborhood, r.unit_price_cents]), [['Supermercado A', 'Centro', 2899], ['Supermercado B', 'Bairro', 3299]]);
  // Nenhuma coluna identifica quem informou.
  assert.deepEqual(Object.keys(rows[0]).sort(), ['address', 'city', 'location_id', 'neighborhood', 'observed_at', 'promo', 'regular_price_cents', 'reporters', 'sale_unit', 'state', 'supermarket_name', 'unit_price_cents']);
  assert.ok(!JSON.stringify(rows).includes(A) && !JSON.stringify(rows).includes(B));
  assert.equal((await prices(A, { p_barcode: '7893500018469', p_city: 'Campinas' })).length, 0);
});

test('o cadastro do produto fica disponível para quem lê o mesmo código', async () => {
  const r = await q(null, `select * from public.lookup_shared_product('7893500018469')`);
  assert.deepEqual(r[0], { name: 'Arroz Tio João', brand: 'Tio João', package_amount: 5000, package_unit: 'g', sale_unit: 'un' });
  assert.equal((await q(null, `select * from public.lookup_shared_product('0000000000000')`)).length, 0);
  // O primeiro cadastro não é sobrescrito por um envio posterior com outro nome.
  await report(B, [arroz({ name: 'NOME VANDALIZADO', observed_at: now() })]);
  assert.equal((await q(null, `select name from public.lookup_shared_product('7893500018469')`))[0].name, 'Arroz Tio João');
});

test('reenviar não duplica: uma informação por pessoa, produto, unidade e dia', async () => {
  const same = arroz({ unit_price_cents: 2799 });
  await report(A, [same]);
  await report(A, [same]);
  const n = (await db.query(`select count(*)::int as c from public.price_reports where user_id = '${A}' and location_id = '${loc1}'`)).rows[0].c;
  assert.equal(n, 1);
  const rows = await prices(A, { p_barcode: '7893500018469' });
  assert.equal(rows.find((r) => r.location_id === loc1).unit_price_cents, 2799); // correção do mesmo dia substitui
  assert.equal(rows.find((r) => r.location_id === loc1).reporters, 2); // A e B informaram nesta unidade
});

test('recusa em definitivo dados inválidos, unidades não aprovadas e preços antigos', async () => {
  const bad = [
    arroz({ unit_price_cents: 0 }), arroz({ unit_price_cents: 99999999 }), arroz({ unit_price_cents: 'abc' }),
    arroz({ name: 'x' }), arroz({ sale_unit: 'caixa' }), arroz({ location_id: pending }), arroz({ location_id: randomUUID() }),
    arroz({ observed_at: daysAgo(45) }), arroz({ observed_at: new Date(Date.now() + 86400e3).toISOString() }),
    arroz({ regular_price_cents: 100 }), // "normal" menor que o preço informado
    arroz({ location_id: 'não-é-uuid' }),
  ];
  const before = (await db.query('select count(*)::int as c from public.price_reports')).rows[0].c;
  const r = await report(A, bad);
  assert.equal(r.accepted, 0);
  assert.equal(r.handled.length, bad.length); // tratados: o aparelho não fica reenviando
  assert.equal((await db.query('select count(*)::int as c from public.price_reports')).rows[0].c, before);
  assert.match(await err(report(A, { nao: 'lista' })), /inválida/);
  assert.match(await err(report(A, Array.from({ length: 101 }, () => arroz()))), /máximo 100/);
});

test('produto sem código de barras é identificado por nome, marca e embalagem', async () => {
  const feijao = { barcode: null, name: 'Feijão Carioca', brand: 'Kicaldo', package_amount: 1000, package_unit: 'g' };
  await report(A, [arroz({ ...feijao, unit_price_cents: 799 })]);
  await report(B, [arroz({ ...feijao, name: 'FEIJAO  CARIOCA', brand: 'kicaldo', location_id: loc2, unit_price_cents: 849, regular_price_cents: 999 })]);
  const rows = await prices(null, { p_name: 'feijão carioca', p_brand: 'KICALDO', p_package_amount: 1000, p_package_unit: 'g' });
  assert.deepEqual(rows.map((r) => [r.unit_price_cents, r.promo, r.regular_price_cents]), [[799, false, null], [849, true, 999]]);
  assert.equal((await prices(null, { p_name: 'Feijão Carioca', p_brand: 'Kicaldo', p_package_amount: 2000, p_package_unit: 'g' })).length, 0); // outra embalagem
  assert.equal((await db.query(`select count(*)::int as c from public.shared_products where barcode is null`)).rows[0].c, 1);
});

test('limite diário por usuário: o excedente fica para depois', async () => {
  await db.exec('update public.marketplace_settings set daily_price_report_limit = 6');
  const used = (await db.query(`select count(*)::int as c from public.price_reports where user_id = '${B}'`)).rows[0].c;
  const batch = Array.from({ length: 8 }, (_, i) => arroz({ barcode: null, name: `Produto limite ${i}`, brand: null, package_amount: null, package_unit: null }));
  const r = await report(B, batch);
  assert.equal(r.accepted, 6 - used);
  assert.equal(r.handled.length, 6 - used); // os demais não foram tratados e serão reenviados
  assert.equal((await report(B, batch.slice(6))).accepted, 0);
  await db.exec('update public.marketplace_settings set daily_price_report_limit = 300');
});

test('consulta mostra o último preço por unidade e deixa de fora o que tem mais de 90 dias', async () => {
  const sp = (await db.query(`select id from public.shared_products where barcode = '7893500018469'`)).rows[0].id;
  await db.query(`insert into public.price_reports (product_id, location_id, user_id, unit_price_cents, observed_at, observed_on) values
    ($1, $2, $3, 1999, now() - interval '120 days', (now() - interval '120 days')::date),
    ($1, $2, $3, 2599, now() - interval '20 days', (now() - interval '20 days')::date)`, [sp, loc1, B]);
  const row = (await prices(null, { p_barcode: '7893500018469' })).find((r) => r.location_id === loc1);
  assert.equal(row.unit_price_cents, 2799); // o mais recente, não o mais barato nem o antigo
  await db.query(`delete from public.price_reports where product_id = $1 and location_id = $2 and observed_at > now() - interval '10 days'`, [sp, loc1]);
  assert.equal((await prices(null, { p_barcode: '7893500018469' })).find((r) => r.location_id === loc1).unit_price_cents, 2599);
  assert.equal(await db.query('select public.purge_old_price_reports() as n').then((r) => r.rows[0].n), 0); // 120 dias ainda não é 12 meses
});

test('moderação remove preços de um usuário; excluir a conta apaga as contribuições', async () => {
  const n = (await q(ADMIN, `select public.admin_remove_user_prices('${B}') as n`))[0].n;
  assert.ok(n > 0);
  assert.equal((await db.query(`select count(*)::int as c from public.price_reports where user_id = '${B}'`)).rows[0].c, 0);
  await report(A, [arroz({ unit_price_cents: 2850 })]);
  await as(db, A, () => db.query('select public.delete_my_account()'));
  assert.equal((await db.query(`select count(*)::int as c from public.price_reports where user_id = '${A}'`)).rows[0].c, 0);
  assert.equal((await db.query(`select count(*)::int as c from public.purchases where user_id = '${A}'`)).rows[0].c, 0);
  // o cadastro do produto (sem dado pessoal) permanece
  assert.equal((await q(null, `select name from public.lookup_shared_product('7893500018469')`)).length, 1);
});

test('contrato: o aplicativo chama as funções com os parâmetros que existem no banco', async () => {
  const src = readFileSync(new URL('../../src/services/prices.ts', import.meta.url), 'utf8');
  const procs = (await db.query(`select proname, proargnames from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'`)).rows;
  for (const [, fn, body] of src.matchAll(/rpc\('([a-z_]+)',\s*\{([\s\S]*?)\n\s*\}\)/g)) {
    const proc = procs.find((p) => p.proname === fn);
    assert.ok(proc, `função inexistente: ${fn}`);
    for (const [, key] of body.matchAll(/^\s*(p_[a-z_]+):/gm)) assert.ok(proc.proargnames.includes(key), `${fn} não tem o parâmetro ${key}`);
  }
  assert.ok(['report_prices', 'community_prices', 'lookup_shared_product'].every((f) => src.includes(`rpc('${f}'`)));
  // Campos enviados em cada preço são lidos pelo servidor.
  const body = (await db.query(`select prosrc from pg_proc where proname = 'report_prices'`)).rows[0].prosrc;
  for (const [, key] of src.slice(src.indexOf('p_reports:'), src.indexOf('if (error || !data)')).matchAll(/^\s{6}([a-z_]+):/gm)) assert.ok(body.includes(`'${key}'`), `report_prices não lê ${key}`);
  // Colunas locais sincronizadas existem no servidor.
  const cols = async (t) => (await db.query(`select column_name from information_schema.columns where table_schema = 'public' and table_name = $1`, [t])).rows.map((r) => r.column_name);
  for (const c of ['budget_cents', 'store_location_id']) assert.ok((await cols('purchases')).includes(c), c);
  assert.ok((await cols('cart_items')).includes('regular_price_cents'));
  for (const c of ['store_location_id', 'regular_price_cents']) assert.ok((await cols('price_history')).includes(c), c);
});
