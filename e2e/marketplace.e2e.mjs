// Teste de ponta a ponta do marketplace: app web real (dist/) + fake-supabase (PostgreSQL real
// com as migrações). Usuários, loja, produto e imagem são FICTÍCIOS, criados só para o teste.
//
//   node e2e/fake-supabase.mjs 8091 &
//   (servir dist/ em http://localhost:8090/confereai/)
//   node e2e/marketplace.e2e.mjs <pasta-para-capturas>
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const { chromium } = createRequire(import.meta.url)('playwright');
const OUT = process.argv[2] || 'e2e-output';
mkdirSync(OUT, { recursive: true });
const APP = 'http://localhost:8090/confereai';
const API = 'http://localhost:8091';
const STORE = { latitude: -23.561684, longitude: -46.655981 };
const north = (m) => ({ latitude: STORE.latitude + m / 111195, longitude: STORE.longitude });
const sql = async (q, params = []) => (await fetch(`${API}/__debug/sql`, { method: 'POST', body: JSON.stringify({ sql: q, params }) })).json();
const results = [];
const step = async (name, fn) => {
  try {
    await fn();
    results.push(`ok   ${name}`);
  } catch (e) {
    results.push(`FAIL ${name}: ${e.message.split('\n')[0]}`);
    throw e;
  }
};

const browser = await chromium.launch();

// Imagem de teste (etiqueta fictícia)
const imgPath = join(OUT, 'etiqueta-teste.png');
{
  const p = await browser.newPage({ viewport: { width: 800, height: 600 } });
  await p.setContent(`<div style="width:800px;height:600px;background:#ffe14d;font-family:Arial;display:flex;flex-direction:column;align-items:center;justify-content:center">
    <div style="font-size:40px;font-weight:700">IMAGEM DE TESTE</div><div style="font-size:56px">ACÉM BOVINO KG</div>
    <div style="font-size:120px;font-weight:900;color:#c00">R$ 29,90</div></div>`);
  writeFileSync(imgPath, await p.screenshot());
  await p.close();
}

async function session(email, password, geo) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, permissions: ['geolocation'], geolocation: geo ? { ...geo, accuracy: 15 } : undefined });
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept());
  page.on('pageerror', (e) => results.push(`pageerror (${email ?? 'visitante'}): ${e.message.slice(0, 160)}`));
  await page.goto(`${APP}/`);
  await page.getByText('Nova compra', { exact: true }).waitFor({ timeout: 40000 });
  if (email) {
    await page.goto(`${APP}/auth`);
    await page.getByLabel('E-mail', { exact: true }).fill(email);
    await page.getByLabel('Senha', { exact: true }).fill(password);
    await page.getByText('Entrar', { exact: true }).last().click();
    await page.waitForTimeout(1500);
  }
  return { ctx, page };
}
const click = async (page, text) => { await page.getByText(text, { exact: true }).last().click(); await page.waitForTimeout(600); };
const fill = (page, label, v) => page.getByLabel(label, { exact: true }).last().fill(v);

async function publish(page, { name, price, unitLabel = 'Quilo', expectLocation, expectDone }) {
  await page.goto(`${APP}/offers/publish`);
  await page.getByText('Qual é o produto?').waitFor({ timeout: 20000 });
  await fill(page, 'Nome do produto', name);
  await click(page, 'Carnes e aves');
  await click(page, 'Continuar');
  const chooser = page.waitForEvent('filechooser');
  await click(page, 'Câmera');
  await (await chooser).setFiles(imgPath);
  await page.getByText('Recortar foto').waitFor({ timeout: 10000 });
  await click(page, '2x');
  await click(page, 'Usar esta foto');
  await page.waitForTimeout(800);
  await click(page, 'Continuar');
  await fill(page, 'Preço promocional', price);
  await click(page, unitLabel);
  await click(page, 'Continuar');
  await click(page, 'Mercado Teste E2E');
  await click(page, 'Continuar');
  await page.getByText(expectLocation).first().waitFor({ timeout: 30000 });
  return async (shot) => {
    if (shot) await page.screenshot({ path: join(OUT, shot) });
    await click(page, 'Publicar promoção');
    await page.getByText(expectDone).first().waitFor({ timeout: 30000 });
  };
}

