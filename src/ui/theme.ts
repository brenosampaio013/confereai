import { Platform } from 'react-native';

/**
 * Identidade visual do Meu Carrin 2.0.
 *
 * A fonte da verdade é o design system aprovado (`.planning/design-system/tokens.json`);
 * o nome do token aparece ao lado de cada cor. Verde floresta para agir, verde claro para
 * destacar, fundos branco e cinza suave, marinho só no logotipo.
 */
export const colors = {
  // Ação (verde floresta)
  action: '#0B5D3B', // acao
  actionPressed: '#07472C', // acao-pressionada
  onAction: '#FFFFFF', // sobre-acao
  actionSoft: '#E3F1E9', // acao-suave
  // Destaque: um painel por tela
  highlight: '#0B5D3B', // destaque
  onHighlight: '#FFFFFF', // sobre-destaque
  onHighlightMuted: '#C9E3D5', // sobre-destaque-suave
  // Verde claro: preenchimento com texto escuro e ícones sobre o destaque; nunca como texto
  accent: '#3CC27F', // broto
  accentPressed: '#33A86E',
  onAccent: '#11201A', // sobre-broto
  accentSoft: '#DDF6E8', // broto-suave
  // Estados
  green: '#13804F', // preenchimento e ícone de sucesso (texto branco em cima passa em 4,5:1)
  greenPressed: '#0E6A41',
  greenSoft: '#E2F4EA', // sucesso-suave
  greenText: '#0E6E42', // sucesso
  yellow: '#E8A400', // atencao-forte
  yellowSoft: '#FFF3D6', // atencao-suave
  yellowText: '#7A5200', // atencao
  red: '#C4301F', // erro-forte
  redSoft: '#FDECEA', // erro-suave
  redText: '#B42318', // erro
  // Neutros
  bg: '#F3F5F4', // fundo
  surface: '#FFFFFF', // superficie
  surfaceAlt: '#F8FAF9', // superficie-alt
  border: '#DCE3DF', // linha
  borderField: '#8A9790', // borda-campo
  text: '#11201A', // tinta
  textMuted: '#4F5E56', // tinta-suave
  textFaint: '#647369', // tinta-fraca
  focus: '#0B5D3B', // foco
  scrim: 'rgba(8, 20, 14, 0.48)', // veu
  chartMuted: '#B9CBC1', // barras fora de foco nos gráficos (decorativas)
  white: '#FFFFFF',
  black: '#000000',
  // Só no logotipo
  brandNavy: '#0E2A47', // marinho / marca-meu
  brandGreen: '#11915A', // marca-carrin
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radius = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 } as const;

/** Menor área tocável de qualquer controle. */
export const touchTarget = 48;

/**
 * Archivo em todo o app. No celular, os arquivos estáticos entram na build pelo plugin do
 * expo-font (app.json) com a família "Archivo" e um arquivo por peso; na web, a fonte
 * variável é registrada por `fontes.ts`. Assim `fontWeight` escolhe o peso certo nos dois.
 */
export const font = {
  family: 'Archivo',
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
};

const f = font.family;
export const type = {
  display: { fontFamily: f, fontSize: 30, lineHeight: 34, fontWeight: '800' as const, letterSpacing: -0.6 },
  title: { fontFamily: f, fontSize: 22, lineHeight: 28, fontWeight: '700' as const, letterSpacing: -0.2 },
  heading: { fontFamily: f, fontSize: 17, lineHeight: 24, fontWeight: '600' as const },
  body: { fontFamily: f, fontSize: 16, lineHeight: 24, fontWeight: '400' as const },
  bodyStrong: { fontFamily: f, fontSize: 16, lineHeight: 24, fontWeight: '600' as const },
  small: { fontFamily: f, fontSize: 14, lineHeight: 20, fontWeight: '400' as const },
  caption: { fontFamily: f, fontSize: 12.5, lineHeight: 16, fontWeight: '600' as const, letterSpacing: 0.12 },
  money: { fontFamily: f, fontSize: 20, lineHeight: 26, fontWeight: '700' as const, fontVariant: ['tabular-nums' as const] },
  moneyLarge: { fontFamily: f, fontSize: 40, lineHeight: 44, fontWeight: '800' as const, letterSpacing: -0.8, fontVariant: ['tabular-nums' as const] },
};

/**
 * Tons dos selos e avisos. `navy` é o nome antigo do tom de ação (mantido para não mudar a API
 * de `Pill` e `Banner`); hoje é verde floresta sobre verde claríssimo.
 */
export type SeverityTone = 'green' | 'yellow' | 'red' | 'neutral' | 'navy';

export const tone: Record<SeverityTone, { bg: string; fg: string; solid: string }> = {
  green: { bg: colors.greenSoft, fg: colors.greenText, solid: colors.green },
  yellow: { bg: colors.yellowSoft, fg: colors.yellowText, solid: colors.yellow },
  red: { bg: colors.redSoft, fg: colors.redText, solid: colors.red },
  neutral: { bg: colors.surfaceAlt, fg: colors.textMuted, solid: colors.textMuted },
  navy: { bg: colors.actionSoft, fg: colors.action, solid: colors.action },
};

/** Sombra do que flutua sobre a tela: menu, folha, botão de escanear. Cartões não têm sombra. */
export const floating = {
  boxShadow: '0 16px 40px -16px rgba(17, 32, 26, 0.32), 0 2px 6px rgba(17, 32, 26, 0.06)',
} as const;

/** Sombra do painel de destaque (um por tela). */
export const highlightShadow = { boxShadow: '0 12px 28px -18px rgba(11, 93, 59, 0.7)' } as const;

/** Durações de movimento, em milissegundos. Movimento só responde a um gesto. */
export const duration = { fast: 120, medium: 200, slow: 320 } as const;
