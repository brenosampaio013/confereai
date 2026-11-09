// Teste de contrato: toda chamada RPC e todo acesso a tabela feito pelo aplicativo
// (src/services/marketplace.ts) precisa existir no banco com os mesmos nomes de parâmetros/colunas.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDb } from './helpers.mjs';

const src = readFileSync(new URL('../../src/services/marketplace.ts', import.meta.url), 'utf8');
let db;
before(async () => { db = await createDb(); });

/** Extrai as chaves de primeiro nível de um objeto literal a partir de `start` (posição do "{"). */
function topLevelKeys(text, start) {
  let depth = 0; const keys = []; let i = start; let token = '';
  for (; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{' || ch === '(' || ch === '[') { depth++; if (depth === 1) token = ''; continue; }
    if (ch === '}' || ch === ')' || ch === ']') { depth--; if (depth === 0) break; continue; }
    if (depth === 1) {
      if (ch === ',') { token = ''; continue; }
      token += ch;
      const m = /^\s*([a-z_][a-z0-9_]*)\s*:$/i.exec(token);
      if (m) keys.push(m[1]);
    }
  }
  return keys;
}

function rpcCalls() {
  const calls = [];
  const re = /rpc(?:<[^(]*?>)?\(\s*'([a-z_]+)'\s*(,\s*\{)?/g;
  let m;
  while ((m = re.exec(src))) {
    calls.push({ fn: m[1], keys: m[2] ? topLevelKeys(src, m.index + m[0].length - 1) : [] });
  }
  return calls;
}

test('todas as funções chamadas pelo app existem com os parâmetros usados', async () => {
  const calls = rpcCalls();
  assert.ok(calls.length >= 20, `encontradas ${calls.length} chamadas`);
  const procs = (await db.query(`select proname, proargnames, pronargs, pronargdefaults from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'`)).rows;
  const problems = [];
  for (const c of calls) {
    const overloads = procs.filter((p) => p.proname === c.fn);
    if (!overloads.length) { problems.push(`função inexistente: ${c.fn}`); continue; }
    const ok = overloads.some((p) => {
      const names = (p.proargnames ?? []).slice(0, p.pronargs);
      const required = names.slice(0, p.pronargs - p.pronargdefaults);
      return c.keys.every((k) => names.includes(k)) && required.every((r) => c.keys.includes(r));
    });
    if (!ok) problems.push(`${c.fn}(${c.keys.join(', ')}) não corresponde a ${overloads.map((p) => `(${(p.proargnames ?? []).join(', ')})`).join(' | ')}`);
  }
  assert.deepEqual(problems, []);
});

test('campos enviados em create_promotion e suggest_store são lidos pelo servidor', async () => {
  const fnSrc = (await db.query(`select proname, prosrc from pg_proc where proname in ('create_promotion', 'suggest_store')`)).rows;
  const body = Object.fromEntries(fnSrc.map((r) => [r.proname, r.prosrc]));
  const pStart = src.indexOf("rpc<{ id?: string; duplicate_of?: string");
  const pObj = src.indexOf('p: {', pStart) + 3;
  const sent = topLevelKeys(src, pObj);
  assert.ok(sent.length > 15);
  const unread = sent.filter((k) => !body.create_promotion.includes(`'${k}'`));
  assert.deepEqual(unread, [], 'campos enviados e ignorados pelo servidor');
  for (const k of ['name', 'cnpj', 'address', 'neighborhood', 'city', 'state', 'latitude', 'longitude']) {
    assert.ok(body.suggest_store.includes(`'${k}'`), `suggest_store não lê ${k}`);
  }
});

test('tabelas acessadas diretamente têm as colunas usadas', async () => {
  const cols = async (t) => (await db.query(`select column_name from information_schema.columns where table_schema = 'public' and table_name = $1`, [t])).rows.map((r) => r.column_name);
  const notif = await cols('notifications');
  for (const c of ['id', 'kind', 'promotion_id', 'title', 'body', 'read_at', 'created_at']) assert.ok(notif.includes(c), c);
  const prefs = await cols('notification_preferences');
  for (const c of ['city', 'state', 'notify_nearby', 'favorite_categories', 'favorite_terms', 'notify_my_promotions', 'notify_expiring_favorites', 'push_enabled', 'updated_at']) assert.ok(prefs.includes(c), c);
  assert.deepEqual((await cols('promotion_favorites')).sort(), ['created_at', 'promotion_id', 'user_id']);
  for (const c of ['token', 'platform']) assert.ok((await cols('push_tokens')).includes(c), c);
});
