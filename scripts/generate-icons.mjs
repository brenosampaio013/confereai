// Gera os ícones do app a partir do SVG da marca (requer Playwright/Chromium).
// Uso: node scripts/generate-icons.mjs
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'images');
const NAVY = '#0E2A47', GREEN = '#11915A', WHITE = '#FFFFFF', FAINT = '#8A97A6';

// Recibo + visto, em coordenadas 64×64 (mesmo desenho de src/ui/Logo.tsx)
const glyph = (receipt = WHITE, lines = FAINT, check = GREEN) => `
  <path d="M19 13h26a2 2 0 0 1 2 2v34l-5-3-5 3-5-3-5 3-5-3-5 3V15a2 2 0 0 1 2-2z" fill="${receipt}"/>
  <path d="M23 21h18M23 27h12" stroke="${lines}" stroke-width="3" stroke-linecap="round"/>
  <path d="M24.5 36.5l5.5 5.5 11-12" stroke="${check}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;

const svg = (size, inner, bg) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">${bg ?? ''}${inner}</svg>`;
// Para ícones adaptativos o desenho deve ficar na área segura central (~66%).
const scaled = (s, inner) => `<g transform="translate(32 32) scale(${s}) translate(-32 -31)">${inner}</g>`;

const targets = [
  { file: 'icon.png', size: 1024, svg: svg(1024, scaled(1.15, glyph()), `<rect width="64" height="64" fill="${NAVY}"/>`) },
  { file: 'android-icon-foreground.png', size: 1024, svg: svg(1024, scaled(0.78, glyph())) },
  { file: 'android-icon-background.png', size: 1024, svg: svg(1024, '', `<rect width="64" height="64" fill="${NAVY}"/>`) },
  { file: 'android-icon-monochrome.png', size: 1024, svg: svg(1024, scaled(0.78, glyph(WHITE, NAVY, NAVY))) },
  { file: 'splash-icon.png', size: 512, svg: svg(512, '', `<rect width="64" height="64" rx="16" fill="${NAVY}"/>${glyph()}`) },
  // Ícones do app instalável (PWA)
  { file: 'pwa-192.png', size: 192, svg: svg(192, '', `<rect width="64" height="64" rx="14" fill="${NAVY}"/>${glyph()}`) },
  { file: 'pwa-512.png', size: 512, svg: svg(512, '', `<rect width="64" height="64" rx="14" fill="${NAVY}"/>${glyph()}`) },
  { file: 'pwa-maskable-512.png', size: 512, svg: svg(512, scaled(0.8, glyph()), `<rect width="64" height="64" fill="${NAVY}"/>`) },
  { file: 'apple-touch-icon.png', size: 180, svg: svg(180, scaled(1.0, glyph()), `<rect width="64" height="64" fill="${NAVY}"/>`) },
  { file: 'favicon.png', size: 64, svg: svg(64, glyph(), `<rect width="64" height="64" rx="14" fill="${NAVY}"/>`) },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const t of targets) {
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${t.svg}</body></html>`);
  await page.locator('svg').screenshot({ path: join(out, t.file), omitBackground: true });
  console.log('gerado', t.file);
}
await browser.close();
