import { divRoundHalfUp, formatBRL, formatSignedBRL, parseBRL, centsToInput } from '../../src/domain/money';
import { lineSubtotal, parseQuantity, formatQuantity, acceptableSubtotals } from '../../src/domain/units';

describe('dinheiro em centavos', () => {
  it('converte textos em centavos sem ponto flutuante', () => {
    expect(parseBRL('5,49')).toBe(549);
    expect(parseBRL('R$ 1.234,56')).toBe(123456);
    expect(parseBRL('1234.56')).toBe(123456);
    expect(parseBRL('1.234')).toBe(123400);
    expect(parseBRL('7')).toBe(700);
    expect(parseBRL('0,1')).toBe(10);
    expect(parseBRL('-2,00')).toBe(-200);
    expect(parseBRL('2,00-')).toBe(-200);
    expect(parseBRL('abc')).toBeNull();
    expect(parseBRL('1,234')).toBeNull();
    expect(parseBRL('')).toBeNull();
  });

  it('evita o erro clássico 0,1 + 0,2', () => {
    expect(parseBRL('0,10')! + parseBRL('0,20')!).toBe(30);
  });

  it('formata em real brasileiro', () => {
    expect(formatBRL(123456)).toBe('R$ 1.234,56');
    expect(formatBRL(5)).toBe('R$ 0,05');
    expect(formatSignedBRL(200)).toBe('+ R$ 2,00');
    expect(formatSignedBRL(-80)).toBe('− R$ 0,80');
    expect(centsToInput(549)).toBe('5,49');
  });

  it('rejeita valores não inteiros', () => {
    expect(() => formatBRL(1.5)).toThrow();
  });

  it('arredonda meio para cima com aritmética inteira (teste 8)', () => {
    expect(divRoundHalfUp(9987500, 1000)).toBe(9988);
    expect(divRoundHalfUp(5, 10)).toBe(1);
    expect(divRoundHalfUp(4, 10)).toBe(0);
    expect(divRoundHalfUp(-5, 10)).toBe(-1);
    // 1,250 kg × R$ 7,99 = 9,9875 → R$ 9,99
    expect(lineSubtotal(799, 1250)).toBe(999);
    expect(lineSubtotal(799, 1250, 'truncate')).toBe(998);
    expect(acceptableSubtotals(799, 1250)).toEqual([999, 998]);
    // 0,333 kg × R$ 10,00 = 3,33
    expect(lineSubtotal(1000, 333)).toBe(333);
  });

  it('interpreta quantidades por unidade, peso e volume', () => {
    expect(parseQuantity('2', 'un')).toBe(2000);
    expect(parseQuantity('1,5', 'un')).toBeNull();
    expect(parseQuantity('1,250', 'kg')).toBe(1250);
    expect(parseQuantity('0,5', 'l')).toBe(500);
    expect(parseQuantity('250', 'kg', 'g')).toBe(250);
    expect(parseQuantity('350', 'l', 'ml')).toBe(350);
    expect(parseQuantity('0', 'un')).toBeNull();
    expect(formatQuantity(1250, 'kg')).toBe('1,250 kg');
    expect(formatQuantity(3000, 'un')).toBe('3 un');
  });
});
