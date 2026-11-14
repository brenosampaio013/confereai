// Gera a arte da ficha da Play Store (ícone 512 e banner 1024×500) a partir da marca.
// Uso: node scripts/generate-store-art.mjs
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'store', 'android');
const NAVY = '#0E2A47', GREEN = '#11915A', WHITE = '#FFFFFF';

// Mesmo desenho de src/ui/Logo.tsx e scripts/generate-icons.mjs
const glyph = (cesto = WHITE, visto = GREEN) => `
  <path d="M12 17h4.4a2.2 2.2 0 0 1 2 1.3L20.5 24" stroke="${cesto}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <path d="M20.5 24H51.5L47 41l-5.5-3-5.5 3-5.5-3-5.5 3Z" fill="${cesto}"/>
  <path d="M29 31.6l4.3 4.3 8.7-9.2" stroke="${visto}" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <circle cx="30" cy="48" r="3.2" fill="${cesto}"/><circle cx="44" cy="48" r="3.2" fill="${cesto}"/>`;

// Ícone da loja: quadrado cheio (o Google aplica a máscara), desenho na área segura.
const icone = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="${NAVY}"/>
  <g transform="translate(32 32) scale(1.08) translate(-32 -33)">${glyph()}</g>
</svg>`;

const banner = `<html><head><meta charset="utf-8"><style>
  html,body{margin:0;width:1024px;height:500px;overflow:hidden}
  .b{width:1024px;height:500px;background:${NAVY};display:flex;align-items:center;gap:52px;padding:0 84px;box-sizing:border-box;
     font-family:-apple-system,"Segoe UI",Roboto,Arial,sans-serif}
  .ico{width:224px;height:224px;border-radius:52px;background:#13365A;flex:none;display:flex;align-items:center;justify-content:center}
  h1{margin:0;font-size:68px;font-weight:800;letter-spacing:-2px;color:${WHITE};line-height:1}
  h1 span{color:#2FB87A}
  p{margin:18px 0 0;font-size:31px;line-height:1.3;color:#B9C9DA;font-weight:400;max-width:560px}
</style></head><body><div class="b">
  <div class="ico"><svg viewBox="0 0 64 64" width="150" height="150">${glyph()}</svg></div>
  <div><h1>Meu <span>Carrin</span></h1><p>Saiba quanto já deu antes de chegar no caixa.</p></div>
</div></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage();

await page.setViewportSize({ width: 512, height: 512 });
await page.setContent(`<html><body style="margin:0">${icone}</body></html>`);
await page.locator('svg').screenshot({ path: join(out, 'icone-512.png') });
console.log('gerado icone-512.png');

await page.setViewportSize({ width: 1024, height: 500 });
await page.setContent(banner);
await page.screenshot({ path: join(out, 'banner-1024x500.png') });
console.log('gerado banner-1024x500.png');

await browser.close();
