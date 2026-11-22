import {
  descreveCobranca, economiaAnualCents, type EstadoDoPlano, fracaoUsada, fraseDeUso, lerEstado,
  planoAnunciado, quandoZera,
} from '@/domain/planos';

const base: EstadoDoPlano = {
  plano: 'gratis',
  status: 'none',
  renovaEm: null,
  cancelaNoFim: false,
  preco: null,
  etiqueta: { limite: 20, usado: 0, resta: 20 },
  cupom: { limite: 4, usado: 0, resta: 4 },
  zeraEm: '2026-12-01T03:00:00.000Z',
};

describe('estado do plano vindo do servidor', () => {
  it('lê a resposta de my_plan()', () => {
    const e = lerEstado({
      plano: 'mais',
      status: 'active',
      renova_em: '2026-12-22T10:00:00Z',
      cancela_no_fim: false,
      preco: 'mais_anual',
      etiqueta: { limite: 300, usado: 11, resta: 289 },
      cupom: { limite: 300, usado: 11, resta: 289 },
      zera_em: '2026-12-01T03:00:00Z',
    });
    expect(e).toMatchObject({ plano: 'mais', status: 'active', preco: 'mais_anual' });
    expect(e?.etiqueta).toEqual({ limite: 300, usado: 11, resta: 289 });
  });

  it('não confia em campos ausentes ou inesperados', () => {
    expect(lerEstado(null)).toBeNull();
    expect(lerEstado('qualquer coisa')).toBeNull();
    const e = lerEstado({ plano: 'inventado', preco: 'familia_mensal' });
    // Na dúvida, plano grátis: nunca liberar por falta de informação.
    expect(e).toMatchObject({ plano: 'gratis', status: 'none', preco: null });
    expect(e?.etiqueta).toEqual({ limite: null, usado: 0, resta: null });
  });
});

describe('frase sobre a cobrança', () => {
  it('diz quando renova', () => {
    expect(descreveCobranca({ ...base, plano: 'mais', status: 'active', renovaEm: '2026-12-22T10:00:00Z' }))
      .toEqual({ texto: 'Renova em 22/12/2026.', tom: 'neutro' });
  });

  it('avisa que não renova quando o cancelamento já foi pedido', () => {
    const r = descreveCobranca({ ...base, plano: 'mais', status: 'active', cancelaNoFim: true, renovaEm: '2026-12-22T10:00:00Z' });
    expect(r).toEqual({ texto: 'Ativo até 22/12/2026. Não renova.', tom: 'atencao' });
  });

  it('pede ação quando o cartão falhou', () => {
    expect(descreveCobranca({ ...base, plano: 'mais', status: 'past_due' })).toEqual({
      texto: 'A última cobrança não passou. Atualize o cartão para não perder o plano.',
      tom: 'atencao',
    });
  });

  it('não promete nada a quem nunca assinou', () => {
    expect(descreveCobranca(base)).toEqual({ texto: 'Você está no plano grátis.', tom: 'neutro' });
    expect(descreveCobranca({ ...base, status: 'canceled' }).texto).toMatch(/encerrada/);
  });
});

describe('uso do mês', () => {
  it('conta o que falta', () => {
    expect(fraseDeUso({ limite: 20, usado: 5, resta: 15 }, 'foto', 'fotos')).toBe('5 de 20 fotos usadas neste mês.');
  });

  it('diz com clareza quando acabou', () => {
    expect(fraseDeUso({ limite: 4, usado: 9, resta: 0 }, 'leitura', 'leituras')).toBe('As 4 leituras deste mês acabaram.');
  });

  it('plano sem limite não inventa barra nem total', () => {
    expect(fraseDeUso({ limite: null, usado: 1, resta: null }, 'foto', 'fotos')).toBe('1 foto neste mês, sem limite.');
    expect(fracaoUsada({ limite: null, usado: 7, resta: null })).toBeNull();
  });

  it('a barra não passa do fim mesmo com uso acima do limite', () => {
    expect(fracaoUsada({ limite: 4, usado: 9, resta: 0 })).toBe(1);
    expect(fracaoUsada({ limite: 20, usado: 5, resta: 15 })).toBe(0.25);
  });

  it('diz quando a cota volta', () => {
    expect(quandoZera(base)).toBe('A cota volta em 01/12/2026.');
    expect(quandoZera({ ...base, zeraEm: null })).toBe('');
  });
});

describe('preços anunciados', () => {
  it('a economia do anual é a diferença de doze meses', () => {
    expect(economiaAnualCents(planoAnunciado('mais'))).toBe(990 * 12 - 8900);
  });

  it('o plano grátis não tem preço nem economia', () => {
    expect(economiaAnualCents(planoAnunciado('gratis'))).toBeNull();
    expect(planoAnunciado('gratis').mensalCents).toBeNull();
  });
});
