// Testes do marketplace colaborativo no PostgreSQL real (PGlite) com as migrações do projeto.
// Estabelecimentos e ofertas abaixo são DADOS FICTÍCIOS criados somente para os testes.
import { test, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDb, as, err } from './helpers.mjs';

let db;
const ADMIN = randomUUID();
const A = randomUUID(); // autor
const B = randomUUID(); const C = randomUUID(); const D = randomUUID(); // confirmadores (contas antigas)
const NEW = randomUUID(); // conta criada agora
const F = randomUUID(); // usuário para notificações

// Unidade fictícia em São Paulo e outra em Campinas
const SP = { lat: -23.55052, lng: -46.633308 };
const CPS = { lat: -22.905560, lng: -47.060830 };
let spLoc, cpsLoc, spMarket;

const q = async (user, sql, params) => (await as(db, user, () => db.query(sql, params))).rows;
const rpc1 = async (user, sql, params) => (await q(user, sql, params))[0];
const today = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10); // data em Brasília (aprox.)
const plusDays = (n) => new Date(Date.now() - 3 * 3600e3 + n * 86400e3).toISOString().slice(0, 10);
// Ponto a ~d metros ao norte de uma coordenada
const north = (p, meters) => ({ lat: p.lat + meters / 111195, lng: p.lng });

function payload(over = {}) {
  return {
    location_id: spLoc, product_name: 'Acém bovino', brand: 'Teste', category: 'carnes', package_label: null, product_type: 'weighed',
    promotional_price_cents: 2990, regular_price_cents: null, sale_unit: 'kg', condition_types: ['any_customer'], conditions: null,
    starts_on: today(), ends_on: plusDays(5), ...over,
  };
}
const withGps = (p, point, accuracy = 15, capturedAt = new Date().toISOString()) => ({ ...p, latitude: point.lat, longitude: point.lng, accuracy_m: accuracy, captured_at: capturedAt });

async function upload(user, path, size = 120000, mime = 'image/jpeg') {
  await q(user, `insert into storage.objects (bucket_id, name, metadata) values ('promotion-images', $1, $2)`, [path, JSON.stringify({ size, mimetype: mime })]);
}

async function publish(user, p, { image = 'price_tag', submit = true } = {}) {
  const res = (await rpc1(user, 'select public.create_promotion($1) as r', [JSON.stringify(p)])).r;
  if (res.duplicate_of) return res;
  if (image) {
    const path = `p/${res.id}/${randomUUID()}.jpg`;
    await upload(user, path);
    await q(user, 'select public.add_promotion_image($1, $2, $3)', [res.id, path, image]);
  }
  if (submit) Object.assign(res, (await rpc1(user, 'select public.submit_promotion($1) as r', [res.id])).r);
  return res;
}

const search = (user, args = {}) => {
  const keys = Object.keys(args);
  const sql = `select * from public.search_promotions(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')})`;
  return q(user, sql, keys.map((k) => args[k]));
};

before(async () => {
  db = await createDb();
  const old = new Date(Date.now() - 5 * 86400e3).toISOString();
  await db.query(`insert into auth.users (id, created_at) values ($1,$7),($2,$7),($3,$7),($4,$7),($5,$7),($6, now()),($8,$7)`, [ADMIN, A, B, C, D, NEW, old, F]);
  await db.query('insert into public.app_admins (user_id) values ($1)', [ADMIN]);
  // O teste publica muitas ofertas com o mesmo usuário; o limite diário tem teste próprio.
  await db.query('update public.marketplace_settings set daily_publish_limit = 1000');
  // A moderação cadastra e aprova as unidades (fictícias)
  spLoc = (await rpc1(ADMIN, 'select public.suggest_store($1) as r', [JSON.stringify({ name: 'Mercado Teste Centro', address: 'Rua de Teste, 100', neighborhood: 'Centro', city: 'São Paulo', state: 'SP', latitude: SP.lat, longitude: SP.lng })])).r.location_id;
  cpsLoc = (await rpc1(ADMIN, 'select public.suggest_store($1) as r', [JSON.stringify({ name: 'Supermercado Exemplo', address: 'Avenida Exemplo, 50', city: 'Campinas', state: 'SP', latitude: CPS.lat, longitude: CPS.lng })])).r.location_id;
  await q(ADMIN, 'select public.admin_review_location($1, true)', [spLoc]);
  await q(ADMIN, 'select public.admin_review_location($1, true)', [cpsLoc]);
  spMarket = (await db.query('select supermarket_id from public.supermarket_locations where id = $1', [spLoc])).rows[0].supermarket_id;
});

