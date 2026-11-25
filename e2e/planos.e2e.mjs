// Teste de ponta a ponta da tela de planos: app web real (dist/) + fake-supabase (PostgreSQL real).
// Os endereços, senhas e identificadores de Stripe abaixo são FICTÍCIOS e só existem neste teste.
// Nenhum pagamento é feito: o que se verifica é o que a tela mostra a partir do estado do banco.
//
//   node e2e/fake-supabase.mjs 8091 &
//   (servir dist/ em http://localhost:8090/confereai/)
//   node e2e/planos.e2e.mjs <pasta-para-capturas>
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
const email = `planos.${Date.now()}@auto.local`;
const SENHA = 'Compra2026!';

async function contexto() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => erros.push(`pageerror: ${e.message.slice(0, 160)}`));
  return { ctx, page };
}
const clicar = async (page, texto) => {
  await page.getByText(texto, { exact: true }).last().click();
  await page.waitForTimeout(900);
};

/** Cria a conta pela própria tela e devolve o contexto já conectado. */
async function entrar() {
  const { ctx, page } = await contexto();
  await page.goto(`${APP}/auth/criar-conta`);
  await page.waitForTimeout(2500);
  await page.getByLabel('Nome completo', { exact: true }).fill('Quem Assina');
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(SENHA);
  await page.getByLabel('Confirmar senha', { exact: true }).fill(SENHA);
  await page.getByLabel('Li e aceito a política de privacidade').click();
  await clicar(page, 'Criar minha conta');
  await page.waitForTimeout(2500);
  return { ctx, page };
}

/**
 * Id de quem está conectado, lido da sessão guardada pelo navegador — o fake-supabase não
 * guarda e-mail na tabela de usuários.
 */
const idDoUsuario = async () => {
  const id = await page.evaluate(() => {
    for (const chave of Object.keys(localStorage)) {
      if (!chave.startsWith('sb-')) continue;
      try {
        const v = JSON.parse(localStorage.getItem(chave));
        if (v && v.user && v.user.id) return v.user.id;
      } catch {
        // chave que não é sessão
      }
    }
    return null;
  });
  if (!id) throw new Error('não encontrei a sessão no navegador');
  return id;
};

/**
 * Grava leituras já feitas, como o servidor faria. O gatilho `set_owner` exige sessão e crava
 * o dono, então a sessão é declarada no mesmo comando — é isso que o PostgREST faz a cada chamada.
 */
const registrarLeituras = (uid, kind, quantas) =>
  sql(
    `with eu as (select set_config('request.jwt.claim.sub', $1, true))
     insert into public.ocr_usage (kind, images, provider)
     select $2, 1, 'teste' from eu, generate_series(1, $3)`,
    [uid, kind, quantas],
  );

/** Abre /planos numa página já conectada. */
async function planos(page) {
  await page.goto(`${APP}/planos`);
  await page.waitForTimeout(2500);
  return page.locator('body').innerText();
}

const { ctx, page } = await entrar();

await step('quem não assinou vê o plano grátis e a cota do mês zerada', async () => {
  const texto = await planos(page);
  assert.match(texto, /Seu plano/);
  assert.match(texto, /Grátis/);
  assert.match(texto, /Você está no plano grátis/);
  assert.match(texto, /0 de 20 fotos usadas neste mês/);
  assert.match(texto, /0 de 4 leituras usadas neste mês/);
  writeFileSync(join(OUT, 'planos-1-gratis.png'), await page.screenshot({ fullPage: true }));
});

await step('a cota mostra o que já foi lido neste mês, por tipo', async () => {
  const uid = await idDoUsuario();
  await registrarLeituras(uid, 'label', 4);
  await registrarLeituras(uid, 'product', 1);
  await registrarLeituras(uid, 'receipt', 1);
  const texto = await planos(page);
  // Foto de produto conta junto com etiqueta: 4 + 1.
  assert.match(texto, /5 de 20 fotos usadas neste mês/);
  assert.match(texto, /1 de 4 leituras usadas neste mês/);
});

await step('cota esgotada aparece como esgotada, sem esconder o número', async () => {
  const uid = await idDoUsuario();
  await registrarLeituras(uid, 'receipt', 5);
  const texto = await planos(page);
  assert.match(texto, /As 4 leituras deste mês acabaram/);
  writeFileSync(join(OUT, 'planos-2-cota-esgotada.png'), await page.screenshot({ fullPage: true }));
});

