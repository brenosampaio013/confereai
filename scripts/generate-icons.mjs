// Gera os ícones do app a partir do SVG da marca (requer Playwright/Chromium).
// Uso: node scripts/generate-icons.mjs
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'images');
const NAVY = '#0E2A47', GREEN = '#11915A', WHITE = '#FFFFFF';

// Carrinho com cesto de cupom + visto, em 64×64 (mesmo desenho de src/ui/Logo.tsx)
const glyph = (cesto = WHITE, visto = GREEN) => `
  <path d="M12 17h4.4a2.2 2.2 0 0 1 2 1.3L20.5 24" stroke="${cesto}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <path d="M20.5 24H51.5L47 41l-5.5-3-5.5 3-5.5-3-5.5 3Z" fill="${cesto}"/>
  <path d="M29 31.6l4.3 4.3 8.7-9.2" stroke="${visto}" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <circle cx="30" cy="48" r="3.2" fill="${cesto}"/><circle cx="44" cy="48" r="3.2" fill="${cesto}"/>`;

const svg = (size, inner, bg) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">${bg ?? ''}${inner}</svg>`;
// Para ícones adaptativos o desenho deve ficar na área segura central (~66%).
const scaled = (s, inner) => `<g transform="translate(32 32) scale(${s}) translate(-32 -33)">${inner}</g>`;

const targets = [
  { file: 'icon.png', size: 1024, svg: svg(1024, scaled(1.15, glyph()), `<rect width="64" height="64" fill="${NAVY}"/>`) },
  { file: 'android-icon-foreground.png', size: 1024, svg: svg(1024, scaled(0.78, glyph())) },
  { file: 'android-icon-background.png', size: 1024, svg: svg(1024, '', `<rect width="64" height="64" fill="${NAVY}"/>`) },
  { file: 'android-icon-monochrome.png', size: 1024, svg: svg(1024, scaled(0.78, glyph(WHITE, NAVY))) },
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
