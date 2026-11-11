// Servidor local que imita as APIs do Supabase usadas pelo app (Auth, PostgREST, Storage),
// executando TUDO no PostgreSQL real (PGlite) com as migrações do projeto: RLS, funções e
// gatilhos são os de produção. Uso exclusivo em testes de ponta a ponta.
//
//   node e2e/fake-supabase.mjs [porta]
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { createDb } from '../supabase/tests/helpers.mjs';

const PORT = Number(process.argv[2] || 8091);
const db = await createDb();
await db.query('update public.marketplace_settings set daily_publish_limit = 100');

// Usuários de teste (fictícios). Contas "antigas" contam como confirmações independentes.
export const USERS = {
  'alice@teste.local': { id: randomUUID(), password: 'senha-teste-1', old: true },
  'bruno@teste.local': { id: randomUUID(), password: 'senha-teste-2', old: true },
  'admin@teste.local': { id: randomUUID(), password: 'senha-admin-1', old: true, admin: true },
};
for (const [email, u] of Object.entries(USERS)) {
  await db.query(`insert into auth.users (id, created_at) values ($1, now() - interval '10 days')`, [u.id]);
  if (u.admin) await db.query('insert into public.app_admins (user_id) values ($1)', [u.id]);
  u.email = email;
}

// Unidade FICTÍCIA aprovada para os testes
export const STORE = { lat: -23.561684, lng: -46.655981 };
{
  const m = (await db.query(`insert into public.supermarkets (name, normalized_name, status) values ('Mercado Teste E2E', 'mercado teste e2e', 'approved') returning id`)).rows[0].id;
  await db.query(`insert into public.supermarket_locations (supermarket_id, address, neighborhood, city, state, latitude, longitude, status) values ($1, 'Avenida de Teste, 1000', 'Bela Vista', 'São Paulo', 'SP', $2, $3, 'approved')`, [m, STORE.lat, STORE.lng]);
}

const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const tokenFor = (u) => `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url({ sub: u.id, email: u.email, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;
const userJson = (u) => ({ id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, is_anonymous: false, app_metadata: { provider: 'email' }, user_metadata: {}, created_at: new Date().toISOString() });
function uidFrom(req) {
  const auth = req.headers.authorization || '';
  const parts = auth.replace(/^Bearer /, '').split('.');
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString()).sub ?? null;
  } catch {
    return null;
  }
}

// Executa como o usuário (papel authenticated) ou anon, igual ao PostgREST.
let queue = Promise.resolve();
function asUser(uid, fn) {
  const run = async () => {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false); set role ${uid ? 'authenticated' : 'anon'};`);
    try {
      return await fn();
    } finally {
      await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
    }
  };
  const p = queue.then(run, run);
  queue = p.catch(() => {});
  return p;
}

const files = new Map(); // caminho -> { bytes, type }
const signed = new Map(); // token -> caminho

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS,HEAD',
  'Access-Control-Expose-Headers': 'Content-Range',
  'Cross-Origin-Resource-Policy': 'cross-origin',
};
const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { ...cors, 'Content-Type': 'application/json', ...headers });
  res.end(body === undefined ? '' : JSON.stringify(body));
};
const readBody = (req) => new Promise((r) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => r(Buffer.concat(c))); });

const colTypes = new Map();
async function typesOf(table) {
  if (!colTypes.has(table)) {
    const rows = (await db.query(`select column_name, data_type from information_schema.columns where table_schema = 'public' and table_name = $1`, [table])).rows;
    colTypes.set(table, Object.fromEntries(rows.map((r) => [r.column_name, r.data_type])));
  }
  return colTypes.get(table);
}
const toParam = (type, v) => (type === 'jsonb' && v !== null && typeof v === 'object' ? JSON.stringify(v) : v);

function parseFilters(url, params) {
  const where = [];
  for (const [k, raw] of url.searchParams) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(k)) continue;
    const [op, ...rest] = raw.split('.');
    const val = rest.join('.');
    if (op === 'eq') { params.push(val); where.push(`"${k}" = $${params.length}`); }
    else if (op === 'gt' || op === 'gte' || op === 'lt' || op === 'lte') { params.push(val); where.push(`"${k}" ${{ gt: '>', gte: '>=', lt: '<', lte: '<=' }[op]} $${params.length}`); }
    else if (op === 'is') where.push(`"${k}" is ${val === 'null' ? 'null' : val}`);
    else if (op === 'in') { const items = val.replace(/^\(|\)$/g, '').split(',').map((s) => s.replace(/^"|"$/g, '')); params.push(items); where.push(`"${k}"::text = any ($${params.length})`); }
  }
  return where;
}

