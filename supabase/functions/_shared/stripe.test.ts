// Testes das peças da assinatura que não dependem de rede nem de banco.
// Rodar: deno test --allow-import supabase/functions/_shared/stripe.test.ts
//
// O mais importante aqui é o primeiro: provar que a verificação da assinatura do webhook
// funciona neste runtime. Se ela falhasse abrindo passagem, qualquer POST liberaria o plano pago.
import { assertEquals, assertRejects } from 'jsr:@std/assert@1.0.14';
import Stripe from 'npm:stripe@23.2.0';
import { escolherAssinatura, eventoDoFunil, fimDoPeriodo, idDaAssinatura, planoDoPreco, precoDaAssinatura } from './stripe.ts';

const SEGREDO = 'whsec_teste_apenas_para_este_arquivo';
const stripe = new Stripe('sk_test_naoUsada', { httpClient: Stripe.createFetchHttpClient() });
const cripto = Stripe.createSubtleCryptoProvider();

/** Assina um corpo como a Stripe assina, para o teste não depender de rede. */
async function assinar(corpo: string, segredo = SEGREDO, agora = Math.floor(Date.now() / 1000)) {
  const chave = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const bytes = await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(`${agora}.${corpo}`));
  const hex = Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `t=${agora},v1=${hex}`;
}

const corpoDoEvento = JSON.stringify({
  id: 'evt_teste',
  type: 'customer.subscription.updated',
  data: { object: { id: 'sub_teste', object: 'subscription' } },
});

Deno.test('aviso com assinatura correta é aceito', async () => {
  const evento = await stripe.webhooks.constructEventAsync(
    corpoDoEvento, await assinar(corpoDoEvento), SEGREDO, undefined, cripto,
  );
  assertEquals(evento.type, 'customer.subscription.updated');
});

Deno.test('aviso com assinatura de outro segredo é recusado', async () => {
  const falsa = await assinar(corpoDoEvento, 'whsec_de_um_impostor');
  await assertRejects(
    () => stripe.webhooks.constructEventAsync(corpoDoEvento, falsa, SEGREDO, undefined, cripto),
    Error,
  );
});

Deno.test('corpo alterado depois de assinado é recusado', async () => {
  const assinatura = await assinar(corpoDoEvento);
  const adulterado = corpoDoEvento.replace('sub_teste', 'sub_de_outra_pessoa');
  await assertRejects(
    () => stripe.webhooks.constructEventAsync(adulterado, assinatura, SEGREDO, undefined, cripto),
    Error,
  );
});

Deno.test('aviso antigo é recusado pela tolerância de tempo', async () => {
  const velho = Math.floor(Date.now() / 1000) - 3600;
  const assinatura = await assinar(corpoDoEvento, SEGREDO, velho);
  await assertRejects(
    () => stripe.webhooks.constructEventAsync(corpoDoEvento, assinatura, SEGREDO, 300, cripto),
    Error,
  );
});

Deno.test('o id da assinatura é achado em cada forma de aviso', () => {
  const evento = (type: string, object: unknown) => ({ type, data: { object } } as unknown as Stripe.Event);
  assertEquals(idDaAssinatura(evento('customer.subscription.deleted', { id: 'sub_1' })), 'sub_1');
  assertEquals(idDaAssinatura(evento('checkout.session.completed', { subscription: 'sub_2' })), 'sub_2');
  assertEquals(idDaAssinatura(evento('checkout.session.completed', { subscription: { id: 'sub_3' } })), 'sub_3');
  // Nas versões novas da API a fatura aponta a assinatura dentro de "parent".
  assertEquals(
    idDaAssinatura(evento('invoice.paid', { parent: { subscription_details: { subscription: 'sub_4' } } })),
    'sub_4',
  );
  assertEquals(idDaAssinatura(evento('invoice.paid', {})), null);
});