describe('publicação e localização', () => {
  test('1/6. publica oferta com GPS dentro do raio: localização compatível e oferta visível', async () => {
    const r = await publish(A, withGps(payload(), north(SP, 60), 12));
    assert.equal(r.location_status, 'compatible');
    assert.equal(r.distance_m, 60);
    assert.equal(r.status, 'partially_verified');
    const found = await search(B, { p_city: 'sao paulo' });
    const row = found.find((x) => x.id === r.id);
    assert.ok(row, 'oferta deve aparecer para outro usuário');
    assert.equal(row.location_compatible, true);
    assert.equal(row.photo_verified, false, 'localização não equivale a foto comprovada');
    assert.equal(row.community_confirmed, false);
  });

  test('7. GPS fora do raio: não verifica, oferta vai para análise', async () => {
    const r = await publish(A, withGps(payload({ product_name: 'Picanha teste' }), north(SP, 2000), 10));
    assert.equal(r.location_status, 'far');
    assert.equal(r.status, 'pending_review');
    assert.ok(!(await search(B, {})).some((x) => x.id === r.id));
  });

  test('8. GPS com baixa precisão não é marcado como compatível', async () => {
    const bad = await rpc1(A, 'select public.create_promotion($1) as r', [JSON.stringify(withGps(payload({ product_name: 'Fraldinha teste' }), north(SP, 30), 350))]);
    assert.equal(bad.r.location_status, 'low_accuracy');
    // Dentro do raio só por causa da margem de erro: também não verifica
    const edge = await rpc1(A, 'select public.create_promotion($1) as r', [JSON.stringify(withGps(payload({ product_name: 'Costela teste' }), north(SP, 230), 50))]);
    assert.equal(edge.r.location_status, 'low_accuracy');
  });

  test('9. sem localização (ou leitura antiga): status indisponível e revisão', async () => {
    const r = await publish(A, payload({ product_name: 'Patinho teste' }));
    assert.equal(r.location_status, 'unavailable');
    assert.equal(r.status, 'pending_review');
    const stale = await rpc1(A, 'select public.create_promotion($1) as r', [JSON.stringify(withGps(payload({ product_name: 'Cupim teste' }), north(SP, 10), 10, new Date(Date.now() - 3600e3).toISOString()))]);
    assert.equal(stale.r.location_status, 'unavailable', 'coordenada capturada há 1 hora não vale');
  });

  test('10. publicação manual fica em análise até a moderação aprovar', async () => {
    const r = await publish(A, payload({ product_name: 'Alcatra teste' }));
    assert.equal(r.status, 'pending_review');
    const st = (await rpc1(ADMIN, 'select public.admin_moderate_promotion($1, $2) as s', [r.id, 'approve'])).s;
    assert.equal(st, 'partially_verified');
    const row = (await search(B, {})).find((x) => x.id === r.id);
    assert.equal(row.moderator_verified, true);
    assert.equal(row.location_compatible, false);
  });

  test('valida dados no servidor (datas, preços, condições)', async () => {
    assert.match(await err(q(A, 'select public.create_promotion($1)', [JSON.stringify(payload({ ends_on: plusDays(-1) }))])), /já passou/);
    assert.match(await err(q(A, 'select public.create_promotion($1)', [JSON.stringify(payload({ ends_on: plusDays(90) }))])), /validade máxima/);
    assert.match(await err(q(A, 'select public.create_promotion($1)', [JSON.stringify(payload({ promotional_price_cents: 0 }))])), /preço promocional/);
    assert.match(await err(q(A, 'select public.create_promotion($1)', [JSON.stringify(payload({ regular_price_cents: 1000 }))])), /preço anterior/, 'preço anterior menor que o promocional');
    assert.match(await err(q(A, 'select public.create_promotion($1)', [JSON.stringify(payload({ category: 'eletronicos' }))])), /categoria/);
    assert.match(await err(q(A, 'select public.create_promotion($1)', [JSON.stringify(payload({ condition_types: ['any_customer', 'weekend_only'] }))])), /qualquer cliente/);
    assert.match(await err(q(A, 'select public.create_promotion($1)', [JSON.stringify(payload({ condition_types: ['min_quantity'] }))])), /quantidade mínima/, 'quantidade mínima obrigatória');
    assert.match(await err(q(NEW, 'select public.create_promotion($1)', [JSON.stringify(payload({ location_id: randomUUID() }))])), /unidade/);
  });
});

