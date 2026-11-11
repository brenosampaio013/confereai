/**
 * Orçamento da compra. Tudo em centavos inteiros; as comparações de percentual usam
 * multiplicação de inteiros (sem ponto flutuante) para não errar exatamente nos limites.
 */
import { Cents, formatBRL } from './money';

export interface BudgetThresholds {
  /** Percentual do aviso de atenção (padrão 75). */
  attention: number;
  /** Percentual do alerta de proximidade do limite (padrão 85). */
  near: number;
}

export const DEFAULT_THRESHOLDS: BudgetThresholds = { attention: 75, near: 85 };

export type BudgetLevel = 'ok' | 'attention' | 'near' | 'reached' | 'over';

const RANK: Record<BudgetLevel, number> = { ok: 0, attention: 1, near: 2, reached: 3, over: 4 };

export interface BudgetStatus {
  budgetCents: Cents;
  spentCents: Cents;
  /** Saldo disponível (nunca negativo). */
  remainingCents: Cents;
  /** Quanto passou do orçamento (0 quando dentro). */
  overCents: Cents;
  /** Percentual utilizado, arredondado para baixo (pode passar de 100). */
  usedPercent: number;
  level: BudgetLevel;
}

export function isValidBudget(cents: Cents | null | undefined): cents is Cents {
  return typeof cents === 'number' && Number.isInteger(cents) && cents > 0;
}

/** Valida os limites configuráveis: inteiros, 1–99, atenção menor que proximidade. */
export function validateThresholds(t: BudgetThresholds): string | null {
  for (const v of [t.attention, t.near]) {
    if (!Number.isInteger(v) || v < 1 || v > 99) return 'Use percentuais inteiros entre 1 e 99.';
  }
  if (t.attention >= t.near) return 'O aviso de atenção deve vir antes do alerta de limite próximo.';
  return null;
}

export function parseThresholds(stored: string | null | undefined): BudgetThresholds {
  if (!stored) return DEFAULT_THRESHOLDS;
  const [a, n] = stored.split(',').map((s) => Number(s));
  const t = { attention: a, near: n };
  return validateThresholds(t) ? DEFAULT_THRESHOLDS : t;
}

export const serializeThresholds = (t: BudgetThresholds) => `${t.attention},${t.near}`;

export function budgetStatus(budgetCents: Cents, spentCents: Cents, thresholds: BudgetThresholds = DEFAULT_THRESHOLDS): BudgetStatus {
  if (!isValidBudget(budgetCents)) throw new Error('Orçamento inválido');
  const spent = Math.max(0, spentCents);
  let level: BudgetLevel = 'ok';
  if (spent > budgetCents) level = 'over';
  else if (spent === budgetCents) level = 'reached';
  else if (spent * 100 >= budgetCents * thresholds.near) level = 'near';
  else if (spent * 100 >= budgetCents * thresholds.attention) level = 'attention';
  return {
    budgetCents,
    spentCents: spent,
    remainingCents: Math.max(0, budgetCents - spent),
    overCents: Math.max(0, spent - budgetCents),
    usedPercent: Math.floor((spent * 100) / budgetCents),
    level,
  };
}

/**
 * Alerta ao mudar o total: devolve o novo estado somente quando a compra SUBIU de faixa
 * (ex.: de "ok" para "atenção"), ou quando já estava acima do orçamento e o excesso aumentou.
 * Remover itens ou diminuir quantidades nunca dispara alerta.
 */
export function budgetAlertOnChange(
  prevSpentCents: Cents,
  nextSpentCents: Cents,
  budgetCents: Cents,
  thresholds: BudgetThresholds = DEFAULT_THRESHOLDS,
): BudgetStatus | null {
  if (!isValidBudget(budgetCents) || nextSpentCents <= prevSpentCents) return null;
  const prev = budgetStatus(budgetCents, prevSpentCents, thresholds);
  const next = budgetStatus(budgetCents, nextSpentCents, thresholds);
  if (RANK[next.level] > RANK[prev.level]) return next;
  if (next.level === 'over' && next.overCents > prev.overCents) return next;
  return null;
}

export const BUDGET_TITLE: Record<BudgetLevel, string> = {
  ok: 'Dentro do orçamento',
  attention: 'Atenção ao orçamento',
  near: 'Chegando perto do limite',
  reached: 'Orçamento atingido',
  over: 'Orçamento ultrapassado',
};

export function budgetMessage(s: BudgetStatus): string {
  const spent = formatBRL(s.spentCents);
  const budget = formatBRL(s.budgetCents);
  switch (s.level) {
    case 'over':
      return `Você já gastou ${spent}, e o orçamento era de ${budget}. Passou ${formatBRL(s.overCents)} do limite.`;
    case 'reached':
      return `Você atingiu exatamente os ${budget} disponíveis. Qualquer novo item ultrapassa o orçamento.`;
    case 'near':
      return `Você já gastou ${spent} dos ${budget} disponíveis. Restam apenas ${formatBRL(s.remainingCents)}. Cuidado para não ultrapassar seu orçamento!`;
    case 'attention':
      return `Você já gastou ${spent} dos ${budget} disponíveis (${s.usedPercent}%). Restam ${formatBRL(s.remainingCents)}.`;
    default:
      return `Você gastou ${spent} dos ${budget} disponíveis. Restam ${formatBRL(s.remainingCents)}.`;
  }
}
