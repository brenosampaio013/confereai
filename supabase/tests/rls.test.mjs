// Testes de segurança do banco (teste 20): aplica a migração real em um PostgreSQL
// embutido (PGlite) com um esquema `auth` mínimo que imita o do Supabase.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDb, as as runAs } from './helpers.mjs';

const A = randomUUID();
const B = randomUUID();
let db;

const as = (user, fn) => runAs(db, user, fn);
const now = () => new Date().toISOString();

before(async () => {
  db = await createDb();
  await db.exec(`insert into auth.users (id) values ('${A}'), ('${B}')`);
});

test('perfil é criado automaticamente para novos usuários', async () => {
  const r = await db.query('select count(*)::int as c from public.profiles');
  assert.equal(r.rows[0].c, 2);
});

test('cada usuário vê somente os próprios dados', async () => {
  const pid = randomUUID();
  await as(A, () => db.query(`insert into public.purchases (id, status, mode, started_at) values ($1, 'active', 'cart', $2)`, [pid, now()]));
  const mine = await as(A, () => db.query('select id from public.purchases'));
  assert.deepEqual(mine.rows.map((r) => r.id), [pid]);
  const other = await as(B, () => db.query('select id from public.purchases'));
  assert.equal(other.rows.length, 0);
  const anon = await as(null, () => db.query('select id from public.purchases').then(() => 'ok', (e) => e.message));
  assert.match(anon, /permission denied/);
});

test('user_id enviado pelo cliente é ignorado (sempre o usuário autenticado)', async () => {
  const pid = randomUUID();
  await as(B, () => db.query(`insert into public.purchases (id, user_id, status, mode, started_at) values ($1, $2, 'active', 'cart', $3)`, [pid, A, now()]));
  const r = await db.query('select user_id from public.purchases where id = $1', [pid]);
  assert.equal(r.rows[0].user_id, B);
});

test('não é possível alterar, excluir ou sobrescrever dados de outro usuário', async () => {
  const pid = randomUUID();
  await as(A, () => db.query(`insert into public.purchases (id, status, mode, started_at, store_name) values ($1, 'active', 'cart', $2, 'Loja A')`, [pid, now()]));
  const upd = await as(B, () => db.query(`update public.purchases set store_name = 'hack' where id = $1`, [pid]));
  assert.equal(upd.affectedRows ?? 0, 0);
  const del = await as(B, () => db.query('delete from public.purchases where id = $1', [pid]));
  assert.equal(del.affectedRows ?? 0, 0);
  const upsert = await as(B, () =>
    db.query(`insert into public.purchases (id, status, mode, started_at, store_name) values ($1, 'active', 'cart', $2, 'hack')
              on conflict (id) do update set store_name = excluded.store_name`, [pid, now()]).then(() => 'ok', (e) => e.message));
  assert.notEqual(upsert, 'ok');
  const r = await db.query('select store_name from public.purchases where id = $1', [pid]);
  assert.equal(r.rows[0].store_name, 'Loja A');
});

test('não é possível vincular itens à compra de outro usuário', async () => {
  const pid = randomUUID();
  await as(A, () => db.query(`insert into public.purchases (id, status, mode, started_at) values ($1, 'active', 'cart', $2)`, [pid, now()]));
  const res = await as(B, () =>
    db.query(`insert into public.cart_items (id, purchase_id, name, sale_unit, quantity_milli, unit_price_cents, price_source, added_via, created_at)
              values ($1, $2, 'Leite', 'un', 1000, 549, 'manual', 'scan', $3)`, [randomUUID(), pid, now()]).then(() => 'ok', (e) => e.message));
  assert.match(res, /foreign key/);
});

test('sincronização: atualização mais antiga não sobrescreve a mais nova', async () => {
  const pid = randomUUID();
  await as(A, async () => {
    await db.query(`insert into public.purchases (id, status, mode, started_at, store_name, updated_at) values ($1, 'active', 'cart', $2, 'Nova', '2026-10-30T12:00:00Z')`, [pid, now()]);
    await db.query(`insert into public.purchases (id, status, mode, started_at, store_name, updated_at) values ($1, 'active', 'cart', $2, 'Antiga', '2026-10-30T11:00:00Z')
                    on conflict (id) do update set store_name = excluded.store_name, updated_at = excluded.updated_at`, [pid, now()]);
  });
  const r = await db.query('select store_name from public.purchases where id = $1', [pid]);
  assert.equal(r.rows[0].store_name, 'Nova');
});

test('valores monetários e quantidades inválidos são rejeitados', async () => {
  const pid = randomUUID();
  await as(A, () => db.query(`insert into public.purchases (id, status, mode, started_at) values ($1, 'active', 'cart', $2)`, [pid, now()]));
  const neg = await as(A, () =>
    db.query(`insert into public.cart_items (id, purchase_id, name, sale_unit, quantity_milli, unit_price_cents, price_source, added_via, created_at)
              values ($1, $2, 'X', 'un', 0, -1, 'manual', 'scan', $3)`, [randomUUID(), pid, now()]).then(() => 'ok', (e) => e.message));
  assert.match(neg, /check constraint/);
});

test('exclusão da conta remove todos os dados do usuário e preserva os dos outros', async () => {
  await as(B, () => db.query('select public.delete_my_account()'));
  const r = await db.query('select count(*)::int as c from public.purchases where user_id = $1', [B]);
  assert.equal(r.rows[0].c, 0);
  const a = await db.query('select count(*)::int as c from public.purchases where user_id = $1', [A]);
  assert.ok(a.rows[0].c > 0);
  const anon = await as(null, () => db.query('select public.delete_my_account()').then(() => 'ok', (e) => e.message));
  assert.match(anon, /permission denied/);
});
