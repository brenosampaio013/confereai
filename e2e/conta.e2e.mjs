// Teste de ponta a ponta das telas de conta: app web real (dist/) + fake-supabase.
// Os endereços e as senhas abaixo são FICTÍCIOS e só existem dentro deste teste.
//
//   node e2e/fake-supabase.mjs 8091 &
//   (servir dist/ em http://localhost:8090/confereai/)
//   node e2e/conta.e2e.mjs <pasta-para-capturas>
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
  }
};

const browser = await chromium.launch();
const erros = [];

async function abrir(path = '/auth') {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => erros.push(`pageerror: ${e.message.slice(0, 160)}`));
  await page.goto(`${APP}${path}`);
  await page.waitForTimeout(2500);
  return { ctx, page };
}
const clicar = async (page, texto) => {
  await page.getByText(texto, { exact: true }).last().click();
  await page.waitForTimeout(900);
};
/** Chaves de sessão do Supabase guardadas em cada armazenamento do navegador. */
const guardadas = (page) =>
  page.evaluate(() => ({
    local: Object.keys(localStorage).filter((k) => k.startsWith('sb-')),
    sessao: Object.keys(sessionStorage).filter((k) => k.startsWith('sb-')),
  }));

await step('entrar com senha errada mostra o recado em português', async () => {
  const { ctx, page } = await abrir();
  await page.getByLabel('E-mail', { exact: true }).fill('alice@teste.local');
  await page.getByLabel('Senha', { exact: true }).fill('senha-que-nao-e');
  await clicar(page, 'Entrar');
  await page.waitForTimeout(1200);
  assert.match(await page.locator('body').innerText(), /E-mail ou senha incorretos/);
  writeFileSync(join(OUT, 'conta-erro-login.png'), await page.screenshot());
  await ctx.close();
});

await step('e-mail inválido é barrado antes de chamar o servidor', async () => {
  const { ctx, page } = await abrir();
  let chamou = false;
  page.on('request', (r) => r.url().includes('/auth/v1/token') && (chamou = true));
  await page.getByLabel('E-mail', { exact: true }).fill('maria@');
  await page.getByLabel('Senha', { exact: true }).fill('qualquer-senha');
  await clicar(page, 'Entrar');
  assert.match(await page.locator('body').innerText(), /Informe um e-mail válido/);
  assert.equal(chamou, false, 'não deveria chamar o servidor com e-mail inválido');
  await ctx.close();
});

await step('entrar com "manter conectado" guarda a sessão no aparelho', async () => {
  const { ctx, page } = await abrir();
  await page.getByLabel('E-mail', { exact: true }).fill('alice@teste.local');
  await page.getByLabel('Senha', { exact: true }).fill('senha-teste-1');
  await clicar(page, 'Entrar');
  await page.waitForTimeout(2000);
  const g = await guardadas(page);
  assert.ok(g.local.length > 0, 'a sessão deveria ficar no armazenamento duradouro');
  assert.equal(g.sessao.length, 0, 'não deveria haver cópia temporária');
  await ctx.close();
});

await step('sem "manter conectado" a sessão não fica no aparelho', async () => {
  const { ctx, page } = await abrir();
  await page.getByLabel('Manter conectado').click();
  await page.getByLabel('E-mail', { exact: true }).fill('bruno@teste.local');
  await page.getByLabel('Senha', { exact: true }).fill('senha-teste-2');
  await clicar(page, 'Entrar');
  await page.waitForTimeout(2000);
  const g = await guardadas(page);
  assert.equal(g.local.length, 0, 'a sessão NÃO deveria ficar no armazenamento duradouro');
  assert.ok(g.sessao.length > 0, 'a sessão deveria ficar só na aba');
  await ctx.close();
});

await step('criar conta leva à tela de confirmação e grava o usuário', async () => {
  const { ctx, page } = await abrir('/auth/criar-conta');
  const email = `teste.${Date.now()}@conta.local`;
  await page.getByLabel('Nome completo', { exact: true }).fill('Pessoa de Teste');
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page.getByLabel('Senha', { exact: true }).fill('Compra2026!');
  await page.getByLabel('Confirmar senha', { exact: true }).fill('Compra2026!');
  await page.getByLabel('Li e aceito a política de privacidade').click();
  await clicar(page, 'Criar minha conta');
  await page.waitForTimeout(2000);
  const texto = await page.locator('body').innerText();
  assert.match(texto, /Conta criada/);
  assert.ok(texto.includes(email), 'a tela deveria mostrar o e-mail usado');
  writeFileSync(join(OUT, 'conta-confirmar.png'), await page.screenshot());
  await ctx.close();
});

