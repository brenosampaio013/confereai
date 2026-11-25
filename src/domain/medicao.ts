/**
 * Medição do funil (decisão 5 da reformulação 2.0): só contagem de eventos, sem dado pessoal.
 *
 * As mesmas regras da função `registrar_evento` no banco, para o app não enviar o que seria
 * recusado: uma lista fechada de eventos e de dados, com valores que são palavras curtas em
 * minúsculas. Os eventos de assinatura (concluída, cancelada) não estão aqui: só o webhook da
 * Stripe registra esses.
 */
export const EVENTOS_DO_APP = [
  'app_first_use',
  'signup_started',
  'signup_completed',
  'pricing_viewed',
  'checkout_started',
  'free_limit_reached',
  'upgrade_clicked',
] as const;
export type EventoDoApp = (typeof EVENTOS_DO_APP)[number];

export interface DadosDoEvento {
  plano?: 'mais' | 'ia';
  periodo?: 'mensal' | 'anual';
  tipo?: 'etiqueta' | 'cupom' | 'produto' | 'voz';
  /** De onde veio o clique, em palavras do próprio código (ex.: "leitura_do_cupom"). */
  lugar?: string;
}

const VALIDOS: Record<keyof DadosDoEvento, (v: string) => boolean> = {
  plano: (v) => v === 'mais' || v === 'ia',
  periodo: (v) => v === 'mensal' || v === 'anual',
  tipo: (v) => ['etiqueta', 'cupom', 'produto', 'voz'].includes(v),
  lugar: (v) => /^[a-z0-9_-]{1,40}$/.test(v) && !/[0-9]{6,}/.test(v),
};

/** Mantém só os dados que o banco aceita; o resto é descartado sem perder o evento. */
export function dadosDoEvento(dados: DadosDoEvento): DadosDoEvento {
  const saida: Record<string, string> = {};
  for (const [chave, valor] of Object.entries(dados)) {
    const valido = VALIDOS[chave as keyof DadosDoEvento];
    if (valido && typeof valor === 'string' && valido(valor)) saida[chave] = valor;
  }
  return saida as DadosDoEvento;
}
