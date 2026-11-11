// Teste de ponta a ponta: orçamento, foto do produto com preço, Minhas compras, resumo financeiro
// e base de preços da comunidade. App web real (dist/) + fake-supabase (PostgreSQL real).
// A "leitura por IA" é SIMULADA pelo fake-supabase; usuários, loja e produtos são fictícios.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const { chromium } = createRequire(import.meta.url)('playwright');
const OUT = process.argv[2] || 'e2e-output';
mkdirSync(OUT, { recursive: true });
const APP = 'http://localhost:8090/confereai';
const API = 'http://localhost:8091';
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
const nb = (s) => s.replace(/ /g, ' ');

const browser = await chromium.launch();
const imgPath = join(OUT, 'produto-teste.png');
{
  const p = await browser.newPage({ viewport: { width: 600, height: 800 } });
  await p.setContent(`<div style="width:600px;height:800px;background:#e9f2e4;font-family:Arial;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px">
    <div style="font-size:30px;font-weight:700">IMAGEM DE TESTE</div><div style="font-size:44px">FEIJÃO CARIOCA 1 KG</div>
    <div style="background:#ffe14d;padding:20px;font-size:40px">DE 9,99 POR <b style="color:#c00;font-size:80px">8,49</b></div></div>`);
  writeFileSync(imgPath, await p.screenshot());
  await p.close();
}

async function session(email, password) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const dialogs = [];
  page.on('dialog', (d) => { dialogs.push(nb(d.message())); d.accept(); });
  page.on('pageerror', (e) => results.push(`pageerror (${email}): ${e.message.slice(0, 160)}`));
  await page.goto(`${APP}/`);
  await page.getByText('Nova compra', { exact: true }).waitFor({ timeout: 40000 });
  await page.goto(`${APP}/auth`);
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(password);
  await page.getByText('Entrar', { exact: true }).last().click();
  await page.waitForTimeout(1500);
  return { ctx, page, dialogs };
}
const click = async (page, text) => { await page.getByText(text, { exact: true }).last().click(); await page.waitForTimeout(700); };
const fill = (page, label, v) => page.getByLabel(label, { exact: true }).last().fill(v);
// Toca no botão de quantidade do último item (rola até ele ficar acima do rodapé fixo) e espera o total mudar.
async function stepQty(page, label, expectTotal) {
  const btn = page.getByLabel(label, { exact: true }).last();
  await btn.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(300);
  await btn.click();
  await page.getByText(expectTotal, { exact: true }).first().waitFor({ timeout: 10000 });
  await page.waitForTimeout(700);
}
const body = async (page) => nb(await page.locator('body').innerText());

async function addManual(page, name, price) {
  await page.goto(`${APP}/item/add?via=manual`);
  await page.getByText('Cadastro manual').waitFor({ timeout: 20000 });
  await fill(page, 'Nome do produto', name);
  await fill(page, 'Preço por unidade', price);
  await click(page, 'Adicionar ao carrinho');
  await page.waitForTimeout(800);
}

