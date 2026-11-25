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
// Medição do funil: fora do endereço publicado a página não pode enviar nada (nem nos testes).
const medicoes = [];
pagina.on('request', (r) => { if (r.url().includes('/rpc/registrar_evento')) medicoes.push(r.url()); });

await pagina.goto(`http://localhost:${PORTA}/`, { waitUntil: 'load' });
const lcp = await pagina.evaluate(() => new Promise((r) => {
  new PerformanceObserver((lista) => { const e = lista.getEntries().pop(); if (e) r(Math.round(e.startTime)); }).observe({ type: 'largest-contentful-paint', buffered: true });
  setTimeout(() => r(-1), 2500);
}));
// Rola a página inteira para disparar o carregamento preguiçoso e espera as imagens.
await pagina.evaluate(async () => {
  // scrollTo instantâneo: a página usa rolagem suave e os pulos se cancelariam
  for (let y = 0; y < document.body.scrollHeight; y += 600) {
    window.scrollTo({ top: y, behavior: 'instant' });
    await new Promise((r) => setTimeout(r, 90));
  }
  window.scrollTo({ top: 0, behavior: 'instant' });
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
    // Conteúdo comercial: só os planos à venda, com os preços aprovados
    planos: [...document.querySelectorAll('#planos .plano')].map((p) => ({
      nome: p.querySelector('h3')?.textContent.trim() ?? '',
      preco: p.querySelector('.plano__preco')?.textContent.replace(/\s+/g, ' ').trim() ?? '',
    })),
    textoPlanos: document.querySelector('#planos')?.innerText ?? '',
    formularios: document.querySelectorAll('form').length,
    perguntas: [...document.querySelectorAll('#perguntas summary')].map((s) => s.textContent.trim()),
    perguntasEstruturadas: (() => {
      try {
        const grafo = JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent)['@graph'];
        return (grafo.find((g) => g['@type'] === 'FAQPage')?.mainEntity ?? []).map((q) => q.name);
      } catch { return null; }
    })(),
    caixaAlta: [...document.querySelectorAll('body *')]
      .filter((e) => e.children.length === 0 && e.closest('svg') === null)
      .map((e) => (e.textContent || '').trim())
      .filter((t) => /[A-ZÁÉÍÓÚÂÊÔÃÕÇ]{4,}/.test(t) && t === t.toUpperCase() && /[A-Z]/.test(t)),
  };
});

// Planos: Grátis e Mais, e nada em construção à venda (decisão 4 da reformulação)
const nomes = relatorio.planos.map((p) => p.nome);
if (JSON.stringify(nomes) !== JSON.stringify(['Grátis', 'Meu Carrin Mais'])) falhas.push(`planos na página: ${nomes.join(', ') || 'nenhum'} (esperado: Grátis, Meu Carrin Mais)`);
const precos = relatorio.planos.map((p) => p.preco).join(' | ');
for (const valor of ['R$ 0', 'R$ 9,90', 'R$ 89']) if (!precos.includes(valor)) falhas.push(`preço ausente nos planos: ${valor}`);
for (const proibido of [/Família/i, /Meu Carrin IA/i, /em breve/i, /19,90/, /179/]) {
  if (proibido.test(relatorio.textoPlanos)) falhas.push(`a seção de planos menciona ${proibido}`);
}
if (!/20 fotos de etiqueta e 4 cupons/.test(relatorio.textoPlanos)) falhas.push('o limite do plano grátis (20 fotos de etiqueta e 4 cupons) não aparece nos planos');
if (relatorio.formularios) falhas.push(`a página tem ${relatorio.formularios} formulário(s): a lista de espera saiu da vitrine`);
// Perguntas frequentes: os temas do briefing, e os dados estruturados iguais ao que se vê
for (const tema of [/conta/i, /gratuit|grátis/i, /assin/i, /cobran/i, /cancel/i, /renova/i, /dados/i, /funciona/i]) {
  if (!relatorio.perguntas.some((q) => tema.test(q))) falhas.push(`nenhuma pergunta frequente sobre ${tema}`);
}
if (JSON.stringify(relatorio.perguntas) !== JSON.stringify(relatorio.perguntasEstruturadas)) falhas.push('as perguntas do JSON-LD não são as mesmas da página, na mesma ordem');
if (relatorio.caixaAlta.length) falhas.push(`texto em caixa-alta: ${[...new Set(relatorio.caixaAlta)].slice(0, 5).join(' / ')}`);

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