try {
  // 1) Visitante sem conta: marketplace vazio convida a publicar
  const visitor = await session(null, null, null);
  await step('visitante vê o convite para publicar quando não há ofertas', async () => {
    await visitor.page.goto(`${APP}/offers`);
    await visitor.page.getByText('Ainda não há ofertas por aqui').waitFor({ timeout: 20000 });
    await visitor.page.screenshot({ path: join(OUT, '01-ofertas-vazio.png') });
  });

  // 2) Alice publica no supermercado (GPS a ~40 m)
  const alice = await session('alice@teste.local', 'senha-teste-1', north(40));
  let offerId;
  await step('publicação com foto, recorte, preço, unidade e GPS compatível', async () => {
    const go = await publish(alice.page, { name: 'Acém bovino (teste)', price: '29,90', expectLocation: 'Localização compatível', expectDone: 'Oferta publicada!' });
    await go('02-publicar-localizacao.png');
    await alice.page.screenshot({ path: join(OUT, '03-publicada.png') });
    const row = (await sql(`select p.id, p.status, p.location_status, p.photo_status, (select count(*)::int from public.promotion_images i where i.promotion_id = p.id) imgs,
      (select distance_m from public.promotion_location_checks k where k.promotion_id = p.id) dist from public.promotions p where product_name = 'Acém bovino (teste)'`))[0];
    offerId = row.id;
    assert.equal(row.status, 'partially_verified');
    assert.equal(row.location_status, 'compatible');
    assert.equal(row.imgs, 1);
    assert.ok(row.dist >= 35 && row.dist <= 45, `distância ${row.dist}`);
  });

  await step('GPS longe da loja: aviso claro e oferta vai para análise', async () => {
    await alice.ctx.setGeolocation({ ...north(3000), accuracy: 10 });
    const go = await publish(alice.page, { name: 'Fraldinha (teste)', price: '39,90', expectLocation: 'Você parece estar longe do estabelecimento', expectDone: 'Oferta enviada para análise' });
    await go('04-publicar-longe.png');
    const st = (await sql(`select status, location_status from public.promotions where product_name = 'Fraldinha (teste)'`))[0];
    assert.deepEqual(st, { status: 'pending_review', location_status: 'far' });
  });

  // 3) Outro usuário vê, abre, confirma; tentativa de duplicar é desviada para a existente
  const bruno = await session('bruno@teste.local', 'senha-teste-2', north(20));
  await step('outro usuário vê a oferta com indicadores separados', async () => {
    await bruno.page.goto(`${APP}/offers`);
    await bruno.page.getByText('Acém bovino (teste)').first().waitFor({ timeout: 20000 });
    assert.equal(await bruno.page.getByText('Fraldinha (teste)').count(), 0, 'oferta em análise não aparece');
    await bruno.page.screenshot({ path: join(OUT, '05-ofertas-lista.png') });
    await bruno.page.goto(`${APP}/offers/${offerId}`);
    await bruno.page.getByText('O que foi verificado').waitFor({ timeout: 20000 });
    assert.ok(await bruno.page.getByText('Localização compatível').count());
    assert.equal(await bruno.page.getByText('Comprovada por foto').count(), 0);
    assert.equal(await bruno.page.getByText('Sua verificação de localização', { exact: false }).count(), 0, 'dados de verificação do autor não aparecem para terceiros');
    await bruno.page.screenshot({ path: join(OUT, '06-detalhe.png'), fullPage: true });
  });

  await step('confirmação pela comunidade', async () => {
    await click(bruno.page, 'Confirmar promoção');
    await click(bruno.page, 'Enviar resposta');
    await bruno.page.waitForTimeout(1500);
    const c = (await sql(`select confirmation_type, independent, location_status from public.promotion_confirmations where promotion_id = $1`, [offerId]))[0];
    assert.deepEqual(c, { confirmation_type: 'found', independent: true, location_status: 'compatible' });
    assert.equal((await sql('select independent_confirmations n from public.promotions where id = $1', [offerId]))[0].n, 1);
  });

  await step('favoritar e denunciar', async () => {
    await bruno.page.goto(`${APP}/offers/${offerId}`);
    await click(bruno.page, 'Favoritar');
    await bruno.page.getByText('Favoritada').waitFor({ timeout: 10000 });
    await click(bruno.page, 'Denunciar publicação');
    await click(bruno.page, 'Preço incorreto');
    await click(bruno.page, 'Enviar denúncia');
    await bruno.page.waitForTimeout(1200);
    assert.equal((await sql(`select count(*)::int n from public.promotion_reports where promotion_id = $1 and status = 'open'`, [offerId]))[0].n, 1);
  });

  await step('publicação idêntica é desviada para a oferta existente', async () => {
    const go = await publish(bruno.page, { name: 'Acém bovino (teste)', price: '29,90', expectLocation: 'Localização compatível', expectDone: 'Esta oferta já foi publicada' });
    await go();
    await bruno.page.screenshot({ path: join(OUT, '07-duplicada.png') });
    assert.equal((await sql(`select count(*)::int n from public.promotions where product_name = 'Acém bovino (teste)'`))[0].n, 1);
  });

  // 4) Moderação
  const admin = await session('admin@teste.local', 'senha-admin-1', null);
  await step('painel de moderação: denúncia, foto e aprovação da oferta em análise', async () => {
    await admin.page.goto(`${APP}/admin`);
    await admin.page.getByText('Preço incorreto').waitFor({ timeout: 20000 });
    await admin.page.screenshot({ path: join(OUT, '08-moderacao.png') });
    await click(admin.page, 'Rejeitar');
    await admin.page.waitForTimeout(1200);
    await admin.page.goto(`${APP}/admin/${offerId}`);
    await admin.page.getByText('Verificações de localização').waitFor({ timeout: 20000 });
    await click(admin.page, 'Aceitar foto');
    await admin.page.waitForTimeout(1500);
    await admin.page.screenshot({ path: join(OUT, '09-moderacao-revisao.png'), fullPage: true });
    const p = (await sql('select photo_status from public.promotions where id = $1', [offerId]))[0];
    assert.equal(p.photo_status, 'accepted');
    const pending = (await sql(`select id from public.promotions where product_name = 'Fraldinha (teste)'`))[0].id;
    await admin.page.goto(`${APP}/admin/${pending}`);
    await admin.page.getByText('Aprovar publicação').waitFor({ timeout: 20000 });
    await click(admin.page, 'Aprovar publicação');
    await admin.page.waitForTimeout(1500);
    assert.equal((await sql('select status from public.promotions where id = $1', [pending]))[0].status, 'partially_verified');
    const log = await sql('select action from public.moderation_actions order by id');
    assert.deepEqual(log.map((l) => l.action), ['reject', 'accept_photo', 'approve']);
  });

  await step('visitante vê o indicador de foto comprovada e o mapa por unidade', async () => {
    await visitor.page.goto(`${APP}/offers/${offerId}`);
    await visitor.page.getByText('Comprovada por foto').first().waitFor({ timeout: 20000 });
    await visitor.page.goto(`${APP}/offers`);
    await visitor.page.getByText('Ver no mapa').waitFor({ timeout: 20000 });
    await click(visitor.page, 'Ver no mapa');
    await visitor.page.waitForTimeout(3000);
    await visitor.page.screenshot({ path: join(OUT, '10-mapa.png') });
    assert.ok(await visitor.page.locator('button[aria-label="2 ofertas nesta unidade"]').count(), 'marcador da unidade com 2 ofertas');
  });

  await step('coordenadas de quem publicou não foram gravadas em lugar nenhum', async () => {
    const cols = await sql(`select table_name, column_name from information_schema.columns where table_schema = 'public' and (column_name ~ '(^|_)(lat|lng|lon)(_|$)' or column_name like '%latitude%' or column_name like '%longitude%')`);
    assert.deepEqual(cols.map((c) => c.table_name).sort(), ['supermarket_locations', 'supermarket_locations']);
  });

  await step('oferta vencida deixa de aparecer como ativa', async () => {
    await sql(`update public.promotions set expires_at = now() - interval '1 minute' where id = $1`, [offerId]);
    await sql('select public.expire_promotions()');
    await visitor.page.goto(`${APP}/offers`);
    await visitor.page.getByText('Fraldinha (teste)').first().waitFor({ timeout: 20000 });
    assert.equal(await visitor.page.getByText('Acém bovino (teste)').count(), 0);
    assert.equal((await sql('select status from public.promotions where id = $1', [offerId]))[0].status, 'expired');
  });
} catch (e) {
  if (!results.some((r) => r.startsWith('FAIL'))) results.push(`FAIL execução: ${e.message.split('\n')[0]}`);
} finally {
  console.log(results.join('\n'));
  await browser.close();
}