Deno.test('o fim do período é lido no item ou no objeto, conforme a versão da API', () => {
  const noItem = { items: { data: [{ current_period_end: 1800000000 }] } } as unknown as Stripe.Subscription;
  assertEquals(fimDoPeriodo(noItem), new Date(1800000000 * 1000).toISOString());
  const noObjeto = { current_period_end: 1700000000, items: { data: [{}] } } as unknown as Stripe.Subscription;
  assertEquals(fimDoPeriodo(noObjeto), new Date(1700000000 * 1000).toISOString());
  assertEquals(fimDoPeriodo({ items: { data: [] } } as unknown as Stripe.Subscription), null);
});

Deno.test('o plano vem da chave de busca do preço, e preço estranho não vira plano', () => {
  assertEquals(planoDoPreco('mais_mensal'), 'mais');
  assertEquals(planoDoPreco('mais_anual'), 'mais');
  assertEquals(planoDoPreco('familia_mensal'), null);
  assertEquals(planoDoPreco(null), null);
  assertEquals(planoDoPreco(''), null);
  const assinatura = { items: { data: [{ price: { lookup_key: 'mais_anual' } }] } } as unknown as Stripe.Subscription;
  assertEquals(precoDaAssinatura(assinatura), 'mais_anual');
});

// ---- Medição do funil: o que o webhook conta (decisão 5 da reformulação 2.0)

Deno.test('assinatura ativa conta como concluída, com plano e período, uma vez por assinatura', async () => {
  const a = await eventoDoFunil('sub_123', 'active', 'mais_anual');
  const b = await eventoDoFunil('sub_123', 'active', 'mais_anual');
  assertEquals(a?.event, 'subscription_completed');
  assertEquals(a?.props, { plano: 'mais', periodo: 'anual' });
  assertEquals(a?.ref, b?.ref);
  assertEquals(a?.ref.startsWith('concluida:'), true);
});

Deno.test('a referência não guarda o identificador da Stripe', async () => {
  const e = await eventoDoFunil('sub_123', 'active', 'mais_mensal');
  assertEquals(e?.ref.includes('sub_123'), false);
  assertEquals(e?.ref.length, 'concluida:'.length + 64);
});

Deno.test('assinatura cancelada conta como cancelada, separada da concluída', async () => {
  const c = await eventoDoFunil('sub_123', 'canceled', 'mais_mensal');
  const a = await eventoDoFunil('sub_123', 'active', 'mais_mensal');
  assertEquals(c?.event, 'subscription_canceled');
  assertEquals(c?.ref === a?.ref, false);
});

Deno.test('estados de passagem não contam nada', async () => {
  for (const status of ['incomplete', 'incomplete_expired', 'past_due', 'unpaid', 'paused'] as const) {
    assertEquals(await eventoDoFunil('sub_123', status, 'mais_mensal'), null);
  }
});

Deno.test('trial também conta como concluída', async () => {
  assertEquals((await eventoDoFunil('sub_9', 'trialing', 'mais_mensal'))?.event, 'subscription_completed');
});

// ---- Qual assinatura o espelho segue quando a pessoa tem mais de uma (defeito provado na etapa 6)

const sub = (id: string, status: Stripe.Subscription.Status, created: number) => ({ id, status, created });

Deno.test('cancelar uma de duas assinaturas: o espelho segue a que continua ativa', () => {
  const escolhida = escolherAssinatura([sub('velha', 'canceled', 200), sub('nova', 'active', 100)]);
  assertEquals(escolhida?.id, 'nova');
});

Deno.test('ativa vence atraso, atraso vence incompleta, e entre iguais vale a mais recente', () => {
  assertEquals(escolherAssinatura([sub('a', 'past_due', 1), sub('b', 'active', 0)])?.id, 'b');
  assertEquals(escolherAssinatura([sub('a', 'incomplete', 9), sub('b', 'past_due', 1)])?.id, 'b');
  assertEquals(escolherAssinatura([sub('a', 'active', 1), sub('b', 'active', 5)])?.id, 'b');
  assertEquals(escolherAssinatura([sub('a', 'canceled', 1), sub('b', 'canceled', 5)])?.id, 'b');
});

Deno.test('sem nenhuma assinatura não há o que escolher', () => {
  assertEquals(escolherAssinatura([]), null);
});
