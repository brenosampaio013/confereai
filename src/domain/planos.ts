/**
 * Planos do Meu Carrin — o que a tela mostra e como o estado da cobrança é dito em português.
 *
 * Os limites NÃO moram aqui: eles vêm do banco (tabela `plan_limits`), para que app, servidor e
 * landing contem a mesma coisa e a cota possa mudar sem publicar aplicativo. O que mora aqui é
 * o texto e o preço anunciado.
 */
export type PlanoId = 'gratis' | 'mais' | 'ia';
export type PrecoId = 'mais_mensal' | 'mais_anual' | 'ia_mensal' | 'ia_anual';

/** Os mesmos nomes de situação que a Stripe usa, mais 'none' para quem nunca assinou. */
export type SituacaoCobranca =
  | 'none' | 'incomplete' | 'incomplete_expired' | 'trialing' | 'active'
  | 'past_due' | 'canceled' | 'unpaid' | 'paused';

export interface Balde {
  /** null significa sem limite. */
  limite: number | null;
  usado: number;
  resta: number | null;
}

export interface EstadoDoPlano {
  plano: PlanoId;
  status: SituacaoCobranca;
  renovaEm: string | null;
  cancelaNoFim: boolean;
  preco: PrecoId | null;
  etiqueta: Balde;
  cupom: Balde;
  /** Conversas com o assistente. Limite zero significa que o plano não o inclui. */
  voz: Balde;
  zeraEm: string | null;
}

export interface PlanoAnunciado {
  id: PlanoId;
  nome: string;
  chamada: string;
  /** Preço em centavos; null no plano grátis. */
  mensalCents: number | null;
  anualCents: number | null;
  itens: string[];
  /**
   * Se já dá para assinar. Um plano com `disponivel: false` não aparece na vitrine nem tem botão
   * de compra: não se vende o que o aplicativo ainda não entrega. Ligar só depois que o
   * recurso do plano estiver funcionando de verdade em produção.
   */
  disponivel: boolean;
}

export const PLANOS: PlanoAnunciado[] = [
  {
    id: 'gratis',
    nome: 'Grátis',
    chamada: 'Tudo que não depende de leitura automática, sem limite.',
    mensalCents: null,
    anualCents: null,
    disponivel: true,
    itens: [
      'Carrinho, orçamento e avisos sem limite',
      'Escaneamento de código de barras',
      'Histórico de preços, compras e resumo do mês',
      'Conferência do cupom digitado, sem limite',
      '20 fotos de etiqueta e 4 cupons lidos por mês',
    ],
  },
  {
    id: 'mais',
    nome: 'Meu Carrin Mais',
    chamada: 'Para quem usa a leitura por foto em toda compra.',
    mensalCents: 990,
    anualCents: 8900,
    disponivel: true,
    itens: [
      'Tudo do plano grátis',
      'Muito mais leituras automáticas por mês',
      'Apoia o desenvolvimento do aplicativo',
    ],
  },
  {
    id: 'ia',
    nome: 'Meu Carrin IA',
    chamada: 'Fale o que você precisa e o assistente monta o carrinho.',
    mensalCents: 1990,
    anualCents: 17900,
    // Fora da vitrine: o assistente depende das chaves de IA, que ainda não estão configuradas
    // em produção. O código fica pronto; ligar aqui quando funcionar de verdade.
    disponivel: false,
    itens: [
      'Tudo do Meu Carrin Mais',
      'Assistente de voz: você fala, ele sugere, você confirma',
      'O dobro das leituras automáticas por mês',
    ],
  },
];

/** Os planos pagos que existem no código (inclusive os que ainda não estão à venda). */
export const PLANOS_PAGOS = PLANOS.filter((p) => p.mensalCents !== null);

/**
 * O que a pessoa vê na tela de planos: só os planos à venda. Um plano com `disponivel: false`
 * fica fora da vitrine (decisão 4 da reformulação 2.0) até o recurso funcionar em produção.
 */
export const VITRINE = PLANOS.filter((p) => p.disponivel);

/** Os planos que se pode assinar agora, na ordem em que a tela os mostra. */
export const OFERTAS = VITRINE.filter((p) => p.mensalCents !== null);

/** A chave de busca do preço na Stripe: "<plano>_<periodo>". */
export const precoDe = (plano: PlanoId, periodo: 'mensal' | 'anual') => `${plano}_${periodo}` as PrecoId;

