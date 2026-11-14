// Gera a landing page do Meu Carrin em ./site-dist (site estático, sem dependências).
//
//   node scripts/build-site.mjs
//
// Variáveis (todas opcionais, com padrão):
//   SITE_URL      endereço público do site            (padrão https://meucarrin.com)
//   SITE_APP_URL  endereço do aplicativo              (padrão https://app.meucarrin.com)
//   EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY
//                 quando as duas existem, a lista de espera do plano pago é publicada;
//                 sem elas, o formulário é removido da página (nada de botão que não funciona).
//
// O que o build faz: converte as capturas para WebP em dois tamanhos, gera a imagem de
// compartilhamento, o manifesto de cabeçalhos, robots.txt e sitemap.xml, e copia a
// política de privacidade de docs/.
import { execFileSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const origem = join(root, 'site');
const saida = join(root, 'site-dist');

const SITE_URL = (process.env.SITE_URL || 'https://meucarrin.com').replace(/\/+$/, '');
const APP_URL = (process.env.SITE_APP_URL || 'https://app.meucarrin.com').replace(/\/+$/, '');
const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
const COM_LISTA = !!(SUPABASE_URL && SUPABASE_KEY);

rmSync(saida, { recursive: true, force: true });
mkdirSync(saida, { recursive: true });
cpSync(origem, saida, {
  recursive: true,
  filter: (src) => !/[\\/]_[^\\/]*$/.test(src) && !/[\\/]telas[\\/][^\\/]+\.png$/.test(src),
});

// ---- Capturas do app em WebP, em dois tamanhos (a página escolhe pelo srcset)
const telas = join(origem, 'assets', 'telas');
const telasSaida = join(saida, 'assets', 'telas');
mkdirSync(telasSaida, { recursive: true });
const LARGURAS = [390, 780];
let economizados = 0;
for (const arquivo of readdirSync(telas).filter((f) => f.endsWith('.png') && !f.startsWith('_'))) {
  const nome = arquivo.replace(/\.png$/, '');
  for (const largura of LARGURAS) {
    const destino = join(telasSaida, `${nome}-${largura}.webp`);
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', join(telas, arquivo),
      '-vf', `scale=${largura}:-1`, '-c:v', 'libwebp', '-quality', '80', '-compression_level', '6', destino]);
  }
  economizados += 1;
}

// ---- Página
let html = readFileSync(join(origem, 'index.html'), 'utf8');

// <img src="assets/telas/X.png"> vira WebP responsivo
html = html.replace(/<img src="assets\/telas\/([a-z-]+)\.png"([^>]*?)width="\d+" height="\d+"([^>]*)>/g,
  (_, nome, meio, fim) =>
    `<img src="assets/telas/${nome}-780.webp" srcset="assets/telas/${nome}-390.webp 390w, assets/telas/${nome}-780.webp 780w"` +
    ` sizes="(max-width: 860px) 68vw, 300px"${meio}width="780" height="1688"${fim}>`);

if (!COM_LISTA) {
  html = html.replace(/<!--\[LISTA\]-->[\s\S]*?<!--\[\/LISTA\]-->/,
    '<p class="plano__nota">O plano ainda não está aberto. Enquanto isso, use o plano gratuito à vontade.</p>');
}

html = html.replaceAll('__APP_URL__', APP_URL).replaceAll('__SITE_URL__', SITE_URL);
writeFileSync(join(saida, 'index.html'), html);

// Demais páginas do site também usam os endereços
for (const outra of ['404.html', 'termos.html']) {
  const caminho = join(saida, outra);
  if (!existsSync(caminho)) continue;
  writeFileSync(caminho, readFileSync(caminho, 'utf8').replaceAll('__APP_URL__', APP_URL).replaceAll('__SITE_URL__', SITE_URL));
}

let js = readFileSync(join(origem, 'pagina.js'), 'utf8');
js = js.replaceAll('__SUPABASE_URL__', SUPABASE_URL).replaceAll('__SUPABASE_KEY__', SUPABASE_KEY);
writeFileSync(join(saida, 'pagina.js'), js);

// ---- Política de privacidade (a mesma do aplicativo)
copyFileSync(join(root, 'docs', 'privacidade.html'), join(saida, 'privacidade.html'));

