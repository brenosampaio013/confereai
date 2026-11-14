// Captura telas reais do aplicativo para a landing page e para a ficha da loja.
// Sobe o mesmo ambiente dos testes ponta a ponta (fake-supabase + app web real),
// dirige o app com o Chromium e salva as imagens em site/assets/telas/.
//
//   node scripts/capture-screens.mjs [--sem-build]
//
// Os dados são de demonstração: produtos genéricos e preços fictícios, criados pelo
// próprio roteiro. Nenhuma marca real e nenhum dado de usuário aparece nas imagens.
import { createRequire } from 'node:module';
import { spawn, execSync } from 'node:child_process';
import http from 'node:http';
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');
const root = join(fileURLToPath(import.meta.url), '..', '..');
const dist = join(root, 'dist');
const OUT = join(root, 'site', 'assets', 'telas');
const PORT = 8098, API = 8099;
const APP = `http://localhost:${PORT}`;
mkdirSync(OUT, { recursive: true });

// Produto devolvido pela leitura simulada (formato da Edge Function real).
const PRODUTO = JSON.stringify({
  parts: [{ lines: ['CAFE TORRADO E MOIDO 500G', 'DE 24,90 POR 19,90', 'LEVE 2 PAGUE 1,5'] }],
  product: {
    product_name: 'Café torrado e moído', brand: null, package_text: '500 g', barcode: '7899999000015',
    regular_price: '24,90', promo_price: '19,90', price_basis: 'unit', reference_price: null, reference_per: null,
    promo_conditions: ['LEVE 2 PAGUE 1,5'], label_matches_product: 'yes', uncertain_fields: [],
  },
});

const api = spawn(process.execPath, ['e2e/fake-supabase.mjs', String(API)], {
  cwd: root, stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, FAKE_OCR_PRODUCT: PRODUTO },
});
await new Promise((r) => api.stdout.on('data', (d) => String(d).includes('fake-supabase em') && r()));

if (!process.argv.includes('--sem-build')) {
  execSync('node scripts/build-web.mjs', {
    cwd: root, stdio: 'inherit',
    env: { ...process.env, CI: '1', EXPO_BASE_URL: '', EXPO_PUBLIC_SUPABASE_URL: `http://localhost:${API}`, EXPO_PUBLIC_SUPABASE_ANON_KEY: 'chave-de-captura' },
  });
}

const types = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.png': 'image/png', '.ttf': 'font/ttf', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.css': 'text/css' };
const site = http.createServer((req, res) => {
  let f = join(dist, decodeURIComponent(req.url.split('?')[0]));
  if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
  if (!existsSync(f)) { res.writeHead(200, { 'Content-Type': 'text/html' }); return createReadStream(join(dist, 'index.html')).pipe(res); }
  res.writeHead(200, { 'Content-Type': types[extname(f)] || 'application/octet-stream' });
  createReadStream(f).pipe(res);
}).listen(PORT);

const browser = await chromium.launch();

