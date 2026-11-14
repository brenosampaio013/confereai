// Gera a versão web instalável (PWA) do Confere Aí em ./dist.
//
//   EXPO_BASE_URL=/confereai node scripts/build-web.mjs   (GitHub Pages do repositório)
//   node scripts/build-web.mjs                            (site na raiz do domínio)
//
// Além do export do Expo, este script:
//  - cria o manifesto (nome, ícones, cores) exigido pelo Chrome para "Instalar app";
//  - cria um service worker que guarda o app para uso sem internet e acrescenta os
//    cabeçalhos COOP/COEP às respostas. O banco local (expo-sqlite na web) usa
//    SharedArrayBuffer, que só existe em páginas isoladas; hospedagens estáticas como o
//    GitHub Pages não permitem configurar esses cabeçalhos;
//  - só carrega o app depois que a página está isolada (na 1ª visita recarrega uma vez);
//  - copia a política de privacidade e cria 404.html e .nojekyll para o GitHub Pages;
//  - cria _headers e _redirects (Cloudflare Pages e Netlify): com cabeçalhos reais de
//    isolamento, o app abre direto, sem o recarregamento da primeira visita.
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const base = (process.env.EXPO_BASE_URL || '').replace(/\/$/, '');
const NAVY = '#0E2A47';
const BG = '#F3F5F8';

rmSync(dist, { recursive: true, force: true });
execSync(`npx expo export --platform web --output-dir dist`, { cwd: root, stdio: 'inherit', env: { ...process.env, EXPO_BASE_URL: base } });

// Ícones e política de privacidade
mkdirSync(join(dist, 'icons'), { recursive: true });
for (const f of ['pwa-192.png', 'pwa-512.png', 'pwa-maskable-512.png', 'apple-touch-icon.png']) {
  copyFileSync(join(root, 'assets/images', f), join(dist, 'icons', f));
}
copyFileSync(join(root, 'docs/privacidade.html'), join(dist, 'privacidade.html'));