describe('fotografias', () => {
  test('2. exige evidência, rejeita imagem vazia, formato inválido, caminho alheio e mais de 5 fotos', async () => {
    const r = (await rpc1(A, 'select public.create_promotion($1) as r', [JSON.stringify(withGps(payload({ product_name: 'Maminha teste' }), SP))])).r;
    const p = (n) => `p/${r.id}/${n}.jpg`;
    await upload(A, p('vazia'), 0);
    assert.match(await err(upload(B, `p/${r.id}/intruso.jpg`)), /row-level security/, 'só o autor envia fotos à própria publicação');
    assert.match(await err(q(A, 'select public.add_promotion_image($1,$2,$3)', [r.id, p('vazia'), 'price_tag'])), /vazia/);
    await upload(A, p('gif'), 1000, 'image/gif');
    assert.match(await err(q(A, 'select public.add_promotion_image($1,$2,$3)', [r.id, p('gif'), 'price_tag'])), /Formato/);
    assert.match(await err(q(A, 'select public.add_promotion_image($1,$2,$3)', [r.id, p('inexistente'), 'price_tag'])), /não encontrada/);
    assert.match(await err(q(A, 'select public.add_promotion_image($1,$2,$3)', [r.id, `p/${randomUUID()}/x.jpg`, 'price_tag'])), /inválido/);
    // Só foto do produto não basta para publicar
    await upload(A, p('produto'));
    await q(A, 'select public.add_promotion_image($1,$2,$3)', [r.id, p('produto'), 'product']);
    assert.match(await err(q(A, 'select public.submit_promotion($1)', [r.id])), /etiqueta/);
    for (let i = 0; i < 4; i++) { await upload(A, p(`e${i}`)); await q(A, 'select public.add_promotion_image($1,$2,$3)', [r.id, p(`e${i}`), 'price_tag']); }
    await upload(A, p('sexta'));
    assert.match(await err(q(A, 'select public.add_promotion_image($1,$2,$3)', [r.id, p('sexta'), 'price_tag'])), /até 5/);
    assert.equal((await rpc1(A, 'select public.submit_promotion($1) as r', [r.id])).r.status, 'partially_verified');
  });

  test('envio só para caminhos permitidos', async () => {
    assert.match(await err(upload(B, `${A}/qualquer/x.jpg`)), /row-level security/);
    assert.match(await err(upload(B, `p/${randomUUID()}/x.jpg`)), /row-level security/);
  });

  test('fotos de oferta em análise não são legíveis por terceiros; de oferta visível, sim', async () => {
    const pending = await publish(A, payload({ product_name: 'Lagarto teste' }));
    const visible = await publish(A, withGps(payload({ product_name: 'Músculo teste' }), SP));
    const imgOf = async (id) => (await db.query('select storage_path from public.promotion_images where promotion_id = $1', [id])).rows[0].storage_path;
    const read = async (user, path) => (await q(user, `select name from storage.objects where bucket_id = 'promotion-images' and name = $1`, [path])).length;
    assert.equal(await read(B, await imgOf(pending.id)), 0);
    assert.equal(await read(A, await imgOf(pending.id)), 1, 'o autor vê a própria foto');
    assert.equal(await read(B, await imgOf(visible.id)), 1);
    assert.equal(await read(null, await imgOf(visible.id)), 1, 'visitante sem conta vê fotos de ofertas públicas');
  });
});

