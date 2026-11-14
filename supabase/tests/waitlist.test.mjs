// Lista de espera do plano pago (usada pela landing page), no PostgreSQL real (PGlite).
// Os e-mails abaixo são FICTÍCIOS, criados só para o teste.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, as, err } from './helpers.mjs';

let db;
const q = async (user, sql, params) => (await as(db, user, () => db.query(sql, params))).rows;
const entrar = (user, email, origem = 'landing') =>
  q(user, 'select public.join_waitlist($1, $2)', [email, origem]);

before(async () => { db = await createDb(); });
after(async () => { await db.close(); });

test('visitante sem conta consegue entrar na lista', async () => {
  await entrar(null, 'Alguem@Exemplo.test');
  const linhas = (await db.query('select email, origem from public.waitlist')).rows;
  assert.deepEqual(linhas, [{ email: 'alguem@exemplo.test', origem: 'landing' }]);
});

test('o mesmo e-mail não entra duas vezes', async () => {
  await entrar(null, 'alguem@exemplo.test');
  await entrar(null, '  ALGUEM@exemplo.test ');
  const { rows } = await db.query("select count(*)::int as n from public.waitlist where email = 'alguem@exemplo.test'");
  assert.equal(rows[0].n, 1);
});

test('e-mail inválido é recusado', async () => {
  for (const ruim of ['', 'sem-arroba', 'a@b', 'a@b.c', 'com espaco@exemplo.test']) {
    assert.match(await err(entrar(null, ruim)), /inválido/i);
  }
});

test('ninguém consegue ler nem apagar a lista pelo aplicativo', async () => {
  assert.match(await err(q(null, 'select * from public.waitlist')), /permission denied/);
  assert.match(await err(q(null, 'delete from public.waitlist')), /permission denied/);
  assert.match(await err(q(null, "insert into public.waitlist (email) values ('direto@exemplo.test')")), /permission denied/);
});

test('a origem é limitada e nunca fica vazia', async () => {
  await entrar(null, 'outro@exemplo.test', '   ');
  await entrar(null, 'terceiro@exemplo.test', 'x'.repeat(80));
  const { rows } = await db.query("select email, origem from public.waitlist where email in ('outro@exemplo.test','terceiro@exemplo.test') order by email");
  assert.equal(rows[0].origem, 'landing');        // outro@: origem em branco vira o padrão
  assert.equal(rows[1].origem.length, 40);        // terceiro@: origem longa é cortada
});