// Foto de demonstração: embalagem genérica (sem marca real) ao lado da etiqueta de gôndola.
const ETIQUETA = join(OUT, '_etiqueta.png');
{
  const p = await browser.newPage({ viewport: { width: 620, height: 820 } });
  await p.setContent(`<html><body style="margin:0;font-family:-apple-system,Segoe UI,Roboto,Arial">
    <div style="width:620px;height:820px;background:linear-gradient(170deg,#E8E4DD,#CFCBC3);position:relative;overflow:hidden">
      <div style="position:absolute;left:0;right:0;top:470px;height:16px;background:#9FA6AD"></div>
      <div style="position:absolute;left:92px;top:118px;width:250px;height:360px;border-radius:10px;
                  background:linear-gradient(135deg,#4A2C1A,#2E1B10);box-shadow:14px 18px 30px rgba(0,0,0,.28);
                  color:#F2E6D8;padding:26px;box-sizing:border-box;display:flex;flex-direction:column;justify-content:space-between">
        <div style="font-size:15px;letter-spacing:3px;opacity:.75">TORRADO E MOÍDO</div>
        <div><div style="font-size:60px;font-weight:800;line-height:.95">CAFÉ</div>
             <div style="font-size:19px;opacity:.8;margin-top:8px">torra média</div></div>
        <div style="font-size:26px;font-weight:700">500 g</div>
      </div>
      <div style="position:absolute;left:356px;top:300px;width:214px;background:#FFE24D;padding:16px 14px;
                  box-shadow:6px 10px 20px rgba(0,0,0,.22);transform:rotate(-1.2deg);color:#1a1a1a">
        <div style="font-size:15px;font-weight:700;line-height:1.25">CAFE TORRADO E MOIDO 500G</div>
        <div style="font-size:13px;margin-top:8px;text-decoration:line-through;opacity:.7">DE R$ 24,90</div>
        <div style="display:flex;align-items:baseline;gap:5px;margin-top:2px">
          <span style="font-size:17px;font-weight:700">R$</span><span style="font-size:52px;font-weight:800;line-height:1">19,90</span></div>
        <div style="font-size:12px;margin-top:8px;background:#1a1a1a;color:#FFE24D;display:inline-block;padding:3px 7px">LEVE 2 PAGUE 1,5</div>
        <div style="font-size:11px;margin-top:9px;letter-spacing:1px;font-family:monospace">7899999000015</div>
      </div>
    </div></body></html>`);
  writeFileSync(ETIQUETA, await p.screenshot());
  await p.close();
}
const feitas = [];
const falhas = [];
let page = null;

let contexto = null;
const nova = async () => {
  contexto = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pt-BR' });
  const p = await contexto.newPage();
  p.on('dialog', (d) => d.accept());
  return p;
};
/** Fixa a data que o app enxerga (para registrar uma compra no mês anterior). */
const quando = (data) => contexto.clock.setFixedTime(data);
const click = async (text) => { await page.getByText(text, { exact: true }).last().click(); await page.waitForTimeout(600); };
const fill = (label, v) => page.getByLabel(label, { exact: true }).last().fill(v);
/** Rola a tela do app (ScrollView do React Native Web não move a janela). */
const rolar = async (y) => {
  await page.mouse.move(195, 500);
  await page.mouse.wheel(0, -4000);
  await page.waitForTimeout(400);
  if (y > 0) { await page.mouse.wheel(0, y); await page.waitForTimeout(700); }
};
const tela = async (nome) => {
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT, `${nome}.png`) });
  feitas.push(nome);
};
const passo = async (nome, fn) => {
  try { await fn(); } catch (e) {
    falhas.push(`${nome}: ${e.message.split('\n')[0]}`);
    if (page) await page.screenshot({ path: join(OUT, `_falha-${nome}.png`) }).catch(() => {});
  }
};
async function adicionar(nome, preco, qtd = 1, desconto = null) {
  await page.goto(`${APP}/item/add?via=manual`);
  await page.getByText('Cadastro manual').waitFor({ timeout: 25000 });
  await fill('Nome do produto', nome);
  await fill('Preço por unidade', preco);
  for (let i = 1; i < qtd; i++) {
    const mais = page.getByLabel('Aumentar quantidade', { exact: true }).last();
    await mais.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await mais.click();
    await page.waitForTimeout(120);
  }
  if (desconto) await fill('Desconto no item (opcional)', desconto);
  await click('Adicionar ao carrinho');
  await page.waitForTimeout(500);
}

async function linhaDoCupom(descricao, qtd, unitario, total) {
  await click('Adicionar linha');
  await page.getByText('Nova linha').waitFor({ timeout: 10000 });
  await fill('Descrição', descricao);
  await fill('Quantidade', qtd);
  await fill('Preço unitário', unitario);
  await fill('Valor total da linha', total);
  await click('Salvar correção');
  await page.waitForTimeout(400);
}

