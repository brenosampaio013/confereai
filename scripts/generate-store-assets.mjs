// Gera os gráficos da ficha da Google Play (ícone 512×512 e banner 1024×500).
// Uso: node scripts/generate-store-assets.mjs
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const { chromium } = createRequire(import.meta.url)('playwright');
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'store', 'android');
const NAVY = '#0E2A47', GREEN = '#11915A', FAINT = '#8A97A6';
const glyph = `
  <path d="M19 13h26a2 2 0 0 1 2 2v34l-5-3-5 3-5-3-5 3-5-3-5 3V15a2 2 0 0 1 2-2z" fill="#fff"/>
  <path d="M23 21h18M23 27h12" stroke="${FAINT}" stroke-width="3" stroke-linecap="round"/>
  <path d="M24.5 36.5l5.5 5.5 11-12" stroke="${GREEN}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;

const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="${NAVY}"/><g transform="translate(32 32) scale(1.15) translate(-32 -31)">${glyph}</g></svg>`;

const feature = `<div style="width:1024px;height:500px;background:${NAVY};display:flex;align-items:center;gap:56px;padding:0 80px;box-sizing:border-box;font-family:Inter,Helvetica,Arial,sans-serif">
  <svg width="220" height="220" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#163A5E"/>${glyph}</svg>
  <div style="color:#fff">
    <div style="font-size:72px;font-weight:800;letter-spacing:-2px">Confere <span style="color:#3CCB8A">Aí</span></div>
    <div style="font-size:30px;line-height:1.35;margin-top:14px;color:#C9D6E3;max-width:560px">Registre suas compras e confira o cupom fiscal antes de sair do caixa.</div>
  </div></div>`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 512, height: 512 });
await page.setContent(`<body style="margin:0">${icon}</body>`);
await page.locator('svg').screenshot({ path: join(out, 'icone-512.png') });
await page.setViewportSize({ width: 1024, height: 500 });
await page.setContent(`<body style="margin:0">${feature}</body>`);
await page.locator('body > div').screenshot({ path: join(out, 'banner-1024x500.png') });
await browser.close();
console.log('gerados em', out);
