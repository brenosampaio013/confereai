import { serrilha } from '@/ui/components';

const pontos = (s: string) => s.split(' ').map((p) => p.split(',').map(Number) as [number, number]);

describe('serrilha do cupom', () => {
  it('fecha exatamente na largura, com dentes iguais', () => {
    const p = pontos(serrilha(360));
    expect(p[0]).toEqual([0, 0]);
    expect(p[1]).toEqual([360, 0]);
    expect(p[p.length - 1]).toEqual([0, 0]);
    // 360 / 18 = 20 dentes: uma ponta e um vale por dente.
    const pontas = p.filter(([, y]) => y === 9);
    expect(pontas).toHaveLength(20);
    expect(pontas[0][0]).toBe(351);
  });

  it('ajusta o tamanho do dente quando a largura não é múltipla', () => {
    const p = pontos(serrilha(100));
    const pontas = p.filter(([, y]) => y > 0).map(([x]) => x);
    expect(pontas).toHaveLength(6);
    const passo = 100 / 6;
    pontas.forEach((x, i) => expect(x).toBeCloseTo((6 - i - 0.5) * passo));
  });

  it('desenha ao menos um dente em larguras pequenas', () => {
    expect(pontos(serrilha(5)).filter(([, y]) => y > 0)).toHaveLength(1);
  });
});
