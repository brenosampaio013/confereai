import { Platform } from 'react-native';

/** Identidade visual do Confere Aí. */
export const colors = {
  // Marca
  navy: '#0E2A47',
  navyPressed: '#0A1F35',
  navySoft: '#E7EEF6',
  green: '#11915A',
  greenPressed: '#0C7748',
  greenSoft: '#E4F4EC',
  greenText: '#0A6B42',
  // Estados
  yellow: '#E8A400',
  yellowSoft: '#FFF5D9',
  yellowText: '#7A5600',
  red: '#D23B3B',
  redSoft: '#FCEBEB',
  redText: '#A12626',
  // Neutros
  bg: '#F3F5F8',
  surface: '#FFFFFF',
  surfaceAlt: '#F8FAFC',
  border: '#DFE5EC',
  text: '#0F1C2A',
  textMuted: '#5A6878',
  textFaint: '#8A97A6',
  white: '#FFFFFF',
  black: '#000000',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

export const font = {
  family: Platform.select({ ios: 'System', android: 'sans-serif', default: 'System' }),
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
};

export const type = {
  display: { fontSize: 30, lineHeight: 36, fontWeight: '800' as const, letterSpacing: -0.5 },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700' as const, letterSpacing: -0.2 },
  heading: { fontSize: 17, lineHeight: 23, fontWeight: '700' as const },
  body: { fontSize: 16, lineHeight: 23, fontWeight: '400' as const },
  bodyStrong: { fontSize: 16, lineHeight: 23, fontWeight: '600' as const },
  small: { fontSize: 14, lineHeight: 20, fontWeight: '400' as const },
  caption: { fontSize: 12.5, lineHeight: 17, fontWeight: '600' as const, letterSpacing: 0.3 },
  money: { fontSize: 17, lineHeight: 22, fontWeight: '700' as const, fontVariant: ['tabular-nums' as const] },
};

export type SeverityTone = 'green' | 'yellow' | 'red' | 'neutral' | 'navy';

export const tone: Record<SeverityTone, { bg: string; fg: string; solid: string }> = {
  green: { bg: colors.greenSoft, fg: colors.greenText, solid: colors.green },
  yellow: { bg: colors.yellowSoft, fg: colors.yellowText, solid: colors.yellow },
  red: { bg: colors.redSoft, fg: colors.redText, solid: colors.red },
  neutral: { bg: colors.surfaceAlt, fg: colors.textMuted, solid: colors.textMuted },
  navy: { bg: colors.navySoft, fg: colors.navy, solid: colors.navy },
};

export const shadow = Platform.select({
  ios: { shadowColor: '#0E2A47', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 3 } },
  android: { elevation: 1.5 },
  default: { shadowColor: '#0E2A47', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 3 } },
});