async function novaCompra(orcamento) {
  await page.goto(`${APP}/`);
  await click('Nova compra');
  await page.getByText('Quanto pretende gastar?').waitFor({ timeout: 15000 });
  await fill('Valor disponível para esta compra', orcamento);
  await click('Começar a compra');
  await page.waitForTimeout(900);
}

async function encerrarCompra() {
  await page.goto(`${APP}/purchases`);
  await page.getByText('Encerrar', { exact: true }).last().waitFor({ timeout: 25000 });
  await click('Encerrar');
  await page.waitForTimeout(1800);
}

async function definirMercado(nome) {
  await page.getByLabel('Informar estabelecimento', { exact: true }).last().click();
  await page.waitForTimeout(500);
  await fill('Nome do supermercado', nome);
  await click('Salvar');
  await page.waitForTimeout(600);
}

try {
  page = await nova();

  // ---- Compra do mês anterior: dá base de comparação ao resumo e ao histórico de preços
  await passo('mes-anterior', async () => {
    await quando(new Date('2026-10-18T19:10:00'));
    await page.goto(`${APP}/`);
    await page.getByText('Nova compra', { exact: true }).waitFor({ timeout: 60000 });
    await novaCompra('300,00');
    for (const [nome, preco, qtd] of [
      ['Arroz 5 kg', '27,49', 1], ['Café 500 g', '21,90', 2], ['Leite integral 1 L', '5,29', 6],
      ['Peito de frango 1 kg', '18,40', 1], ['Açúcar 1 kg', '4,99', 1], ['Óleo de soja 900 ml', '8,49', 1],
      ['Macarrão 500 g', '4,49', 3], ['Papel higiênico 12 un', '24,90', 1], ['Sabão em pó 1,6 kg', '19,90', 1],
      ['Queijo mussarela 500 g', '27,90', 1], ['Refrigerante 2 L', '8,99', 2],
    ]) await adicionar(nome, preco, qtd);
    await page.goto(`${APP}/purchases`);
    await page.getByText('Arroz 5 kg').first().waitFor({ timeout: 25000 });
    await definirMercado('Supermercado Central');
    await encerrarCompra();
    await quando(new Date());
  });

  // ---- Compra atual: é a que aparece nas telas principais
  await passo('compra-atual', async () => {
    await novaCompra('170,00');
    for (const [nome, preco, qtd] of [
      ['Arroz 5 kg', '28,90', 1], ['Café 500 g', '22,90', 2], ['Leite integral 1 L', '5,49', 6],
      ['Peito de frango 1 kg', '16,90', 1], ['Açúcar 1 kg', '4,79', 1], ['Detergente 500 ml', '3,29', 3],
    ]) await adicionar(nome, preco, qtd);
    await page.goto(`${APP}/purchases`);
    await page.getByText('Arroz 5 kg').first().waitFor({ timeout: 25000 });
    await definirMercado('Supermercado Central');
  });

  await passo('inicio', async () => {
    await page.goto(`${APP}/`);
    await page.getByText('COMPRA EM ANDAMENTO').waitFor({ timeout: 20000 });
    await tela('inicio');
  });

  await passo('carrinho', async () => {
    await page.goto(`${APP}/purchases`);
    await page.getByText('Arroz 5 kg').first().waitFor({ timeout: 20000 });
    await tela('carrinho');
  });

  // ---- Conferência: o café foi cobrado a R$ 24,90 em vez dos R$ 22,90 da gôndola
  await passo('cupom', async () => {
    await page.goto(`${APP}/`);
    await click('Conferir a nota desta compra');
    await page.getByText('Digitar os itens manualmente').waitFor({ timeout: 20000 });
    await click('Digitar os itens manualmente');
    await page.getByText('Produtos na nota').waitFor({ timeout: 20000 });
    await linhaDoCupom('ARROZ 5KG', '1', '28,90', '28,90');
    await linhaDoCupom('CAFE 500G', '2', '24,90', '49,80');
    await linhaDoCupom('LEITE INTEGRAL 1L', '6', '5,49', '32,94');
    await linhaDoCupom('PEITO FRANGO KG', '1', '16,90', '16,90');
    await linhaDoCupom('ACUCAR 1KG', '1', '4,79', '4,79');
    await linhaDoCupom('DETERGENTE 500ML', '3', '3,29', '9,87');
    await page.getByLabel('Editar dados do cupom', { exact: true }).first().click();
    await page.getByText('Dados do cupom').waitFor({ timeout: 10000 });
    await fill('Estabelecimento', 'Supermercado Central');
    await fill('Total da nota (valor a pagar)', '143,20');
    await click('Salvar');
    await page.waitForTimeout(600);
    await rolar(0);
    await tela('cupom');
  });

  await passo('conferencia', async () => {
    await click('Conferir agora');
    await page.getByText('Resultado da conferência').waitFor({ timeout: 25000 });
    await tela('conferencia');
    await rolar(640);
    await tela('conferencia-detalhe');
    await click('Concluir');
    await page.waitForTimeout(1800);
  });

  // ---- Terceira compra, em outro mercado e com desconto (alimenta economia e comparação)
  await passo('outro-mercado', async () => {
    await novaCompra('120,00');
    await adicionar('Café 500 g', '19,90', 2, '9,95');
    await adicionar('Arroz 5 kg', '26,49', 1);
    await adicionar('Leite integral 1 L', '4,99', 6);
    await page.goto(`${APP}/purchases`);
    await page.getByText('Café 500 g').first().waitFor({ timeout: 25000 });
    await definirMercado('Mercado do Bairro');
    await encerrarCompra();
  });

  await passo('historico', async () => {
    await page.goto(`${APP}/purchases?view=history`);
    await page.getByText('Mercado do Bairro').first().waitFor({ timeout: 25000 });
    await tela('historico');
  });

  await passo('resumo', async () => {
    await page.goto(`${APP}/purchases?view=summary`);
    await page.getByText('TOTAL GASTO NO MÊS').waitFor({ timeout: 25000 });
    await page.waitForTimeout(1500);
    await tela('resumo');
    await rolar(1000);
    await tela('resumo-graficos');
  });

  await passo('precos', async () => {
    await page.goto(`${APP}/prices`);
    await page.getByText('Café 500 g').first().waitFor({ timeout: 25000 });
    await page.getByText('Café 500 g').first().click();
    await page.waitForTimeout(2500);
    await tela('precos');
  });

  // ---- Leitura por IA (precisa de sessão: o fake-supabase não faz login anônimo)
  await passo('foto-ia', async () => {
    const anterior = page;
    page = await nova();
    await page.goto(`${APP}/auth`);
    await page.getByLabel('E-mail', { exact: true }).fill('alice@teste.local');
    await page.getByLabel('Senha', { exact: true }).fill('senha-teste-1');
    await page.getByText('Entrar', { exact: true }).last().click();
    await page.waitForTimeout(2500);
    await page.goto(`${APP}/`);
    await click('Nova compra');
    await page.getByText('Quanto pretende gastar?').waitFor({ timeout: 15000 });
    await click('Começar sem orçamento');
    await page.waitForTimeout(900);
    await page.goto(`${APP}/capture`);
    await page.getByText('Para uma boa leitura').waitFor({ timeout: 25000 });
    const chooser = page.waitForEvent('filechooser');
    await click('Galeria');
    await (await chooser).setFiles(ETIQUETA);
    await page.getByText('Identificar produto e preço').waitFor({ timeout: 10000 });
    await click('Identificar produto e preço');
    const consentir = page.getByText('Concordo, ler a imagem', { exact: true });
    if (await consentir.count()) await consentir.last().click();
    await page.getByText('Dados lidos da foto — confira antes de salvar').waitFor({ timeout: 40000 });
    await tela('foto-ia');
    await rolar(560);
    await tela('foto-ia-preco');
    await anterior.close().catch(() => {});
  });

  console.log('\nTelas:', feitas.join(', '));
  if (falhas.length) console.log('Falhas:\n' + falhas.join('\n'));
} finally {
  await browser.close();
  site.close();
  api.kill();
}
