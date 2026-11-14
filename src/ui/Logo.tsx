import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from './theme';

/**
 * Marca: um carrinho cujo cesto é um cupom fiscal (borda serrilhada) com um sinal de conferido.
 * Funciona sozinho como ícone e acompanhado do nome no cabeçalho.
 * O mesmo desenho gera os ícones do app em scripts/generate-icons.mjs.
 */
export function LogoMark({ size = 40 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Rect width="64" height="64" rx="16" fill={colors.navy} />
      <Path
        d="M12 17h4.4a2.2 2.2 0 0 1 2 1.3L20.5 24"
        stroke={colors.white}
        strokeWidth={3.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Path d="M20.5 24H51.5L47 41l-5.5-3-5.5 3-5.5-3-5.5 3Z" fill={colors.white} />
      <Path
        d="M29 31.6l4.3 4.3 8.7-9.2"
        stroke={colors.green}
        strokeWidth={4.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Circle cx="30" cy="48" r="3.2" fill={colors.white} />
      <Circle cx="44" cy="48" r="3.2" fill={colors.white} />
    </Svg>
  );
}

export function Logo({ size = 36, light = false }: { size?: number; light?: boolean }) {
  return (
    <View style={styles.row} accessibilityRole="header" accessibilityLabel="Meu Carrin">
      <LogoMark size={size} />
      <Text style={[styles.word, { fontSize: size * 0.62, color: light ? colors.white : colors.navy }]}>
        Meu <Text style={{ color: colors.green }}>Carrin</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  word: { fontWeight: '800', letterSpacing: -0.5 },
});
