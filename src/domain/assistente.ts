/**
 * Assistente de voz — o que o servidor devolve vira sugestão conferível na tela.
 *
 * Nada aqui entra no carrinho sozinho: a função só arruma o que a IA entendeu para que a
 * pessoa confira e complete o preço, do mesmo jeito que faria depois de escanear um código.
 * O preço nunca vem da IA.
 */
import type { SaleUnit } from './units';

/** Formato devolvido pela Edge Function `assistente`. */
export interface ItemBruto {
  nome?: unknown;
  marca?: unknown;
  quantidade?: unknown;
  unidade?: unknown;
  observacao?: unknown;
}

export interface ItemSugerido {
  nome: string;
  marca: string | null;
  /** Quantidade na unidade de venda (3 unidades, 0,5 kg...). Nulo quando não foi dito. */
  quantidade: number | null;
  unidade: SaleUnit;
  /** O que foi dito e não cabe nos campos: "pacote de 500 g", "da marca que estiver barata". */
  observacao: string | null;
}

const texto = (v: unknown, max = 80): string | null => {
  if (typeof v !== 'string') return null;
  const limpo = v.trim().replace(/\s+/g, ' ');
  return limpo ? limpo.slice(0, max) : null;
};

/**
 * Converte a unidade falada para a unidade de venda do aplicativo. Grama e mililitro viram
 * quilo e litro, porque é assim que a balança do supermercado cobra; "três pacotes de 500 g"
 * chega como quantidade 3, unidade un, e o peso fica na observação.
 */
function converter(quantidade: number | null, unidade: string | null): { quantidade: number | null; unidade: SaleUnit } {
  switch (unidade) {
    case 'kg':
      return { quantidade, unidade: 'kg' };
    case 'g':
      return { quantidade: quantidade === null ? null : quantidade / 1000, unidade: 'kg' };
    case 'L':
    case 'l':
      return { quantidade, unidade: 'l' };
    case 'ml':
      return { quantidade: quantidade === null ? null : quantidade / 1000, unidade: 'l' };
    default:
      return { quantidade, unidade: 'un' };
  }
}

/** Lê um item devolvido pelo servidor. Devolve null quando não dá para confiar nele. */
export function lerItem(bruto: ItemBruto): ItemSugerido | null {
  const nome = texto(bruto.nome);
  if (!nome) return null;
  const n = typeof bruto.quantidade === 'number' && Number.isFinite(bruto.quantidade) ? bruto.quantidade : null;
  // Quantidade estranha (zero, negativa, absurda) é tratada como "não foi dita".
  const quantidadeDita = n !== null && n > 0 && n <= 100_000 ? n : null;
  const { quantidade, unidade } = converter(quantidadeDita, texto(bruto.unidade, 4));
  return {
    nome,
    marca: texto(bruto.marca, 40),
    quantidade: quantidade === null ? null : Math.round(quantidade * 1000) / 1000,
    unidade,
    observacao: texto(bruto.observacao, 120),
  };
}

/** Lê a lista inteira, descartando o que não dá para aproveitar. */
export function lerItens(brutos: unknown): ItemSugerido[] {
  if (!Array.isArray(brutos)) return [];
  return brutos.map((b) => lerItem((b ?? {}) as ItemBruto)).filter((i): i is ItemSugerido => i !== null).slice(0, 30);
}

/** Como o item aparece na linha da conferência: "2 kg · Arroz Tio João". */
export function descreverItem(item: ItemSugerido): string {
  const partes: string[] = [];
  if (item.quantidade !== null) {
    const q = item.unidade === 'un' ? String(item.quantidade) : item.quantidade.toLocaleString('pt-BR');
    partes.push(`${q} ${item.unidade === 'l' ? 'L' : item.unidade}`);
  }
  partes.push([item.nome, item.marca].filter(Boolean).join(' '));
  return partes.join(' · ');
}