export const planoAnunciado = (id: PlanoId) => PLANOS.find((p) => p.id === id) ?? PLANOS[0];

/** Economia do anual em relação a doze meses, em centavos. */
export function economiaAnualCents(p: PlanoAnunciado): number | null {
  if (p.mensalCents === null || p.anualCents === null) return null;
  return p.mensalCents * 12 - p.anualCents;
}

const dia = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso)) : '';

/**
 * Uma frase sobre a cobrança, do ponto de vista de quem paga. Devolve também o tom, para a
 * tela avisar em amarelo quando há algo a fazer (cartão recusado, por exemplo).
 */
export function descreveCobranca(e: EstadoDoPlano): { texto: string; tom: 'neutro' | 'atencao' } {
  const fim = dia(e.renovaEm);
  switch (e.status) {
    case 'active':
      if (e.cancelaNoFim) return { texto: fim ? `Ativo até ${fim}. Não renova.` : 'Ativo. Não renova.', tom: 'atencao' };
      return { texto: fim ? `Renova em ${fim}.` : 'Assinatura ativa.', tom: 'neutro' };
    case 'trialing':
      return { texto: fim ? `Período de teste até ${fim}.` : 'Período de teste.', tom: 'neutro' };
    case 'past_due':
      return { texto: 'A última cobrança não passou. Atualize o cartão para não perder o plano.', tom: 'atencao' };
    case 'unpaid':
      return { texto: 'Há uma cobrança em aberto. Atualize o pagamento para voltar ao plano.', tom: 'atencao' };
    case 'incomplete':
      return { texto: 'O pagamento começou e não foi concluído. Tente de novo.', tom: 'atencao' };
    case 'paused':
      return { texto: 'Assinatura pausada.', tom: 'atencao' };
    case 'canceled':
    case 'incomplete_expired':
      return { texto: 'Assinatura encerrada. Você está no plano grátis.', tom: 'neutro' };
    default:
      return { texto: 'Você está no plano grátis.', tom: 'neutro' };
  }
}

/** "12 de 20 usadas neste mês" — ou o aviso de que acabou. */
export function fraseDeUso(b: Balde, singular: string, plural: string): string {
  if (b.limite === null) return `${b.usado} ${b.usado === 1 ? singular : plural} neste mês, sem limite.`;
  if ((b.resta ?? 0) <= 0) return `As ${b.limite} ${plural} deste mês acabaram.`;
  return `${b.usado} de ${b.limite} ${plural} usadas neste mês.`;
}

/** Fração preenchida da barra de uso (0 a 1). Sem limite, a barra não aparece. */
export function fracaoUsada(b: Balde): number | null {
  if (b.limite === null || b.limite === 0) return null;
  return Math.min(b.usado / b.limite, 1);
}

/** Quando a cota volta, dito por extenso: "a cota volta em 01/12/2026". */
export const quandoZera = (e: EstadoDoPlano) => (e.zeraEm ? `A cota volta em ${dia(e.zeraEm)}.` : '');

const PRECOS_CONHECIDOS: PrecoId[] = ['mais_mensal', 'mais_anual', 'ia_mensal', 'ia_anual'];

/** Lê a resposta de public.my_plan(), sem confiar em campos ausentes. */
export function lerEstado(bruto: unknown): EstadoDoPlano | null {
  if (!bruto || typeof bruto !== 'object') return null;
  const o = bruto as Record<string, unknown>;
  const balde = (v: unknown): Balde => {
    const b = (v ?? {}) as Record<string, unknown>;
    const num = (x: unknown) => (typeof x === 'number' ? x : null);
    return { limite: num(b.limite), usado: num(b.usado) ?? 0, resta: num(b.resta) };
  };
  const plano: PlanoId = o.plano === 'mais' || o.plano === 'ia' ? o.plano : 'gratis';
  return {
    plano,
    status: (typeof o.status === 'string' ? o.status : 'none') as SituacaoCobranca,
    renovaEm: typeof o.renova_em === 'string' ? o.renova_em : null,
    cancelaNoFim: o.cancela_no_fim === true,
    preco: PRECOS_CONHECIDOS.includes(o.preco as PrecoId) ? (o.preco as PrecoId) : null,
    etiqueta: balde(o.etiqueta),
    cupom: balde(o.cupom),
    voz: balde(o.voz),
    zeraEm: typeof o.zera_em === 'string' ? o.zera_em : null,
  };
}
