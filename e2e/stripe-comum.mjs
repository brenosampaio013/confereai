// Peças comuns aos roteiros da Stripe DE TESTE (e2e/stripe-cenarios.mjs).
import { createHmac } from 'node:crypto';

const API = 'https://api.stripe.com/v1';
const CHAVE = process.env.STRIPE_SECRET_KEY ?? 'sk_test_proxy_injected';
const SEGREDO = process.env.STRIPE_WEBHOOK_SECRET;
const WEBHOOK = process.env.WEBHOOK_URL ?? 'http://localhost:8000/';
const FAKE = process.env.FAKE_SUPABASE ?? 'http://localhost:8091';
if (!SEGREDO) throw new Error('defina STRIPE_WEBHOOK_SECRET com o mesmo valor dado à função');
if (CHAVE.startsWith('sk_live')) throw new Error('estes roteiros só rodam com a chave de TESTE da Stripe');

const resultados = [];
export async function passo(nome, fn) {
  try {
    await fn();
    resultados.push(`ok   ${nome}`);
  } catch (e) {
    resultados.push(`FAIL ${nome}: ${String(e.message).split('\n')[0]}`);
  }
}
export function relatorio() {
  console.log(resultados.join('\n'));
  process.exit(resultados.some((r) => r.startsWith('FAIL')) ? 1 : 0);
}

async function chamar(caminho, corpo, metodo) {
  const r = await fetch(`${API}${caminho}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${CHAVE}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: corpo ? new URLSearchParams(corpo).toString() : undefined,
  });
  const d = await r.json();
  if (d.error) throw new Error(`${caminho}: ${d.error.message}`);
  if (d.livemode === true) throw new Error('a Stripe respondeu em modo real: parando');
  return d;
}
export const Stripe = {
  get: (caminho) => chamar(caminho, null, 'GET'),
  post: (caminho, corpo) => chamar(caminho, corpo, 'POST'),
  del: (caminho) => chamar(caminho, null, 'DELETE'),
};

export const sql = async (texto) =>
  (await (await fetch(`${FAKE}/__debug/sql`, { method: 'POST', body: JSON.stringify({ sql: texto }) })).json());

/** Conta nova no fake-supabase. E-mail fictício, criado só para o teste. */
export async function novoUsuario(rotulo) {
  const email = `${rotulo}.${Date.now()}@auto.local`;
  const r = await (await fetch(`${FAKE}/auth/v1/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'Compra2026!' }),
  })).json();
  return { usuario: r.user.id, email, token: r.access_token };
}

/** Entrega um aviso real da Stripe à função, assinado como ela assina. */
export async function entregar(evento) {
  const corpo = JSON.stringify(evento);
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac('sha256', SEGREDO).update(`${t}.${corpo}`).digest('hex');
  const r = await fetch(WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'stripe-signature': `t=${t},v1=${v1}` },
    body: corpo,
  });
  return { status: r.status, corpo: await r.json().catch(() => null) };
}

/** O aviso real da Stripe para esta assinatura (ela leva alguns segundos para publicar). */
export async function ultimoEvento(tipo, assinaturaId, segundos = 30) {
  for (let espera = 0; espera < segundos; espera += 2) {
    const { data } = await Stripe.get(`/events?type=${tipo}&limit=50`);
    const e = data.find((x) => JSON.stringify(x.data.object).includes(assinaturaId));
    if (e) return e;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`a Stripe não publicou o aviso ${tipo} desta assinatura em ${segundos} s`);
}