describe('supermercados e unidades', () => {
  test('3/4. lista unidades aprovadas; sugestão fica pendente e visível só para quem sugeriu', async () => {
    const list = await q(B, 'select * from public.list_store_locations(p_query => $1)', ['teste centro']);
    assert.deepEqual(list.map((l) => l.location_id), [spLoc]);
    const sug = (await rpc1(B, 'select public.suggest_store($1) as r', [JSON.stringify({ name: 'Mercadinho Sugerido', address: 'Rua Sugerida, 10', city: 'São Paulo', state: 'SP', latitude: -23.56, longitude: -46.64 })])).r;
    assert.equal(sug.status, 'pending');
    assert.ok((await q(B, 'select * from public.list_store_locations()')).some((l) => l.location_id === sug.location_id && l.status === 'pending'));
    assert.ok(!(await q(C, 'select * from public.list_store_locations()')).some((l) => l.location_id === sug.location_id));
    // Mesma rede e mesmo lugar: reutiliza a unidade existente em vez de duplicar
    const again = (await rpc1(C, 'select public.suggest_store($1) as r', [JSON.stringify({ name: 'MERCADO TESTE CENTRO', address: 'R. de Teste 100', city: 'São Paulo', state: 'SP', latitude: SP.lat + 0.0005, longitude: SP.lng })])).r;
    assert.deepEqual(again, { location_id: spLoc, existing: true });
    // Distância calculada a partir das coordenadas da unidade
    const near = await q(B, 'select * from public.list_store_locations(p_latitude => $1, p_longitude => $2)', [SP.lat, SP.lng]);
    assert.equal(near[0].location_id, spLoc);
    assert.equal(near[0].distance_km, 0);
  });

  test('oferta em unidade ainda não aprovada aguarda análise', async () => {
    const sug = (await rpc1(D, 'select public.suggest_store($1) as r', [JSON.stringify({ name: 'Atacado Novo Teste', address: 'Estrada Teste, 1', city: 'São Paulo', state: 'SP', latitude: -23.6, longitude: -46.7 })])).r;
    const r = await publish(D, withGps(payload({ location_id: sug.location_id, product_name: 'Arroz teste' }), { lat: -23.6, lng: -46.7 }));
    assert.equal(r.location_status, 'compatible');
    assert.equal(r.status, 'pending_review');
  });

  test('CNPJ inválido é recusado', async () => {
    assert.match(await err(q(B, 'select public.suggest_store($1)', [JSON.stringify({ name: 'X Mercado', cnpj: '11.222.333/0001-82', address: 'Rua X, 1', city: 'São Paulo', state: 'SP', latitude: -23.5, longitude: -46.6 })])), /CNPJ/);
  });
});

describe('consultas e filtros', () => {
  let cpsOffer;
  before(async () => {
    cpsOffer = await publish(A, withGps(payload({ location_id: cpsLoc, product_name: 'Detergente teste', category: 'limpeza', product_type: 'packaged', sale_unit: 'un', promotional_price_cents: 199 }), CPS));
  });

  test('11. consulta por cidade', async () => {
    const cps = await search(B, { p_city: 'Campinas', p_state: 'sp' });
    assert.deepEqual(cps.map((r) => r.id), [cpsOffer.id]);
    assert.ok((await search(B, { p_city: 'São Paulo' })).every((r) => r.city === 'São Paulo'));
  });

  test('12. consulta por distância e ordenação', async () => {
    const near = await search(B, { p_latitude: SP.lat, p_longitude: SP.lng, p_max_km: 5 });
    assert.ok(near.length > 0 && near.every((r) => r.distance_km <= 5));
    assert.ok(!near.some((r) => r.id === cpsOffer.id));
    const all = await search(B, { p_latitude: SP.lat, p_longitude: SP.lng, p_sort: 'distance' });
    assert.equal(all[all.length - 1].id, cpsOffer.id);
    const byPrice = await search(B, { p_sort: 'price' });
    assert.equal(byPrice[0].id, cpsOffer.id);
  });

  test('13. filtro por categoria', async () => {
    const r = await search(B, { p_category: 'limpeza' });
    assert.deepEqual(r.map((x) => x.id), [cpsOffer.id]);
  });

  test('14. filtro por supermercado e faixa de preço', async () => {
    const r = await search(B, { p_supermarket_id: spMarket });
    assert.ok(r.length > 0 && r.every((x) => x.location_id === spLoc));
    const cheap = await search(B, { p_max_price_cents: 500 });
    assert.ok(cheap.every((x) => x.promotional_price_cents <= 500));
  });

  test('mapa: um marcador por unidade, nas coordenadas da unidade', async () => {
    const m = await q(B, 'select * from public.map_store_offers()');
    const sp = m.find((x) => x.location_id === spLoc);
    assert.equal(sp.latitude, SP.lat);
    assert.equal(sp.longitude, SP.lng);
    assert.ok(sp.active_offers >= 1 && sp.top_offers.length >= 1);
    const onlyClean = await q(B, 'select * from public.map_store_offers(p_category => $1)', ['limpeza']);
    assert.deepEqual(onlyClean.map((x) => x.location_id), [cpsLoc]);
  });
});