try {
  const alice = await session('alice@teste.local', 'senha-teste-1');
  const { page, dialogs } = alice;

  await step('define o orçamento ao começar a compra', async () => {
    await page.goto(`${APP}/`);
    await click(page, 'Nova compra');
    await page.getByText('Quanto pretende gastar?').waitFor({ timeout: 10000 });
    await fill(page, 'Valor disponível para esta compra', '100,00');
    await page.screenshot({ path: join(OUT, '20-orcamento-definir.png') });
    await click(page, 'Começar a compra');
    await page.waitForTimeout(1000);
  });

  await step('total, saldo e percentual atualizam a cada produto', async () => {
    await addManual(page, 'Arroz (teste)', '60,00');
    await page.goto(`${APP}/purchases`);
    await page.getByText('Dentro do orçamento').waitFor({ timeout: 20000 });
    const t = await body(page);
    assert.match(t, /R\$ 100,00/);
    assert.match(t, /R\$ 60,00/);
    assert.match(t, /R\$ 40,00/);
    assert.match(t, /60%/);
    assert.equal(dialogs.length, 0, 'sem alerta abaixo de 75%');
  });

  await step('avisa ao passar de 75%, ao atingir 100% e ao ultrapassar', async () => {
    await addManual(page, 'Café (teste)', '20,00'); // 80%
    await page.waitForTimeout(600);
    assert.equal(dialogs.length, 1);
    assert.match(dialogs[0], /Atenção ao orçamento/);
    assert.match(dialogs[0], /Você já gastou R\$ 80,00 dos R\$ 100,00 disponíveis \(80%\)\. Restam R\$ 20,00\./);
    await page.goto(`${APP}/purchases`);
    await page.getByText('Atenção ao orçamento').first().waitFor({ timeout: 20000 });
    await page.screenshot({ path: join(OUT, '21-orcamento-atencao.png') });
    await stepQty(page, 'Aumentar quantidade', 'Orçamento atingido'); // Café: 2 un → 100%
    assert.match(dialogs[1] ?? '', /Orçamento atingido/);
    await stepQty(page, 'Aumentar quantidade', 'Orçamento ultrapassado'); // 3 un → 120%
    assert.match(dialogs[2] ?? '', /Orçamento ultrapassado[\s\S]*Passou R\$ 20,00 do limite/);
    await page.getByText('Orçamento ultrapassado').first().waitFor({ timeout: 10000 });
    assert.match(await body(page), /120%/);
    await page.screenshot({ path: join(OUT, '22-orcamento-ultrapassado.png') });
  });

  await step('diminuir a quantidade recalcula e não dispara alerta', async () => {
    const before = dialogs.length;
    await stepQty(page, 'Diminuir quantidade', 'Orçamento atingido');
    await page.getByText('Orçamento atingido').first().waitFor({ timeout: 10000 });
    assert.equal(dialogs.length, before);
  });

  await step('vincula a compra a uma unidade cadastrada do supermercado', async () => {
    await page.getByLabel('Informar estabelecimento').click();
    await fill(page, 'Nome do supermercado', 'Mercado Teste');
    await page.getByLabel('Selecionar Mercado Teste E2E · Bela Vista').waitFor({ timeout: 15000 });
    await page.getByLabel('Selecionar Mercado Teste E2E · Bela Vista').click();
    await click(page, 'Salvar');
    await page.getByText('Mercado Teste E2E · Bela Vista').first().waitFor({ timeout: 10000 });
  });

  await step('foto do produto com a etiqueta preenche o formulário para conferência', async () => {
    await page.goto(`${APP}/capture`);
    await page.getByText('Para uma boa leitura').waitFor({ timeout: 20000 });
    const chooser = page.waitForEvent('filechooser');
    await click(page, 'Galeria');
    await (await chooser).setFiles(imgPath);
    await page.getByText('Identificar produto e preço').waitFor({ timeout: 10000 });
    await click(page, 'Identificar produto e preço');
    await click(page, 'Concordo, ler a imagem');
    await page.getByText('Dados lidos da foto — confira antes de salvar').waitFor({ timeout: 30000 });
    assert.equal(await page.getByLabel('Nome do produto', { exact: true }).inputValue(), 'Feijão Carioca (teste)');
    assert.equal(await page.getByLabel('Marca (opcional)', { exact: true }).inputValue(), 'Marca Teste');
    assert.equal(await page.getByLabel('Peso ou volume da embalagem', { exact: true }).inputValue(), '1 kg');
    assert.equal(await page.getByLabel('Preço por unidade', { exact: true }).inputValue(), '9,99'); // preço normal; o promocional é uma opção
    assert.match(await body(page), /Preço promocional na etiqueta: R\$ 8,49[\s\S]*CLUBE/);
    await page.screenshot({ path: join(OUT, '23-foto-conferir.png') });
    await click(page, 'Usar preço promocional');
    assert.equal(await page.getByLabel('Preço por unidade', { exact: true }).inputValue(), '8,49');
    // O usuário pode corrigir antes de salvar
    await fill(page, 'Nome do produto', 'Feijão carioca (teste)');
    await click(page, 'Adicionar ao carrinho');
    await page.waitForTimeout(1200);
  });

  let purchaseId;
  await step('compra encerrada fica em Minhas compras com orçamento e diferença', async () => {
    await page.goto(`${APP}/purchases`);
    await page.getByText('Feijão carioca (teste)').first().waitFor({ timeout: 20000 });
    await click(page, 'Encerrar');
    await page.waitForTimeout(1500);
    await page.goto(`${APP}/purchases?view=history`);
    await page.getByText('Acima do orçamento').first().waitFor({ timeout: 20000 });
    await page.screenshot({ path: join(OUT, '24-minhas-compras.png') });
    await page.getByText('Mercado Teste E2E · Bela Vista').first().click();
    await page.getByText('Orçamento planejado').waitFor({ timeout: 20000 });
    const t = await body(page);
    assert.match(t, /Orçamento planejado\s*R\$ 100,00/);
    assert.match(t, /Valor final\s*R\$ 108,49/); // 60 + 2×20 + 8,49
    assert.match(t, /Acima do orçamento\s*\+\s?R\$ 8,49/);
    assert.match(t, /Economia registrada\s*R\$ 1,50/); // 9,99 − 8,49
    assert.match(t, /promoção \(normal R\$ 9,99\)/);
    await page.screenshot({ path: join(OUT, '25-detalhe-compra.png'), fullPage: true });
    purchaseId = page.url().split('/').pop();
  });

  await step('resumo financeiro do mês', async () => {
    await page.goto(`${APP}/purchases?view=summary`);
    await page.getByText('Total gasto no mês').waitFor({ timeout: 20000 });
    const t = await body(page);
    assert.match(t, /Total gasto no mês\s*R\$ 108,49/i);
    assert.match(t, /Compras\s*1/i);
    assert.match(t, /Média por compra\s*R\$ 108,49/i);
    assert.match(t, /Economia registrada\s*R\$ 1,50/i);
    assert.match(t, /Sem compras no mês anterior/);
    assert.match(t, /0 de 1 compra com orçamento ficou dentro do planejado/);
    await page.screenshot({ path: join(OUT, '26-resumo.png'), fullPage: true });
  });

  await step('compra sincronizada pertence só à Alice e os preços vão para a base da comunidade sem identificá-la', async () => {
    await page.goto(`${APP}/profile`);
    await click(page, 'Sincronizar');
    await page.waitForTimeout(4000);
    const rows = await sql('select id, budget_cents, store_location_id is not null as linked from public.purchases where id = $1', [purchaseId]);
    assert.deepEqual(rows.map((r) => [Number(r.budget_cents), r.linked]), [[10000, true]]);
    const owners = await sql('select distinct user_id from public.purchases');
    assert.equal(owners.length, 1);
    const shared = await sql(`select sp.name, pr.unit_price_cents, pr.regular_price_cents, pr.promo from public.price_reports pr join public.shared_products sp on sp.id = pr.product_id order by sp.name`);
    assert.deepEqual(shared.map((r) => [r.name, r.unit_price_cents, r.regular_price_cents, r.promo]), [['Arroz (teste)', 6000, null, false], ['Café (teste)', 2000, null, false], ['Feijão carioca (teste)', 849, 999, true]]);
  });

  await step('página do produto: preço por supermercado e preços da comunidade', async () => {
    await page.goto(`${APP}/prices`);
    await page.getByText('Feijão carioca (teste)').first().waitFor({ timeout: 20000 });
    await page.screenshot({ path: join(OUT, '27-precos.png') });
    await page.getByText('Feijão carioca (teste)').first().click();
    await page.getByText('Preços informados pela comunidade').waitFor({ timeout: 20000 });
    await page.getByText('informado por 1 pessoa', { exact: false }).waitFor({ timeout: 20000 });
    const t = await body(page);
    assert.match(t, /Último preço registrado\s*R\$ 8,49 · hoje/);
    assert.match(t, /Mercado Teste E2E · Bela Vista\s*R\$ 8,49/);
    await page.screenshot({ path: join(OUT, '28-produto-precos.png'), fullPage: true });
  });

  await step('outra conta não vê as compras nem o orçamento da Alice', async () => {
    const bruno = await session('bruno@teste.local', 'senha-teste-2');
    await bruno.page.goto(`${APP}/profile`);
    await click(bruno.page, 'Sincronizar');
    await bruno.page.waitForTimeout(3000);
    await bruno.page.goto(`${APP}/purchases?view=history`);
    await bruno.page.getByText('Nenhuma compra salva').waitFor({ timeout: 20000 });
    // Direto na API, com o token do Bruno: nenhuma linha da Alice.
    const token = await bruno.page.evaluate(() => {
      for (let i = 0; i < localStorage.length; i++) {
        const v = localStorage.getItem(localStorage.key(i));
        if (v && v.includes('access_token')) return JSON.parse(v).access_token;
      }
      return null;
    });
    assert.ok(token, 'token do Bruno');
    for (const table of ['purchases', 'cart_items', 'price_history']) {
      const r = await fetch(`${API}/rest/v1/${table}?select=id`, { headers: { Authorization: `Bearer ${token}` } });
      assert.deepEqual(await r.json(), [], table);
    }
    // Mas ele consegue consultar o preço que a comunidade informou.
    const r = await fetch(`${API}/rest/v1/rpc/community_prices`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ p_name: 'Feijão carioca (teste)', p_brand: 'Marca Teste', p_package_amount: 1000, p_package_unit: 'g' }) });
    const list = await r.json();
    assert.equal(list.length, 1);
    assert.equal(list[0].unit_price_cents, 849);
    assert.ok(!JSON.stringify(list).includes('user'));
    await bruno.ctx.close();
  });
} catch (e) {
  if (!results.some((r) => r.startsWith('FAIL'))) results.push(`FAIL execução: ${e.message.split('\n')[0]}`);
} finally {
  console.log(results.join('\n'));
  await browser.close();
}