// Manifesto
const manifest = {
  name: 'Confere Aí',
  short_name: 'Confere Aí',
  description: 'Registre suas compras e confira o cupom fiscal antes de sair do caixa.',
  lang: 'pt-BR',
  id: `${base}/`,
  start_url: `${base}/`,
  scope: `${base}/`,
  display: 'standalone',
  orientation: 'portrait',
  background_color: BG,
  theme_color: NAVY,
  categories: ['shopping', 'finance', 'utilities'],
  icons: [
    { src: `${base}/icons/pwa-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: `${base}/icons/pwa-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: `${base}/icons/pwa-maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};
writeFileSync(join(dist, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2));

// index.html: metadados do app instalável + carregamento só após o isolamento
let html = readFileSync(join(dist, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script src="([^"]+)" defer><\/script>/g)].map((m) => m[1]);
if (!scripts.length) throw new Error('Scripts do app não encontrados no index.html');
html = html.replace(/<script src="[^"]+" defer><\/script>/g, '');
html = html.replace('<html lang="en">', '<html lang="pt-BR">');
html = html.replace(
  '</head>',
  `  <meta name="description" content="${manifest.description}" />
  <meta name="theme-color" content="${NAVY}" />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-title" content="Confere Aí" />
  <meta name="apple-mobile-web-app-status-bar-style" content="default" />
  <link rel="manifest" href="${base}/manifest.webmanifest" />
  <link rel="apple-touch-icon" href="${base}/icons/apple-touch-icon.png" />
  <style>#boot{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:${BG};font:16px -apple-system,Roboto,Arial,sans-serif;color:#5A6878}#boot img{width:72px;height:72px;border-radius:16px}</style>
</head>`,
);
const loader = `
  <div id="boot"><img src="${base}/icons/pwa-192.png" alt="" /><span>Abrindo o Confere Aí…</span></div>
  <script>
  (function () {
    var scripts = ${JSON.stringify(scripts)};
    function start() {
      var boot = document.getElementById('boot');
      scripts.forEach(function (src) { var s = document.createElement('script'); s.src = src; s.async = false; document.body.appendChild(s); });
      if (boot) setTimeout(function () { boot.remove(); }, 400);
    }
    if (window.crossOriginIsolated || !('serviceWorker' in navigator)) { start(); return; }
    navigator.serviceWorker.register('${base}/sw.js', { scope: '${base}/' }).then(function () {
      // Página ainda não isolada: recarrega uma vez, já controlada pelo service worker.
      if (sessionStorage.getItem('coi-reload')) { start(); return; }
      function reload() { sessionStorage.setItem('coi-reload', '1'); location.reload(); }
      if (navigator.serviceWorker.controller) reload();
      else navigator.serviceWorker.addEventListener('controllerchange', reload);
    }).catch(start);
  })();
  if (window.crossOriginIsolated) sessionStorage.removeItem('coi-reload');
  </script>
</body>`;
html = html.replace('</body>', loader);
writeFileSync(join(dist, 'index.html'), html);
writeFileSync(join(dist, '404.html'), html); // rotas internas abertas diretamente (ex.: /cart)
writeFileSync(join(dist, '.nojekyll'), '');

// Cabeçalhos e rotas para hospedagens que leem _headers/_redirects (Cloudflare Pages, Netlify).
// Onde não houver suporte (GitHub Pages), os arquivos são ignorados e o service worker cuida disso.
writeFileSync(
  join(dist, '_headers'),
  `${base || ''}/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(self), geolocation=(self), microphone=()

${base}/
  Cache-Control: no-cache

${base}/index.html
  Cache-Control: no-cache

${base}/sw.js
  Cache-Control: no-cache

${base}/manifest.webmanifest
  Cache-Control: no-cache

${base}/_expo/*
  Cache-Control: public, max-age=31536000, immutable
`,
);
// Rotas internas (ex.: /offers/123) abertas diretamente devolvem o app, com status 200.
writeFileSync(join(dist, '_redirects'), `${base || ''}/*  ${base}/index.html  200\n`);

// Service worker
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const files = walk(dist)
  .map((f) => '/' + relative(dist, f).split('\\').join('/'))
  .filter((f) => !['/sw.js', '/404.html', '/.nojekyll', '/metadata.json', '/_headers', '/_redirects'].includes(f))
  // Das fontes de ícones, só a Ionicons é usada pelo app.
  .filter((f) => !f.endsWith('.ttf') || f.includes('Ionicons'));
const version = createHash('sha256').update(files.map((f) => f + statSync(join(dist, f)).size).join('|')).digest('hex').slice(0, 12);
const precache = files.map((f) => base + (f === '/index.html' ? '/' : f));

const sw = `// Gerado por scripts/build-web.mjs — versão ${version}
const CACHE = 'confere-ai-${version}';
const BASE = '${base}';
const PRECACHE = ${JSON.stringify(precache)};

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('confere-ai-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Acrescenta os cabeçalhos de isolamento (necessários para o banco local) às respostas do próprio site.
function isolate(response) {
  if (!response || response.status === 0 || response.type === 'opaque') return response;
  const headers = new Headers(response.headers);
  headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    // Página: tenta a rede (versão nova); sem internet, usa a cópia guardada.
    event.respondWith(
      fetch(req)
        .then((res) => (res.ok || res.status === 404 ? res : Promise.reject(res)))
        .then((res) => (res.status === 404 ? caches.match(BASE + '/') : res))
        .catch(() => caches.match(BASE + '/'))
        .then(isolate),
    );
    return;
  }
  // Arquivos do app (nomes com hash): primeiro o cache, depois a rede.
  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return isolate(hit);
      return fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return isolate(res);
      });
    }),
  );
});
`;
writeFileSync(join(dist, 'sw.js'), sw);
console.log(`\nPWA pronto em dist/ (base "${base || '/'}", ${precache.length} arquivos no cache, versão ${version})`);