async function handleRest(req, res, url, uid) {
  const m = /^\/rest\/v1\/(rpc\/)?([a-z_]+)$/.exec(url.pathname);
  if (!m) return send(res, 404, { message: 'not found' });
  const [, isRpc, name] = m;
  const body = req.method === 'GET' || req.method === 'DELETE' ? null : JSON.parse((await readBody(req)).toString() || 'null');
  try {
    if (isRpc) {
      const proc = (await db.query(`select proretset, prorettype::regtype::text as rt from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and proname = $1`, [name])).rows[0];
      if (!proc) return send(res, 404, { message: `function ${name} not found` });
      const args = Object.entries(body || {});
      const params = args.map(([, v]) => (v !== null && typeof v === 'object' && !Array.isArray(v) ? JSON.stringify(v) : v));
      const call = `public.${name}(${args.map(([k], i) => `${k} => $${i + 1}`).join(', ')})`;
      const rows = await asUser(uid, () => db.query(proc.proretset ? `select * from ${call}` : `select ${call} as r`, params));
      if (proc.proretset) return send(res, 200, rows.rows);
      return send(res, 200, proc.rt === 'void' ? null : rows.rows[0].r);
    }
    const types = await typesOf(name);
    if (req.method === 'GET') {
      const params = [];
      const where = parseFilters(url, params);
      const sel = url.searchParams.get('select') || '*';
      const order = url.searchParams.get('order');
      const limit = url.searchParams.get('limit');
      let sql = `select ${sel === '*' ? '*' : sel.split(',').map((c) => `"${c.trim()}"`).join(',')} from public.${name}`;
      if (where.length) sql += ` where ${where.join(' and ')}`;
      if (order) sql += ` order by ${order.split(',').map((o) => { const [c, d] = o.split('.'); return `"${c}" ${d === 'desc' ? 'desc' : 'asc'}`; }).join(',')}`;
      if (limit) sql += ` limit ${Number(limit)}`;
      const rows = (await asUser(uid, () => db.query(sql, params))).rows;
      if ((req.headers.accept || '').includes('vnd.pgrst.object')) {
        if (rows.length !== 1) return send(res, 406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `The result contains ${rows.length} rows` });
        return send(res, 200, rows[0]);
      }
      return send(res, 200, rows);
    }
    if (req.method === 'POST') {
      const list = Array.isArray(body) ? body : [body];
      const upsert = (req.headers.prefer || '').includes('merge-duplicates');
      const conflict = url.searchParams.get('on_conflict') || { notification_preferences: 'user_id', push_tokens: 'token' }[name] || 'id';
      for (const row of list) {
        const cols = Object.keys(row);
        const params = cols.map((c) => toParam(types[c], row[c]));
        let sql = `insert into public.${name} (${cols.map((c) => `"${c}"`).join(',')}) values (${cols.map((_, i) => `$${i + 1}`).join(',')})`;
        if (upsert) sql += ` on conflict (${conflict}) do update set ${cols.filter((c) => c !== conflict).map((c) => `"${c}" = excluded."${c}"`).join(',') || `"${conflict}" = excluded."${conflict}"`}`;
        await asUser(uid, () => db.query(sql, params));
      }
      return send(res, 201, undefined);
    }
    if (req.method === 'DELETE' || req.method === 'PATCH') {
      const params = [];
      const where = parseFilters(url, params);
      if (!where.length) return send(res, 400, { message: 'filtro obrigatório' });
      let sql;
      if (req.method === 'DELETE') sql = `delete from public.${name} where ${where.join(' and ')}`;
      else {
        const cols = Object.keys(body);
        const sets = cols.map((c) => { params.push(toParam(types[c], body[c])); return `"${c}" = $${params.length}`; });
        sql = `update public.${name} set ${sets.join(',')} where ${where.join(' and ')}`;
      }
      await asUser(uid, () => db.query(sql, params));
      return send(res, 204, undefined);
    }
    return send(res, 405, { message: 'método não suportado' });
  } catch (e) {
    return send(res, 400, { message: e.message, code: e.code ?? 'P0001' });
  }
}

