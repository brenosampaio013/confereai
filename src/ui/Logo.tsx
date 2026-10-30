import Svg, { Path, Rect } from 'react-native-svg';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from './theme';

/**
 * Marca: um cupom fiscal (borda serrilhada) com um sinal de conferido.
 * Funciona sozinho como ícone e acompanhado do nome no cabeçalho.
 */
export function LogoMark({ size = 40 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Rect width="64" height="64" rx="16" fill={colors.navy} />
      <Path
        d="M19 13h26a2 2 0 0 1 2 2v34l-5-3-5 3-5-3-5 3-5-3-5 3V15a2 2 0 0 1 2-2z"
        fill={colors.white}
      />
      <Path d="M23 21h18M23 27h12" stroke={colors.textFaint} strokeWidth={3} strokeLinecap="round" />
      <Path d="M24.5 36.5l5.5 5.5 11-12" stroke={colors.green} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

export function Logo({ size = 36, light = false }: { size?: number; light?: boolean }) {
  return (
    <View style={styles.row} accessibilityRole="header" accessibilityLabel="Confere Aí">
      <LogoMark size={size} />
      <Text style={[styles.word, { fontSize: size * 0.62, color: light ? colors.white : colors.navy }]}>
        Confere <Text style={{ color: colors.green }}>Aí</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  word: { fontWeight: '800', letterSpacing: -0.5 },
});