describe('expiração', () => {
  test('15. oferta vencida sai dos resultados ativos e muda para expirada, preservando o histórico', async () => {
    const r = await publish(A, withGps(payload({ product_name: 'Leite teste expira', category: 'laticinios' }), SP));
    await db.query(`update public.promotions set expires_at = now() - interval '1 minute' where id = $1`, [r.id]);
    assert.ok(!(await search(B, {})).some((x) => x.id === r.id), 'some imediatamente, mesmo antes da rotina');
    assert.ok((await db.query('select public.expire_promotions() n')).rows[0].n >= 1);
    const row = (await db.query('select status from public.promotions where id = $1', [r.id])).rows[0];
    assert.equal(row.status, 'expired');
    const hist = (await db.query('select new_status from public.promotion_history where promotion_id = $1 order by id', [r.id])).rows.map((h) => h.new_status);
    assert.deepEqual(hist, ['draft', 'partially_verified', 'expired']);
    assert.match(await err(q(B, `select public.confirm_promotion($1, 'found')`, [r.id])), /não está ativa/);
  });

  test('retenção: ofertas encerradas há mais de 12 meses são apagadas; recentes são mantidas', async () => {
    const old = await publish(A, withGps(payload({ product_name: 'Iogurte teste antigo', category: 'laticinios' }), SP));
    const recent = await publish(A, withGps(payload({ product_name: 'Iogurte teste recente', category: 'laticinios' }), SP));
    await db.query(`update public.promotions set expires_at = now() - interval '13 months', status = 'expired' where id = $1`, [old.id]);
    await db.query(`update public.promotions set expires_at = now() - interval '1 day', status = 'expired' where id = $1`, [recent.id]);
    assert.ok((await db.query('select public.purge_old_promotions() n')).rows[0].n >= 1);
    assert.equal((await db.query('select count(*)::int c from public.promotions where id = $1', [old.id])).rows[0].c, 0);
    assert.equal((await db.query('select count(*)::int c from public.promotion_images where promotion_id = $1', [old.id])).rows[0].c, 0, 'fotos e verificações em cascata');
    assert.equal((await db.query('select count(*)::int c from public.promotions where id = $1', [recent.id])).rows[0].c, 1);
    assert.match(await err(q(B, 'select public.purge_old_promotions()')), /permission denied/, 'só tarefas do servidor executam');
  });

  test('o autor pode encerrar antes e ajustar a validade só para antes', async () => {
    const r = await publish(A, withGps(payload({ product_name: 'Queijo teste', category: 'laticinios' }), SP));
    assert.match(await err(q(A, 'select public.update_my_promotion($1, null, null, $2)', [r.id, plusDays(30)])), /antecipada/);
    assert.equal((await rpc1(A, 'select public.end_my_promotion($1) s', [r.id])).s, 'expired');
  });
});

