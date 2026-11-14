// Confere a landing page gerada em site-dist: imagens, links, acessibilidade básica e
// tempo de carregamento. Uso: node scripts/build-site.mjs && node scripts/check-site.mjs
import { createRequire } from 'node:module';
import http from 'node:http';
import { createReadStream, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'site-dist');
const PORTA = 8096;
const tipos = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.xml': 'application/xml', '.txt': 'text/plain' };

const servidor = http.createServer((req, res) => {
  let f = join(dist, decodeURIComponent(req.url.split('?')[0]));
  if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
  if (!existsSync(f)) { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'Content-Type': tipos[extname(f)] || 'application/octet-stream' });
  createReadStream(f).pipe(res);
}).listen(PORTA);

const falhas = [];
const navegador = await chromium.launch();
const pagina = await navegador.newPage({ viewport: { width: 1280, height: 860 } });
pagina.on('console', (m) => m.type() === 'error' && falhas.push(`console: ${m.text().slice(0, 140)}`));
pagina.on('pageerror', (e) => falhas.push(`erro de script: ${e.message.slice(0, 140)}`));
pagina.on('requestfailed', (r) => falhas.push(`requisição falhou: ${r.url().replace(`http://localhost:${PORTA}`, '')}`));

await pagina.goto(`http://localhost:${PORTA}/`, { waitUntil: 'load' });
const lcp = await pagina.evaluate(() => new Promise((r) => {
  new PerformanceObserver((lista) => { const e = lista.getEntries().pop(); if (e) r(Math.round(e.startTime)); }).observe({ type: 'largest-contentful-paint', buffered: true });
  setTimeout(() => r(-1), 2500);
}));
// Rola a página inteira para disparar o carregamento preguiçoso e espera as imagens.
await pagina.evaluate(async () => {
  for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 90)); }
  window.scrollTo(0, 0);
});
await pagina.waitForFunction(() => [...document.images].every((i) => i.complete), null, { timeout: 15000 })
  .catch(() => falhas.push('alguma imagem não terminou de carregar em 15 s'));
await pagina.waitForTimeout(300);

const relatorio = await pagina.evaluate(() => {
  const img = [...document.images];
  return {
    titulo: document.title,
    descricao: document.querySelector('meta[name=description]')?.content ?? '',
    h1: document.querySelectorAll('h1').length,
    imagens: img.length,
    semCarregar: img.filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.getAttribute('src')),
    semAlt: img.filter((i) => i.getAttribute('alt') === null).map((i) => i.getAttribute('src')),
    ancorasQuebradas: [...document.querySelectorAll('a[href^="#"]')]
      .map((a) => a.getAttribute('href')).filter((h) => h !== '#' && !document.querySelector(h)),
    internos: [...new Set([...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href'))
      .filter((h) => h && !h.startsWith('#') && !h.startsWith('http')))],
    semNome: [...document.querySelectorAll('a, button')]
      .filter((e) => !(e.textContent || '').trim() && !e.getAttribute('aria-label')).length,
    idioma: document.documentElement.lang,
    og: !!document.querySelector('meta[property="og:image"]'),
    dados: !!document.querySelector('script[type="application/ld+json"]'),
  };
});

for (const caminho of relatorio.internos) {
  // O Cloudflare serve /termos a partir de termos.html; links sem extensão são válidos.
  const limpo = caminho.replace(/^\//, '');
  const existe = existsSync(join(dist, limpo)) || existsSync(join(dist, `${limpo}.html`))
    || (limpo === '' && existsSync(join(dist, 'index.html')));
  if (!existe) falhas.push(`link quebrado: ${caminho}`);
}
if (relatorio.semCarregar.length) falhas.push(`imagens que não carregaram: ${relatorio.semCarregar.join(', ')}`);
if (relatorio.semAlt.length) falhas.push(`imagens sem alt: ${relatorio.semAlt.join(', ')}`);
if (relatorio.ancorasQuebradas.length) falhas.push(`âncoras sem destino: ${relatorio.ancorasQuebradas.join(', ')}`);
if (relatorio.h1 !== 1) falhas.push(`a página precisa de exatamente um h1 (tem ${relatorio.h1})`);
if (relatorio.semNome) falhas.push(`${relatorio.semNome} link(s) ou botão(ões) sem nome acessível`);
if (relatorio.idioma !== 'pt-BR') falhas.push(`idioma da página: ${relatorio.idioma}`);
if (!relatorio.og) falhas.push('sem imagem de compartilhamento (og:image)');
if (!relatorio.dados) falhas.push('sem dados estruturados (JSON-LD)');
if (lcp > 2500) falhas.push(`maior elemento visível demorou ${lcp} ms (alvo: até 2500 ms)`);

const celular = await navegador.newPage({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await celular.goto(`http://localhost:${PORTA}/`, { waitUntil: 'load' });
await celular.waitForTimeout(800);
const rolagem = await celular.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
if (rolagem) falhas.push('a página rola para o lado em 360 px de largura');

// Nenhum marcador do build pode sobrar nas páginas publicadas
for (const arquivo of readdirSync(dist).filter((f) => f.endsWith('.html') || f.endsWith('.js') || f.endsWith('.xml'))) {
  const texto = readFileSync(join(dist, arquivo), 'utf8');
  const sobrou = texto.match(/__[A-Z_]+__/g);
  if (sobrou) falhas.push(`${arquivo} ainda tem ${[...new Set(sobrou)].join(', ')}`);
}

// Páginas de apoio
for (const caminho of ['privacidade.html', 'termos.html', 'robots.txt', 'sitemap.xml', 'assets/compartilhar.png']) {
  if (!existsSync(join(dist, caminho))) falhas.push(`arquivo ausente: ${caminho}`);
}

await navegador.close();
servidor.close();

console.log(`\nTítulo: ${relatorio.titulo}`);
console.log(`Descrição: ${relatorio.descricao.slice(0, 80)}…`);
console.log(`Imagens: ${relatorio.imagens} · maior elemento visível: ${lcp} ms`);
if (falhas.length) {
  console.log(`\n${falhas.length} problema(s):`);
  for (const f of falhas) console.log(` - ${f}`);
  process.exit(1);
}
console.log('\nTudo certo: imagens, links, âncoras, acessibilidade básica, celular e arquivos de apoio.');