// ---- Imagem de compartilhamento (WhatsApp, redes sociais)
const { chromium } = createRequire(import.meta.url)('playwright');
const simbolo = readFileSync(join(origem, 'assets', 'marca', 'simbolo.svg'), 'utf8');
const telaInicio = readFileSync(join(telas, 'inicio.png')).toString('base64');
const fonte = readFileSync(join(origem, 'assets', 'fontes', 'archivo.woff2')).toString('base64');
const navegador = await chromium.launch();
const pagina = await navegador.newPage({ viewport: { width: 1200, height: 630 } });
await pagina.setContent(`<html><head><meta charset="utf-8"><style>
  @font-face { font-family: Archivo; src: url(data:font/woff2;base64,${fonte}) format('woff2-variations'); font-weight: 400 800; }
  html,body { margin:0; width:1200px; height:630px; overflow:hidden; }
  .capa { width:1200px; height:630px; background:#0E2A47; display:flex; align-items:center; gap:56px; padding:0 72px; box-sizing:border-box;
          font-family:Archivo, Arial, sans-serif; color:#fff; position:relative; }
  .capa::after { content:''; position:absolute; inset:auto -200px -320px auto; width:620px; height:620px; border-radius:50%;
                 background:radial-gradient(circle, rgba(17,145,90,.30), transparent 68%); }
  .marca { display:flex; align-items:center; gap:14px; font-size:30px; font-weight:800; letter-spacing:-1px; }
  .marca span { color:#2FB87A; }
  h1 { font-size:62px; line-height:1.03; letter-spacing:-2.6px; margin:26px 0 0; max-width:12em; font-weight:800; }
  p { font-size:27px; color:#AFC3D8; margin:22px 0 0; max-width:17em; }
  .fone { flex:none; width:286px; border-radius:30px; padding:9px; background:#13365A; box-shadow:0 30px 60px -20px rgba(0,0,0,.6); position:relative; z-index:2; }
  .fone img { width:100%; border-radius:22px; display:block; }
</style></head><body><div class="capa">
  <div><div class="marca">${simbolo.replace('width="64" height="64"', 'width="46" height="46"')} Meu <span>Carrin</span></div>
    <h1>Saiba quanto já deu antes de chegar no caixa.</h1>
    <p>Grátis · sem cartão · funciona sem internet</p></div>
  <div class="fone"><img src="data:image/png;base64,${telaInicio}" alt=""></div>
</div></body></html>`);
await pagina.waitForTimeout(350);
await pagina.screenshot({ path: join(saida, 'assets', 'compartilhar.png') });
await navegador.close();

// ---- Cabeçalhos (Cloudflare e Netlify leem este arquivo)
const conecta = COM_LISTA ? `'self' ${new URL(SUPABASE_URL).origin}` : "'self'";
writeFileSync(join(saida, '_headers'), `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: DENY
  Permissions-Policy: camera=(), geolocation=(), microphone=(), interest-cohort=()
  Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self'; connect-src ${conecta}; base-uri 'none'; form-action 'none'; frame-ancestors 'none'

/
  Cache-Control: no-cache

/index.html
  Cache-Control: no-cache

/assets/*
  Cache-Control: public, max-age=31536000, immutable
`);
writeFileSync(join(saida, '.assetsignore'), '_headers\n.assetsignore\n');

// ---- Buscadores
writeFileSync(join(saida, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
const hoje = new Date().toISOString().slice(0, 10);
writeFileSync(join(saida, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE_URL}/</loc><lastmod>${hoje}</lastmod><priority>1.0</priority></url>
  <url><loc>${SITE_URL}/privacidade</loc><lastmod>${hoje}</lastmod><priority>0.3</priority></url>
  <url><loc>${SITE_URL}/termos</loc><lastmod>${hoje}</lastmod><priority>0.3</priority></url>
</urlset>
`);

console.log(`\nLanding pronta em site-dist/`);
console.log(`  site: ${SITE_URL}   app: ${APP_URL}`);
console.log(`  ${economizados} capturas em WebP (${LARGURAS.join(' e ')} px)`);
console.log(`  lista de espera do plano pago: ${COM_LISTA ? 'publicada' : 'fora da página (sem Supabase configurado)'}`);
