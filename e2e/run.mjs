// npm run test:e2e — sobe o fake-supabase (PostgreSQL real), gera o app web apontando para ele,
// serve como no GitHub Pages (/confereai, sem cabeçalhos especiais) e executa o roteiro.
// Requer Playwright com Chromium disponível (require('playwright')).
import { spawn, execSync } from 'node:child_process';
import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(import.meta.url), '..', '..');
const dist = join(root, 'dist');
const out = process.argv[2] || join(root, 'e2e-output');

const api = spawn(process.execPath, ['e2e/fake-supabase.mjs', '8091'], { cwd: root, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((r) => api.stdout.on('data', (d) => String(d).includes('fake-supabase em') && r()));

execSync('node scripts/build-web.mjs', {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, CI: '1', EXPO_BASE_URL: '/confereai', EXPO_PUBLIC_SUPABASE_URL: 'http://localhost:8091', EXPO_PUBLIC_SUPABASE_ANON_KEY: 'chave-anon-de-teste' },
});

const types = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.png': 'image/png', '.ttf': 'font/ttf', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.css': 'text/css' };
const site = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (!p.startsWith('/confereai')) { res.writeHead(404); return res.end(); }
  let f = join(dist, p.slice('/confereai'.length) || '/');
  if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
  if (!existsSync(f)) { res.writeHead(404, { 'Content-Type': 'text/html' }); return createReadStream(join(dist, '404.html')).pipe(res); }
  res.writeHead(200, { 'Content-Type': types[extname(f)] || 'application/octet-stream' });
  createReadStream(f).pipe(res);
}).listen(8090);

// Assíncrono: o servidor de arquivos acima roda neste mesmo processo.
const child = spawn(process.execPath, ['e2e/marketplace.e2e.mjs', out], { cwd: root, stdio: ['ignore', 'pipe', 'inherit'] });
let output = '';
child.stdout.on('data', (d) => { output += d; process.stdout.write(d); });
const exit = await new Promise((r) => child.on('close', r));
site.close();
api.kill();
process.exit(exit !== 0 || /^FAIL/m.test(output) ? 1 : 0);
