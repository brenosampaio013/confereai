import { painelDoMes, SpendRecord } from '@/domain/finance';

const compra = (date: string, totalCents: number): SpendRecord => ({ id: date + totalCents, storeName: null, date, totalCents, savingsCents: 0, budgetCents: null });
const hoje = new Date(2026, 10, 25, 12); // 25/11/2026, horário local

describe('painel do mês na tela inicial', () => {
  it('não aparece sem nenhuma compra encerrada', () => {
    expect(painelDoMes([], hoje)).toBeNull();
  });

  it('não aparece quando só há compras antigas (nem neste mês nem no anterior)', () => {
    expect(painelDoMes([compra('2026-06-10T12:00:00', 5000)], hoje)).toBeNull();
  });

  it('soma o mês atual e compara com o mês anterior', () => {
    const p = painelDoMes([compra('2026-11-03T12:00:00', 10000), compra('2026-11-20T12:00:00', 4520), compra('2026-10-15T12:00:00', 12000)], hoje);
    expect(p).toEqual({ totalCents: 14520, compras: 2, comparacao: 'R$ 25,20 a mais que em outubro' });
  });

  it('diz quando gastou menos', () => {
    const p = painelDoMes([compra('2026-11-03T12:00:00', 8000), compra('2026-10-15T12:00:00', 12000)], hoje);
    expect(p?.comparacao).toBe('R$ 40,00 a menos que em outubro');
  });

  it('diz quando gastou o mesmo', () => {
    expect(painelDoMes([compra('2026-11-03T12:00:00', 8000), compra('2026-10-15T12:00:00', 8000)], hoje)?.comparacao).toBe('O mesmo que em outubro');
  });

  it('sem compras no mês anterior, não inventa comparação', () => {
    expect(painelDoMes([compra('2026-11-03T12:00:00', 8000)], hoje)).toEqual({ totalCents: 8000, compras: 1, comparacao: null });
  });

  it('no começo do mês, mostra zero e ainda não compara', () => {
    const p = painelDoMes([compra('2026-10-15T12:00:00', 12000)], hoje);
    expect(p).toEqual({ totalCents: 0, compras: 0, comparacao: null });
  });
});
