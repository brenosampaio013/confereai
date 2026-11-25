import { colors, font, tone, type } from '@/ui/theme';

/** Contraste WCAG 2 entre duas cores #rrggbb. */
function contraste(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

describe('design system: cores', () => {
  it('usa as cores aprovadas (verde floresta para agir, verde claro de destaque)', () => {
    expect(colors.action).toBe('#0B5D3B');
    expect(colors.accent).toBe('#3CC27F');
    expect(colors.bg).toBe('#F3F5F4');
    expect(colors.surface).toBe('#FFFFFF');
    // O logotipo continua marinho e verde.
    expect(colors.brandNavy).toBe('#0E2A47');
    expect(colors.brandGreen).toBe('#11915A');
  });

  const texto: [string, string, string][] = [
    ['texto principal no fundo', colors.text, colors.bg],
    ['texto de apoio no fundo', colors.textMuted, colors.bg],
    ['texto de apoio no cartão', colors.textMuted, colors.surface],
    ['texto fraco no fundo', colors.textFaint, colors.bg],
    ['texto fraco no cartão', colors.textFaint, colors.surface],
    ['rótulo do botão principal', colors.onAction, colors.action],
    ['rótulo do botão pressionado', colors.onAction, colors.actionPressed],
    ['ação como texto no cartão', colors.action, colors.surface],
    ['ação sobre o fundo tingido', colors.action, colors.actionSoft],
    ['rótulo do botão de confirmar', colors.onAccent, colors.accent],
    ['rótulo do botão de confirmar pressionado', colors.onAccent, colors.accentPressed],
    ['texto no painel de destaque', colors.onHighlight, colors.highlight],
    ['apoio no painel de destaque', colors.onHighlightMuted, colors.highlight],
    ['texto branco sobre o verde de sucesso', colors.white, colors.green],
    ['rótulo sobre o vermelho forte', colors.white, colors.red],
    ['texto sobre o âmbar forte', colors.text, colors.yellow],
  ];
  it.each(texto)('%s tem no mínimo 4,5:1', (_nome, frente, fundo) => {
    expect(contraste(frente, fundo)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(Object.entries(tone))('o selo %s tem texto legível sobre o próprio fundo', (_nome, t) => {
    expect(contraste(t.fg, t.bg)).toBeGreaterThanOrEqual(4.5);
  });

  const marcas: [string, string, string][] = [
    ['contorno de campo no cartão', colors.borderField, colors.surface],
    ['anel de foco no fundo', colors.focus, colors.bg],
    ['ícone verde claro no painel de destaque', colors.accent, colors.highlight],
    ['ícone de sucesso no cartão', colors.green, colors.surface],
  ];
  it.each(marcas)('%s tem no mínimo 3:1', (_nome, frente, fundo) => {
    expect(contraste(frente, fundo)).toBeGreaterThanOrEqual(3);
  });
});

describe('design system: tipografia', () => {
  it('todos os estilos de texto usam a Archivo', () => {
    expect(font.family).toBe('Archivo');
    for (const [nome, estilo] of Object.entries(type)) {
      expect([nome, estilo.fontFamily]).toEqual([nome, 'Archivo']);
    }
  });

  it('valores em dinheiro usam algarismos tabulares', () => {
    expect(type.money.fontVariant).toEqual(['tabular-nums']);
    expect(type.moneyLarge.fontVariant).toEqual(['tabular-nums']);
  });

  it('legendas não são em caixa-alta', () => {
    expect(type.caption).not.toHaveProperty('textTransform');
  });
});
