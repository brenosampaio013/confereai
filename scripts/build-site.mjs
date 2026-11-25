// Gera a landing page do Meu Carrin em ./site-dist (site estático, sem dependências).
//
//   node scripts/build-site.mjs
//
// Variáveis (todas opcionais, com padrão):
//   SITE_URL      endereço público do site            (padrão https://meucarrin.com)
//   SITE_APP_URL  endereço do aplicativo              (padrão https://app.meucarrin.com)
//
// O que o build faz: converte as capturas para WebP em dois tamanhos, gera a imagem de
// compartilhamento, o manifesto de cabeçalhos, robots.txt e sitemap.xml, e copia a
// política de privacidade de docs/.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const origem = join(root, 'site');
const saida = join(root, 'site-dist');

const SITE_URL = (process.env.SITE_URL || 'https://meucarrin.com').replace(/\/+$/, '');
const APP_URL = (process.env.SITE_APP_URL || 'https://app.meucarrin.com').replace(/\/+$/, '');
// Medição do funil (decisão 5): a página conta visitas e cliques pela função `registrar_evento`.
// Os dois valores abaixo são públicos por natureza (já viajam no pacote do aplicativo); quem
// protege os dados é o banco: a função só aceita uma lista fechada de eventos, sem dado pessoal. Ficam aqui, e não só no painel de quem
// compila, para a landing publicar certo de qualquer lugar — como o app faz em src/lib/config.ts.
// A chave `service_role` NUNCA entra aqui.
const SUPABASE_PADRAO = 'https://urfqgajoauryxmkbseet.supabase.co';
const CHAVE_PADRAO =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVyZnFnYWpvYXVyeXhta2JzZWV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUxMDIyNjMsImV4cCI6MjExMDY3ODI2M30.LGLXovbKtCQ3__cRKXqH-wcJ8jgDeksH5qIFbXj3KJs';
// Um endereço de servidor, não uma chave: trocar os dois campos no painel de compilação é um
// engano fácil, e aqui ele é ignorado em vez de publicar uma página quebrada.
const pareceEndereco = (v) => /^https?:\/\/[^\s"']+$/.test(v);
const doAmbiente = (valor, valido, padrao, nome) => {
  const v = (valor || '').trim();
  if (!v) return padrao;
  if (valido(v)) return v;
  console.warn(`  aviso: ${nome} foi ignorada (formato inesperado); usando o valor padrão.`);
  return padrao;
};
const SUPABASE_URL = doAmbiente(process.env.EXPO_PUBLIC_SUPABASE_URL, pareceEndereco, SUPABASE_PADRAO, 'EXPO_PUBLIC_SUPABASE_URL').replace(/\/+$/, '');
const SUPABASE_KEY = doAmbiente(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY, (v) => !pareceEndereco(v) && v.length >= 8, CHAVE_PADRAO, 'EXPO_PUBLIC_SUPABASE_ANON_KEY');
// Só a página publicada mede: no computador de quem desenvolve e nos testes, nada é enviado.
const SITE_HOST = new URL(SITE_URL).hostname;

rmSync(saida, { recursive: true, force: true });
mkdirSync(saida, { recursive: true });
cpSync(origem, saida, {
  recursive: true,
  filter: (src) => !/[\\/]_[^\\/]*$/.test(src) && !/[\\/]telas[\\/][^\\/]+\.png$/.test(src),
});

// ---- Capturas do app em WebP, em dois tamanhos (a página escolhe pelo srcset)
//
// A conversão usa ffmpeg, que existe na máquina de quem desenvolve mas NÃO no contêiner de
// compilação do Cloudflare: lá o build morria com "spawnSync ffmpeg ENOENT" e a landing nunca
// era publicada. Por isso os arquivos convertidos ficam guardados em site/assets/telas/_webp,
// versionados junto com o projeto (a pasta começa com "_" e não é copiada para o site). Quem
// tem ffmpeg gera o que falta; quem não tem usa o que está guardado. Se uma captura mudar e
// ninguém regenerar, o build para e diz o que fazer, em vez de publicar imagem velha.
const telas = join(origem, 'assets', 'telas');
const telasSaida = join(saida, 'assets', 'telas');
const guardadas = join(telas, '_webp');
mkdirSync(telasSaida, { recursive: true });
mkdirSync(guardadas, { recursive: true });
const temFfmpeg = (() => {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();
const LARGURAS = [390, 780];
let economizados = 0;
let convertidos = 0;
for (const arquivo of readdirSync(telas).filter((f) => f.endsWith('.png') && !f.startsWith('_'))) {
  const nome = arquivo.replace(/\.png$/, '');
  const assinatura = createHash('sha256').update(readFileSync(join(telas, arquivo))).digest('hex').slice(0, 16);
  for (const largura of LARGURAS) {
    const guardada = join(guardadas, `${nome}-${largura}-${assinatura}.webp`);
    if (!existsSync(guardada)) {
      if (!temFfmpeg) {
        throw new Error(
          `Falta a versão WebP de ${arquivo} em ${largura} px, e não há ffmpeg aqui para gerá-la.\n` +
            'Rode "npm run build:site" numa máquina com ffmpeg e publique o conteúdo de site/assets/telas/_webp.',
        );
      }
      execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', join(telas, arquivo),
        '-vf', `scale=${largura}:-1`, '-c:v', 'libwebp', '-quality', '80', '-compression_level', '6', guardada]);
      convertidos += 1;
      // A captura mudou: as conversões antigas dela não servem mais para ninguém.
      for (const velha of readdirSync(guardadas)) {
        if (velha.startsWith(`${nome}-${largura}-`) && velha !== `${nome}-${largura}-${assinatura}.webp`) {
          unlinkSync(join(guardadas, velha));
        }
      }
    }
    copyFileSync(guardada, join(telasSaida, `${nome}-${largura}.webp`));
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

// O filme só entra na página quando o arquivo existe (nada de player vazio).
const COM_FILME = existsSync(join(origem, 'assets', 'filme', 'meu-carrin.mp4'));
if (!COM_FILME) html = html.replace(/<!--\[FILME\]-->[\s\S]*?<!--\[\/FILME\]-->/, '');

// Dados estruturados das perguntas frequentes, tirados das próprias perguntas da página:
// o Google pede que o JSON-LD seja igual ao que a pessoa vê, e assim os dois nunca divergem.
const semTags = (t) => t.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const perguntas = [...html.matchAll(/<details class="pergunta">\s*<summary>([\s\S]*?)<\/summary>\s*<div class="pergunta__corpo">([\s\S]*?)<\/div>\s*<\/details>/g)]
  .map(([, pergunta, corpo]) => ({
    '@type': 'Question',
    name: semTags(pergunta),
    acceptedAnswer: { '@type': 'Answer', text: [...corpo.matchAll(/<p>([\s\S]*?)<\/p>/g)].map(([, p]) => semTags(p)).join(' ') },
  }));
if (!perguntas.length) throw new Error('Nenhuma pergunta frequente encontrada em site/index.html.');
html = html.replace('__PERGUNTAS_JSON__', JSON.stringify(perguntas, null, 2).replace(/\n/g, '\n      '));

html = html.replaceAll('__APP_URL__', APP_URL).replaceAll('__SITE_URL__', SITE_URL);
writeFileSync(join(saida, 'index.html'), html);

// Demais páginas do site também usam os endereços
for (const outra of ['404.html', 'termos.html']) {
  const caminho = join(saida, outra);
  if (!existsSync(caminho)) continue;
  writeFileSync(caminho, readFileSync(caminho, 'utf8').replaceAll('__APP_URL__', APP_URL).replaceAll('__SITE_URL__', SITE_URL));
}


let js = readFileSync(join(origem, 'pagina.js'), 'utf8');
js = js.replaceAll('__SUPABASE_URL__', SUPABASE_URL).replaceAll('__SUPABASE_KEY__', SUPABASE_KEY).replaceAll('__SITE_HOST__', SITE_HOST);
writeFileSync(join(saida, 'pagina.js'), js);

// ---- Política de privacidade (a mesma do aplicativo)
copyFileSync(join(root, 'docs', 'privacidade.html'), join(saida, 'privacidade.html'));

// ---- Imagem de compartilhamento (WhatsApp, redes sociais)
//
// Desenhada com o Chromium do Playwright, que existe na máquina de quem desenvolve mas não no
// contêiner de compilação do Cloudflare — o playwright nem é dependência do projeto. Mesma
// solução das capturas: o arquivo pronto fica versionado em site/assets/_gerados (a pasta
// começa com "_" e não é copiada para o site) e só é redesenhado onde há navegador.
const geradas = join(origem, 'assets', '_gerados');
mkdirSync(geradas, { recursive: true });
const capaGuardada = join(geradas, 'compartilhar.png');
const chromium = (() => {
  try {
    return createRequire(import.meta.url)('playwright').chromium;
  } catch {
    return null;
  }
})();
if (chromium) {
  const simbolo = readFileSync(join(origem, 'assets', 'marca', 'simbolo.svg'), 'utf8');
  const telaInicio = readFileSync(join(telas, 'inicio.png')).toString('base64');
  const fonte = readFileSync(join(origem, 'assets', 'fontes', 'archivo.woff2')).toString('base64');
  const navegador = await chromium.launch();
  const pagina = await navegador.newPage({ viewport: { width: 1200, height: 630 } });
  await pagina.setContent(`<html><head><meta charset="utf-8"><style>
    @font-face { font-family: Archivo; src: url(data:font/woff2;base64,${fonte}) format('woff2-variations'); font-weight: 400 800; }
    html,body { margin:0; width:1200px; height:630px; overflow:hidden; }
    .capa { width:1200px; height:630px; background:#0B5D3B; display:flex; align-items:center; gap:56px; padding:0 72px; box-sizing:border-box;
            font-family:Archivo, Arial, sans-serif; color:#fff; position:relative; }
    .capa::after { content:''; position:absolute; inset:auto -200px -320px auto; width:620px; height:620px; border-radius:50%;
                   background:radial-gradient(circle, rgba(60,194,127,.28), transparent 68%); }
    .marca { display:flex; align-items:center; gap:14px; font-size:30px; font-weight:800; letter-spacing:-1px; }
    .marca span { color:#3CC27F; }
    h1 { font-size:62px; line-height:1.03; letter-spacing:-2.6px; margin:26px 0 0; max-width:12em; font-weight:800; }
    p { font-size:27px; color:#C9E3D5; margin:22px 0 0; max-width:17em; }
    .fone { flex:none; width:286px; border-radius:30px; padding:9px; background:#06140D; box-shadow:0 30px 60px -20px rgba(0,0,0,.6); position:relative; z-index:2; }
    .fone img { width:100%; border-radius:22px; display:block; }
  </style></head><body><div class="capa">
    <div><div class="marca">${simbolo.replace('width="64" height="64"', 'width="46" height="46"')} Meu <span>Carrin</span></div>
      <h1>O mercado te cobrou certo?</h1>
      <p>Confira o cupom item por item antes de sair da loja. Grátis.</p></div>
    <div class="fone"><img src="data:image/png;base64,${telaInicio}" alt=""></div>
  </div></body></html>`);
  await pagina.waitForTimeout(350);
  await pagina.screenshot({ path: capaGuardada });
  await navegador.close();
} else if (!existsSync(capaGuardada)) {
  throw new Error(
    'Falta a imagem de compartilhamento e não há navegador aqui para desenhá-la.\n' +
      'Rode "npm run build:site" numa máquina com o playwright e publique site/assets/_gerados.',
  );
}
copyFileSync(capaGuardada, join(saida, 'assets', 'compartilhar.png'));

// ---- Cabeçalhos (Cloudflare e Netlify leem este arquivo)
// O Cloudflare Web Analytics injeta o próprio script na resposta da página. Sem estas duas
// origens na CSP o navegador o recusa e o site não registra visita nenhuma: o script vem de
// static.cloudflareinsights.com e a medição é enviada para cloudflareinsights.com.
const RASTREADOR_ORIGEM = 'https://static.cloudflareinsights.com';
const RASTREADOR_DESTINO = 'https://cloudflareinsights.com';
const conecta = ["'self'", new URL(SUPABASE_URL).origin, RASTREADOR_DESTINO].join(' ');
writeFileSync(join(saida, '_headers'), `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: DENY
  Permissions-Policy: camera=(), geolocation=(), microphone=(), interest-cohort=()
  Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' ${RASTREADOR_ORIGEM}; font-src 'self'; connect-src ${conecta}; base-uri 'none'; form-action 'none'; frame-ancestors 'none'

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
console.log(`  filme: ${COM_FILME ? 'publicado' : 'fora da página (ainda não renderizado)'}`);
console.log(`  perguntas frequentes nos dados estruturados: ${perguntas.length}`);