describe('comunidade, denúncias e moderação', () => {
  let offer;
  before(async () => { offer = await publish(A, withGps(payload({ product_name: 'Frango teste', category: 'carnes' }), SP)); });

  test('16. confirmações independentes levam a "confirmada pela comunidade"', async () => {
    assert.match(await err(q(A, `select public.confirm_promotion($1, 'found')`, [offer.id])), /própria publicação/);
    const newAcc = (await rpc1(NEW, `select public.confirm_promotion($1, 'found') r`, [offer.id])).r;
    assert.equal(newAcc.independent, false, 'conta recém-criada não conta como confirmação independente');
    await q(B, `select public.confirm_promotion($1, 'found', null, null, $2, $3, 10, now())`, [offer.id, SP.lat, SP.lng]);
    assert.match(await err(q(B, `select public.confirm_promotion($1, 'price_correct')`, [offer.id])), /já respondeu/, 'sem cliques repetidos');
    await q(C, `select public.confirm_promotion($1, 'price_correct')`, [offer.id]);
    let st = (await db.query('select status, independent_confirmations from public.promotions where id = $1', [offer.id])).rows[0];
    assert.deepEqual(st, { status: 'partially_verified', independent_confirmations: 2 });
    await q(D, `select public.confirm_promotion($1, 'found')`, [offer.id]);
    st = (await db.query('select status, independent_confirmations from public.promotions where id = $1', [offer.id])).rows[0];
    assert.deepEqual(st, { status: 'community_confirmed', independent_confirmations: 3 });
    const checks = (await db.query(`select location_status from public.promotion_location_checks where promotion_id = $1 and check_kind = 'confirmation'`, [offer.id])).rows;
    assert.ok(checks.some((c) => c.location_status === 'compatible'));
    const note = (await db.query(`select kind from public.notifications where user_id = $1 and promotion_id = $2`, [A, offer.id])).rows;
    assert.deepEqual(note.map((n) => n.kind), ['promotion_confirmed']);
    assert.match(await err(q(B, `select public.confirm_promotion($1, 'price_different')`, [offer.id])), /preço/);
  });

  test('16b. confirmação com foto de evidência: privada para terceiros', async () => {
    const r = await publish(A, withGps(payload({ product_name: 'Peito de frango teste' }), SP));
    const path = `c/${r.id}/${randomUUID()}.jpg`;
    await upload(B, path);
    assert.match(await err(q(B, `select public.confirm_promotion($1, 'found', null, $2)`, [r.id, `c/${randomUUID()}/x.jpg`])), /inválido/);
    await q(B, `select public.confirm_promotion($1, 'price_correct', null, $2)`, [r.id, path]);
    const read = async (user) => (await q(user, `select name from storage.objects where name = $1`, [path])).length;
    assert.equal(await read(B), 1);
    assert.equal(await read(C), 0, 'evidência não fica pública');
    assert.equal(await read(ADMIN), 1, 'moderação consegue revisar');
  });

  test('17. denúncias: uma por pessoa; ao atingir o limite a oferta fica contestada (revisão, não remoção)', async () => {
    const r = await publish(A, withGps(payload({ product_name: 'Linguiça teste' }), SP));
    await q(B, `select public.report_promotion($1, 'wrong_price', 'Na gôndola estava 32,90')`, [r.id]);
    assert.match(await err(q(B, `select public.report_promotion($1, 'spam')`, [r.id])), /já denunciou/);
    await q(C, `select public.report_promotion($1, 'nonexistent')`, [r.id]);
    await q(D, `select public.report_promotion($1, 'expired')`, [r.id]);
    const st = (await db.query('select status from public.promotions where id = $1', [r.id])).rows[0].status;
    assert.equal(st, 'contested');
    assert.ok((await search(B, {})).some((x) => x.id === r.id && x.status === 'contested'), 'contestada continua visível, com aviso');
    assert.match(await err(q(A, `select public.report_promotion($1, 'spam')`, [r.id])), /própria/);
  });

  test('18/21. moderação: só administradores; resolve denúncias, suspende, remove e restaura com registro', async () => {
    const r = await publish(A, withGps(payload({ product_name: 'Bisteca teste' }), SP));
    assert.match(await err(q(B, `select public.admin_moderate_promotion($1, 'remove')`, [r.id])), /restrito/);
    assert.match(await err(q(B, 'select public.admin_queue()')), /restrito/);
    assert.match(await err(q(B, 'insert into public.app_admins (user_id) values ($1)', [B])), /permission denied/);
    await q(B, `select public.report_promotion($1, 'misleading_photo')`, [r.id]);
    const queue = (await rpc1(ADMIN, 'select public.admin_queue() q')).q;
    const report = queue.reports.find((x) => x.promotion_id === r.id);
    assert.ok(report);
    await q(ADMIN, 'select public.admin_resolve_report($1, true, $2)', [report.id, 'Foto não corresponde']);
    assert.equal((await rpc1(ADMIN, `select public.admin_moderate_promotion($1, 'suspend', 'Revisar') s`, [r.id])).s, 'pending_review');
    assert.ok(!(await search(B, {})).some((x) => x.id === r.id));
    assert.equal((await rpc1(ADMIN, `select public.admin_moderate_promotion($1, 'restore') s`, [r.id])).s, 'partially_verified');
    assert.equal((await rpc1(ADMIN, `select public.admin_moderate_promotion($1, 'remove', 'Fraude') s`, [r.id])).s, 'removed');
    assert.equal(await rpc1(B, 'select public.get_promotion($1) p', [r.id]).then((x) => x.p), null);
    const audit = (await rpc1(ADMIN, 'select public.admin_promotion_audit($1) a', [r.id])).a;
    assert.deepEqual(audit.actions.map((a) => a.action), ['suspend', 'restore', 'remove']);
    assert.equal(audit.reports[0].status, 'upheld');
    assert.ok(audit.location_checks[0].distance_m >= 0);
    const note = (await db.query(`select kind from public.notifications where user_id = $1 and promotion_id = $2`, [A, r.id])).rows;
    assert.deepEqual(note.map((n) => n.kind), ['moderation_update']);
  });

  test('foto aceita pela moderação é um indicador separado', async () => {
    const r = await publish(A, payload({ product_name: 'Contrafilé teste' }));
    await q(ADMIN, `select public.admin_moderate_promotion($1, 'accept_photo')`, [r.id]);
    const p = (await rpc1(ADMIN, 'select public.get_promotion($1) p', [r.id])).p;
    assert.equal(p.photo_verified, true);
    assert.equal(p.location_compatible, false);
    assert.equal(p.moderator_verified, false);
    assert.equal(p.status, 'pending_review', 'foto aceita não dispensa a análise de quem publicou sem localização');
  });

  test('usuário suspenso não publica nem confirma', async () => {
    await q(ADMIN, `select public.admin_set_user_ban($1, now() + interval '7 days', 'Spam')`, [NEW]);
    assert.match(await err(q(NEW, 'select public.create_promotion($1)', [JSON.stringify(payload())])), /suspensa/);
    assert.match(await err(q(NEW, `select public.confirm_promotion($1, 'found')`, [offer.id])), /suspensa/);
  });
});