await step('o botão de assinar oferece mensal e anual com os preços certos', async () => {
  const texto = await planos(page);
  assert.match(texto, /R\$ 9,90\/mês/);
  assert.match(texto, /R\$ 89\/ano/);
  assert.match(texto, /Assinar por R\$ 9,90\/mês/);
  await clicar(page, 'R$ 89/ano');
  const depois = await page.locator('body').innerText();
  assert.match(depois, /Assinar por R\$ 89\/ano/);
  assert.match(depois, /Economia de/);
});

await step('o plano IA fica fora da vitrine enquanto o assistente não funciona', async () => {
  const texto = await planos(page);
  assert.ok(!texto.includes('Meu Carrin IA'), 'o plano IA não aparece na tela de planos');
  assert.ok(!/19,90|179/.test(texto), 'nenhum preço do plano IA aparece');
  assert.ok(!texto.includes('Assinar por R$ 19,90/mês'), 'não se vende o que ainda não funciona');
  assert.match(texto, /Meu Carrin Mais/);
});

await step('o assistente avisa que faz parte do plano IA, sem deixar a pessoa na mão', async () => {
  await page.goto(`${APP}/assistente`);
  await page.waitForTimeout(2500);
  const texto = await page.locator('body').innerText();
  assert.match(texto, /Fale o que você precisa/);
  assert.match(texto, /o preço você confere na etiqueta/);
  writeFileSync(join(OUT, 'planos-4-assistente.png'), await page.screenshot({ fullPage: true }));
});

await step('assinatura ativa no banco vira plano Mais na tela, com cota única', async () => {
  const uid = await idDoUsuario();
  await sql(
    `insert into public.subscriptions (user_id, stripe_customer_id, stripe_subscription_id, plan, status, price_lookup_key, current_period_end)
     values ($1::uuid, 'cus_ficticio', 'sub_ficticio', 'mais', 'active', 'mais_mensal', now() + interval '30 days')
     on conflict (user_id) do update set status = 'active', plan = 'mais'`, [uid],
  );
  const texto = await planos(page);
  assert.match(texto, /Meu Carrin Mais/);
  assert.match(texto, /Renova em \d{2}\/\d{2}\/\d{4}/);
  assert.match(texto, /Gerenciar assinatura/);
  // As 11 leituras do mês passam a contar numa cota só de 300.
  assert.match(texto, /11 de 300 fotos usadas neste mês/);
  assert.ok(!texto.includes('Assinar por'), 'quem já assina não deveria ver botão de assinar');
  writeFileSync(join(OUT, 'planos-3-assinante.png'), await page.screenshot({ fullPage: true }));
});

await step('cancelamento agendado avisa até quando o plano vale', async () => {
  const uid = await idDoUsuario();
  await sql('update public.subscriptions set cancel_at_period_end = true where user_id = $1::uuid', [uid]);
  const texto = await planos(page);
  assert.match(texto, /Ativo até \d{2}\/\d{2}\/\d{4}\. Não renova\./);
});

await step('cobrança atrasada pede para atualizar o cartão, sem cortar o plano', async () => {
  const uid = await idDoUsuario();
  await sql(`update public.subscriptions set status = 'past_due', cancel_at_period_end = false where user_id = $1::uuid`, [uid]);
  const texto = await planos(page);
  assert.match(texto, /A última cobrança não passou/);
  assert.match(texto, /Meu Carrin Mais/);
});

await step('assinatura cancelada devolve a pessoa ao plano grátis', async () => {
  const uid = await idDoUsuario();
  await sql(`update public.subscriptions set status = 'canceled' where user_id = $1::uuid`, [uid]);
  const texto = await planos(page);
  assert.match(texto, /Assinatura encerrada/);
  assert.match(texto, /As 4 leituras deste mês acabaram/); // volta ao limite do grátis
});

await step('medição do funil: a tela de planos é contada', async () => {
  const [{ n }] = await sql("select count(*)::int n from public.analytics_events where event = 'pricing_viewed' and source = 'app'");
  assert.ok(n > 0, 'pricing_viewed não foi registrado');
});

await step('o perfil leva à tela de planos', async () => {
  await page.goto(`${APP}/profile`);
  await page.waitForTimeout(2000);
  await clicar(page, 'Meu plano e cota do mês');
  await page.waitForTimeout(1500);
  assert.match(await page.locator('body').innerText(), /Seu plano/);
});

await ctx.close();
await browser.close();
for (const e of [...new Set(erros)]) results.push(`FAIL erro de página: ${e}`);
console.log(results.join('\n'));
process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