await step('cadastro recusa senhas diferentes e termos não aceitos', async () => {
  const { ctx, page } = await abrir('/auth/criar-conta');
  await page.getByLabel('Nome completo', { exact: true }).fill('Pessoa de Teste');
  await page.getByLabel('E-mail', { exact: true }).fill('outra.pessoa@conta.local');
  await page.getByLabel('Senha', { exact: true }).fill('Compra2026!');
  await page.getByLabel('Confirmar senha', { exact: true }).fill('Compra2027!');
  await clicar(page, 'Criar minha conta');
  const texto = await page.locator('body').innerText();
  assert.match(texto, /As duas senhas precisam ser iguais/);
  assert.match(texto, /aceite a política de privacidade/);
  await ctx.close();
});

await step('cadastro com e-mail já existente avisa para entrar', async () => {
  const { ctx, page } = await abrir('/auth/criar-conta');
  await page.getByLabel('Nome completo', { exact: true }).fill('Alice Teste');
  await page.getByLabel('E-mail', { exact: true }).fill('alice@teste.local');
  await page.getByLabel('Senha', { exact: true }).fill('Compra2026!');
  await page.getByLabel('Confirmar senha', { exact: true }).fill('Compra2026!');
  await page.getByLabel('Li e aceito a política de privacidade').click();
  await clicar(page, 'Criar minha conta');
  await page.waitForTimeout(1500);
  assert.match(await page.locator('body').innerText(), /já tem conta/);
  await ctx.close();
});

await step('cadastro sem confirmação de e-mail entra direto no aplicativo', async () => {
  const { ctx, page } = await abrir('/auth/criar-conta');
  const email = `direto.${Date.now()}@auto.local`;
  await page.getByLabel('Nome completo', { exact: true }).fill('Entra Direto');
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page.getByLabel('Senha', { exact: true }).fill('Compra2026!');
  await page.getByLabel('Confirmar senha', { exact: true }).fill('Compra2026!');
  await page.getByLabel('Li e aceito a política de privacidade').click();
  await clicar(page, 'Criar minha conta');
  await page.waitForTimeout(2500);
  assert.ok(!page.url().includes('/auth'), `deveria sair das telas de conta, está em ${page.url()}`);
  const linhas = await sql('select count(*)::int as n from auth.users');
  assert.ok(linhas[0].n >= 4, 'o usuário deveria existir no banco');
  await ctx.close();
});

await step('recuperação de senha confirma o envio sem revelar se a conta existe', async () => {
  const { ctx, page } = await abrir('/auth/recuperar');
  await page.getByLabel('E-mail', { exact: true }).fill('nao.existe@conta.local');
  await clicar(page, 'Enviar link');
  await page.waitForTimeout(1500);
  assert.match(await page.locator('body').innerText(), /Se houver uma conta com este e-mail/);
  writeFileSync(join(OUT, 'conta-recuperar.png'), await page.screenshot());
  await ctx.close();
});

await step('a senha pode ser mostrada e escondida', async () => {
  const { ctx, page } = await abrir();
  const campo = page.getByLabel('Senha', { exact: true });
  await campo.fill('minha-senha');
  assert.equal(await campo.getAttribute('type'), 'password', 'a senha deveria começar escondida');
  await page.getByLabel('Mostrar senha').click();
  // Ao mostrar, o react-native-web remove o atributo (campo de texto comum).
  assert.notEqual(await campo.getAttribute('type'), 'password', 'a senha deveria ficar visível');
  await page.getByLabel('Ocultar senha').click();
  assert.equal(await campo.getAttribute('type'), 'password', 'a senha deveria voltar a ficar escondida');
  await ctx.close();
});

await browser.close();
for (const e of [...new Set(erros)]) results.push(`FAIL erro de página: ${e}`);
console.log(results.join('\n'));
process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