// A medição está ligada no build (a página publicada mede), mas não disparou aqui
if (medicoes.length) falhas.push(`a página local enviou ${medicoes.length} evento(s) de medição: só o endereço publicado mede`);
{
  const js = readFileSync(join(dist, 'pagina.js'), 'utf8');
  const cabecalhos = readFileSync(join(dist, '_headers'), 'utf8');
  const origem = (js.match(/fetch\('(https:\/\/[^/']+)\/rest\/v1\/rpc\/registrar_evento'/) || [])[1];
  if (!origem) falhas.push('pagina.js não tem o endereço da medição do funil');
  else if (!cabecalhos.includes(origem)) falhas.push(`a CSP não libera ${origem}: a medição seria bloqueada pelo navegador`);
  if (!/data-medir="upgrade_clicked"/.test(readFileSync(join(dist, 'index.html'), 'utf8'))) falhas.push('o botão Assinar o Mais não mede o clique');
}

// Páginas de apoio
for (const caminho of ['privacidade.html', 'termos.html', 'robots.txt', 'sitemap.xml', 'assets/compartilhar.png']) {
  if (!existsSync(join(dist, caminho))) falhas.push(`arquivo ausente: ${caminho}`);
}

// No endereço publicado a página mede: simulamos o domínio servindo o site-dist e interceptamos
// a chamada ao banco (nada sai daqui). Confere os três eventos e que nenhum dado pessoal vai junto.
{
  const publicado = new URL(process.env.SITE_URL || 'https://meucarrin.com').origin;
  const contexto = await navegador.newContext({ viewport: { width: 390, height: 800 } });
  const enviados = [];
  await contexto.route('**/*', async (rota) => {
    const url = new URL(rota.request().url());
    if (url.pathname.endsWith('/rest/v1/rpc/registrar_evento')) {
      enviados.push({ corpo: JSON.parse(rota.request().postData() || '{}'), referer: rota.request().headers()['referer'] ?? null });
      return rota.fulfill({ status: 204, body: '' });
    }
    if (url.origin === publicado) {
      let f = join(dist, decodeURIComponent(url.pathname));
      if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
      if (existsSync(f)) return rota.fulfill({ status: 200, contentType: tipos[extname(f)] || 'application/octet-stream', body: readFileSync(f) });
      return rota.fulfill({ status: 404, body: '' });
    }
    return rota.fulfill({ status: 204, body: '' }); // app, analytics do Cloudflare: fora do teste
  });
  const p = await contexto.newPage();
  await p.goto(`${publicado}/`, { waitUntil: 'load' });
  await p.locator('#planos').scrollIntoViewIfNeeded();
  await p.waitForTimeout(500);
  await p.getByText('Assinar o Mais', { exact: true }).click();
  await p.waitForTimeout(800);
  const eventos = enviados.map((e) => `${e.corpo.p_evento}:${JSON.stringify(e.corpo.p_dados)}`);
  for (const esperado of ['page_view:{"pagina":"/"}', 'pricing_viewed:{}', 'upgrade_clicked:{"lugar":"site_planos"}']) {
    if (!eventos.includes(esperado)) falhas.push(`medição no endereço publicado: faltou ${esperado} (enviados: ${eventos.join(', ') || 'nenhum'})`);
  }
  if (enviados.some((e) => e.corpo.p_origem !== 'site')) falhas.push('medição do site enviada com origem diferente de "site"');
  if (enviados.some((e) => e.referer)) falhas.push('a medição enviou o endereço de origem (Referer)');
  await contexto.close();
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