async function handleStorage(req, res, url, uid) {
  let m;
  if (req.method === 'POST' && (m = /^\/storage\/v1\/object\/sign\/([^/]+)$/.exec(url.pathname))) {
    const { paths, expiresIn } = JSON.parse((await readBody(req)).toString());
    const out = [];
    for (const p of paths) {
      const ok = (await asUser(uid, () => db.query(`select 1 from storage.objects where bucket_id = $1 and name = $2`, [m[1], p]))).rows.length;
      if (!ok) { out.push({ path: p, error: 'Object not found', signedURL: null }); continue; }
      const t = randomUUID();
      signed.set(t, `${m[1]}/${p}`);
      out.push({ path: p, error: null, signedURL: `/object/sign/${m[1]}/${p}?token=${t}&exp=${expiresIn}` });
    }
    return send(res, 200, out);
  }
  if (req.method === 'GET' && (m = /^\/storage\/v1\/object\/sign\/(.+)$/.exec(url.pathname))) {
    const key = signed.get(url.searchParams.get('token') || '');
    const f = key === decodeURIComponent(m[1]) ? files.get(key) : null;
    if (!f) return send(res, 400, { message: 'invalid signature' });
    res.writeHead(200, { ...cors, 'Content-Type': f.type });
    return res.end(f.bytes);
  }
  if (req.method === 'POST' && (m = /^\/storage\/v1\/object\/([^/]+)\/(.+)$/.exec(url.pathname))) {
    const [, bucket, path] = m;
    const raw = await readBody(req);
    let bytes = raw;
    let type = req.headers['content-type'] || 'application/octet-stream';
    if (type.startsWith('multipart/form-data')) {
      const form = await new Request('http://x', { method: 'POST', headers: { 'content-type': type }, body: raw }).formData();
      const file = [...form.values()].find((v) => typeof v === 'object');
      bytes = Buffer.from(await file.arrayBuffer());
      type = file.type || 'image/jpeg';
    }
    try {
      // A política de envio (RLS em storage.objects) é avaliada como o usuário
      await asUser(uid, () => db.query(`insert into storage.objects (bucket_id, name, metadata) values ($1, $2, $3)`, [bucket, path, JSON.stringify({ size: bytes.length, mimetype: type })]));
    } catch (e) {
      return send(res, 403, { statusCode: '403', error: 'Unauthorized', message: e.message });
    }
    files.set(`${bucket}/${path}`, { bytes, type });
    return send(res, 200, { Key: `${bucket}/${path}`, Id: randomUUID() });
  }
  return send(res, 404, { message: 'not found' });
}

async function handleAuth(req, res, url, uid) {
  if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password') {
    const { email, password } = JSON.parse((await readBody(req)).toString());
    const u = USERS[email];
    if (!u || u.password !== password) return send(res, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials', msg: 'Invalid login credentials' });
    return send(res, 200, { access_token: tokenFor(u), token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: randomUUID(), user: userJson(u) });
  }
  if (url.pathname === '/auth/v1/user') {
    const u = Object.values(USERS).find((x) => x.id === uid);
    return u ? send(res, 200, userJson(u)) : send(res, 401, { message: 'invalid token' });
  }
  if (url.pathname === '/auth/v1/logout') return send(res, 204, undefined);
  return send(res, 404, { message: 'auth endpoint não suportado no teste' });
}

http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, undefined);
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const uid = uidFrom(req);
  if (url.pathname.startsWith('/rest/')) return handleRest(req, res, url, uid);
  if (url.pathname.startsWith('/storage/')) return handleStorage(req, res, url, uid);
  if (url.pathname.startsWith('/auth/')) return handleAuth(req, res, url, uid);
  // Função de leitura de imagens SIMULADA: nenhuma IA é chamada. Devolve uma leitura fixa de um
  // produto fictício, no mesmo formato da Edge Function real, para exercitar o fluxo do aplicativo.
  if (url.pathname === '/functions/v1/receipt-ocr' && req.method === 'POST') {
    if (!uid) return send(res, 401, { error: 'unauthenticated', message: 'Sessão necessária.' });
    const body = JSON.parse((await readBody(req)).toString() || '{}');
    if (body.kind !== 'product' || !Array.isArray(body.images) || body.images.length !== 1 || typeof body.images[0].base64 !== 'string') {
      return send(res, 400, { error: 'invalid_images', message: 'Envie uma única foto do produto com a etiqueta.' });
    }
    return send(res, 200, {
      provider: 'simulado-e2e',
      parts: [{ lines: ['FEIJAO CARIOCA 1KG', 'DE 9,99 POR 8,49', 'CLUBE'] }],
      product: {
        product_name: 'Feijão carioca (teste)', brand: 'Marca Teste', package_text: '1 kg', barcode: null, regular_price: '9,99', promo_price: '8,49',
        price_basis: 'unit', reference_price: null, reference_per: null, promo_conditions: ['CLUBE'], label_matches_product: 'yes', uncertain_fields: [],
      },
    });
  }
  if (url.pathname === '/__debug/sql') { // somente para o roteiro de teste verificar o banco
    const { sql, params } = JSON.parse((await readBody(req)).toString());
    const run = () => db.query(sql, params);
    const p = queue.then(run, run);
    queue = p.catch(() => {});
    return send(res, 200, (await p).rows);
  }
  return send(res, 404, { message: 'not found' });
}).listen(PORT, () => console.log(`fake-supabase em http://localhost:${PORT}`));