describe('duplicidade', () => {
  test('19. publicação idêntica aponta a oferta existente; diferenças legítimas são aceitas', async () => {
    const base = payload({ product_name: 'Arroz Tipo 1', brand: 'Marca Teste', package_label: '5 kg', category: 'mercearia', product_type: 'packaged', sale_unit: 'un', promotional_price_cents: 2490 });
    const first = await publish(A, withGps(base, SP));
    const dup = (await rpc1(B, 'select public.create_promotion($1) r', [JSON.stringify(withGps({ ...base, product_name: 'arroz tipo 1 ' }, SP))])).r;
    assert.deepEqual(dup, { duplicate_of: first.id });
    const similar = await q(B, 'select * from public.find_similar_promotions($1, $2, $3, $4)', [spLoc, 'Arroz Tipo 1', 'Marca Teste', '5 kg']);
    assert.equal(similar[0].id, first.id);
    for (const diff of [{ promotional_price_cents: 2390 }, { location_id: cpsLoc }, { condition_types: ['loyalty_members'] }, { ends_on: plusDays(3) }]) {
      const r = (await rpc1(B, 'select public.create_promotion($1) r', [JSON.stringify(withGps({ ...base, ...diff }, diff.location_id ? CPS : SP))])).r;
      assert.ok(r.id && !r.duplicate_of, `deve aceitar diferença ${JSON.stringify(diff)}`);
    }
  });
});

