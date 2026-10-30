/**
 * Valores monetários são sempre inteiros em centavos.
 * Nenhuma operação financeira usa ponto flutuante: conversões de texto são feitas
 * por manipulação de string e multiplicações usam aritmética inteira.
 */

export type Cents = number;

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function assertCents(value: number): Cents {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`Valor monetário inválido (esperado inteiro em centavos): ${value}`);
  }
  return value;
}

/** Formata centavos como "R$ 1.234,56". */
export function formatBRL(cents: Cents): string {
  assertCents(cents);
  // Divisão por 100 apenas para exibição; o Intl arredonda para 2 casas e o valor é exato.
  return BRL.format(cents / 100).replace(/ /g, ' ');
}

/** Formata com sinal explícito: "+ R$ 2,00" / "− R$ 0,80". */
export function formatSignedBRL(cents: Cents): string {
  if (cents === 0) return formatBRL(0);
  return `${cents > 0 ? '+' : '−'} ${formatBRL(Math.abs(cents))}`;
}

/**
 * Converte texto digitado ou lido por OCR em centavos.
 * Aceita "5,49", "R$ 5,49", "1.234,56", "1234.56", "5", "-2,00", "2,00-".
 * Retorna null quando o texto não representa um valor monetário inequívoco.
 */
export function parseBRL(input: string): Cents | null {
  if (input == null) return null;
  let s = String(input).trim().replace(/\s+/g, '').replace(/^R\$/i, '');
  if (!s) return null;
  let negative = false;
  if (s.startsWith('-') || s.startsWith('−')) {
    negative = true;
    s = s.slice(1);
  } else if (s.endsWith('-')) {
    negative = true;
    s = s.slice(0, -1);
  }
  s = s.replace(/^R\$/i, '');
  if (!/^[\d.,]+$/.test(s)) return null;

  let intPart: string;
  let fracPart = '';
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    // O separador que aparece por último é o decimal.
    const decIdx = Math.max(lastComma, lastDot);
    const thousandSep = decIdx === lastComma ? '.' : ',';
    intPart = s.slice(0, decIdx).split(thousandSep).join('');
    fracPart = s.slice(decIdx + 1);
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? ',' : '.';
    const parts = s.split(sep);
    if (parts.length > 2) {
      // "1.234.567" → separador de milhar
      if (parts.slice(1).every((p) => p.length === 3)) {
        intPart = parts.join('');
      } else {
        return null;
      }
    } else if (sep === '.' && parts[1].length === 3) {
      // "1.234" em pt-BR é milhar
      intPart = parts.join('');
    } else {
      intPart = parts[0];
      fracPart = parts[1];
    }
  } else {
    intPart = s;
  }
  if (!/^\d*$/.test(intPart) || !/^\d*$/.test(fracPart)) return null;
  if (fracPart.length > 2) return null;
  if (!intPart && !fracPart) return null;
  const cents = Number(intPart || '0') * 100 + Number((fracPart + '00').slice(0, 2));
  if (!Number.isSafeInteger(cents)) return null;
  return negative ? -cents : cents;
}

/** Converte centavos para texto editável "5,49". */
export function centsToInput(cents: Cents): string {
  const abs = Math.abs(cents);
  const s = `${Math.trunc(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
  return cents < 0 ? `-${s}` : s;
}

/**
 * Divisão inteira com arredondamento "meio para cima" (half-up) para valores não negativos
 * e simétrico para negativos. Usada para preço × quantidade fracionária.
 */
export function divRoundHalfUp(numerator: number, denominator: number): number {
  if (denominator <= 0) throw new Error('Denominador deve ser positivo');
  const sign = numerator < 0 ? -1 : 1;
  const n = Math.abs(numerator);
  const q = Math.floor(n / denominator);
  const r = n - q * denominator;
  return sign * (r * 2 >= denominator ? q + 1 : q);
}

/** Divisão inteira com truncamento (alguns PDVs truncam em vez de arredondar). */
export function divTruncate(numerator: number, denominator: number): number {
  if (denominator <= 0) throw new Error('Denominador deve ser positivo');
  return Math.trunc(numerator / denominator);
}

export function sumCents(values: readonly Cents[]): Cents {
  let total = 0;
  for (const v of values) total += assertCents(v);
  return total;
}