describe('privacidade e segurança', () => {
  test('20. coordenadas de quem publica não são gravadas nem expostas', async () => {
    const cols = (await db.query(`select column_name from information_schema.columns where table_schema = 'public' and table_name in ('promotions', 'promotion_location_checks', 'promotion_confirmations')`)).rows.map((c) => c.column_name);
    assert.ok(!cols.some((c) => /lat|lng|long/.test(c)), `colunas: ${cols.join(',')}`);
    const r = await publish(A, withGps(payload({ product_name: 'Pernil teste' }), north(SP, 80)));
    const pub = (await rpc1(B, 'select public.get_promotion($1) p', [r.id])).p;
    assert.equal(pub.location_check, null, 'terceiros não veem a verificação');
    assert.equal(pub.store.latitude, SP.lat, 'apenas as coordenadas da unidade');
    assert.ok(!JSON.stringify(pub).includes(A), 'o autor não é identificado');
    const own = (await rpc1(A, 'select public.get_promotion($1) p', [r.id])).p;
    assert.equal(own.location_check.distance_m, 80);
    const s = (await search(B, {})).find((x) => x.id === r.id);
    assert.ok(!Object.keys(s).some((k) => k === 'user_id'));
    assert.equal(s.store_latitude, SP.lat);
  });

  test('22. tabelas não podem ser lidas nem alteradas diretamente por terceiros', async () => {
    assert.equal((await q(B, 'select * from public.promotions where user_id = $1', [A])).length, 0);
    assert.equal((await q(B, 'select * from public.promotion_location_checks')).length, 0);
    assert.match(await err(q(null, 'select * from public.promotions')), /permission denied/);
    assert.match(await err(q(B, `insert into public.promotions (user_id, location_id, product_name, normalized_product, category, promotional_price_cents, sale_unit, starts_on, ends_on, expires_at, location_status, status) values ($1, $2, 'x', 'x', 'carnes', 1, 'kg', now(), now(), now(), 'compatible', 'community_confirmed')`, [B, spLoc])), /permission denied/);
    const mine = (await q(A, 'select id from public.promotions limit 1'))[0].id;
    assert.match(await err(q(B, `update public.promotions set status = 'community_confirmed' where id = $1`, [mine])), /permission denied/);
    assert.match(await err(q(B, 'select public.update_my_promotion($1, $2, null, null)', [mine, 'hack'])), /não encontrada/);
    assert.match(await err(q(null, 'select public.create_promotion($1)', [JSON.stringify(payload())])), /permission denied/);
    // Favoritos: cada um só os próprios
    await q(B, 'insert into public.promotion_favorites (promotion_id) values ($1)', [mine]);
    assert.equal((await q(C, 'select * from public.promotion_favorites')).length, 0);
    assert.match(await err(q(C, 'insert into public.promotion_favorites (user_id, promotion_id) values ($1, $2)', [B, mine])), /row-level security/);
  });

  test('limite diário de publicações', async () => {
    await db.query(`update public.marketplace_settings set daily_publish_limit = 1`);
    try {
      await rpc1(C, 'select public.create_promotion($1) r', [JSON.stringify(payload({ product_name: 'Ovos teste', category: 'mercearia' }))]);
      assert.match(await err(q(C, 'select public.create_promotion($1)', [JSON.stringify(payload({ product_name: 'Farinha teste' }))])), /Limite diário/);
    } finally {
      await db.query(`update public.marketplace_settings set daily_publish_limit = 1000`);
    }
  });
});

describe('notificações e reputação', () => {
  test('aviso de oferta nova só para quem pediu (cidade e categoria/termos), sem usar localização', async () => {
    await q(F, `insert into public.notification_preferences (city, state, notify_nearby, favorite_categories, favorite_terms) values ('São Paulo', 'SP', false, '{bebidas}', '{cafe}')`);
    const cafe = await publish(A, withGps(payload({ product_name: 'Café torrado teste', category: 'mercearia', sale_unit: 'un', product_type: 'packaged' }), SP));
    const suco = await publish(A, withGps(payload({ product_name: 'Suco teste', category: 'bebidas', sale_unit: 'un', product_type: 'packaged' }), SP));
    const outra = await publish(A, withGps(payload({ product_name: 'Sabonete teste', category: 'higiene', sale_unit: 'un', product_type: 'packaged' }), SP));
    const kinds = (await q(F, 'select kind, promotion_id from public.notifications'));
    assert.ok(kinds.some((k) => k.promotion_id === cafe.id && k.kind === 'favorite_product'));
    assert.ok(kinds.some((k) => k.promotion_id === suco.id && k.kind === 'favorite_category'));
    assert.ok(!kinds.some((k) => k.promotion_id === outra.id));
    assert.equal((await q(B, 'select * from public.notifications where user_id = $1', [F])).length, 0, 'cada um só vê as próprias');
  });

  test('reputação valoriza ofertas confirmadas, não volume', async () => {
    const a = (await rpc1(A, 'select * from public.my_reputation()'));
    assert.ok(a.published > 10);
    assert.ok(a.confirmed >= 1);
    assert.ok(a.upheld_reports >= 1);
    const fresh = (await rpc1(C, 'select * from public.my_reputation()'));
    assert.equal(fresh.level, 'new');
  });
});
