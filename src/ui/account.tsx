import { Ionicons } from '@expo/vector-icons';
import { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Strength } from '@/domain/auth';
import { LogoMark } from './Logo';
import { GradientButton, Plate, SoftHeader, SoftScreen } from './soft';
import { colors, raised, soft, space, sunken, type } from './theme';

/**
 * Peças comuns às telas de conta (entrar, criar conta, recuperar, confirmar).
 * Ficam fora de src/app porque tudo que mora lá vira rota.
 */

/** Moldura das telas de conta: fundo, coluna central e o botão de voltar flutuante. */
export function AccountScreen({
  children,
  onBack,
  backLabel = 'Voltar',
  footer,
}: {
  children: ReactNode;
  onBack?: () => void;
  backLabel?: string;
  footer?: ReactNode;
}) {
  return (
    <SoftScreen
      footer={footer}
      corner={
        onBack ? (
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel={backLabel}
            hitSlop={10}
            style={({ pressed }) => [styles.back, { boxShadow: pressed ? sunken(1) : raised(1) }]}
          >
            <Ionicons name="arrow-back" size={20} color={colors.navy} />
          </Pressable>
        ) : null
      }
    >
      {children}
    </SoftScreen>
  );
}

/**
 * Cabeçalho com a marca em relevo. Nas telas de desfecho, `done` troca a marca por um
 * visto verde — o mesmo verde que o aplicativo usa para "conferido".
 */
export function AccountHeader({ title, subtitle, done }: { title: string; subtitle: string; done?: boolean }) {
  return (
    <SoftHeader title={title} subtitle={subtitle}>
      {done ? (
        <View style={styles.done}>
          <Ionicons name="checkmark" size={38} color={colors.white} />
        </View>
      ) : (
        <LogoMark size={56} />
      )}
    </SoftHeader>
  );
}

/** Medidor de força da senha: quatro marcas num trilho afundado. */
export function StrengthMeter({ strength }: { strength: Strength }) {
  // A marca no trilho pode ser clara (3:1 basta); o rótulo é texto e precisa de 4,5:1.
  const marca = [colors.red, colors.red, soft.meterMid, colors.green, colors.green][strength.score];
  const rotulo = [colors.redText, colors.redText, colors.yellowText, colors.greenText, colors.greenText][strength.score];
  return (
    <View style={{ gap: 6 }} accessibilityRole="progressbar" accessibilityLabel={`Força da senha: ${strength.label || 'vazia'}`}>
      <View style={styles.track}>
        {[1, 2, 3, 4].map((n) => (
          <View key={n} style={[styles.tick, { backgroundColor: n <= strength.score ? marca : 'transparent' }]} />
        ))}
      </View>
      <View style={styles.strengthRow}>
        <Text style={[type.small, { color: colors.textMuted, flex: 1 }]}>{strength.tip ?? ' '}</Text>
        {strength.label ? <Text style={[type.small, { color: rotulo, fontWeight: '700' }]}>{strength.label}</Text> : null}
      </View>
    </View>
  );
}

/** Estado sem servidor: contas indisponíveis, o resto do aplicativo funciona. */
export function CloudOff({ onBack }: { onBack: () => void }) {
  return (
    <AccountScreen onBack={onBack} backLabel="Fechar">
      <AccountHeader
        title="Contas indisponíveis"
        subtitle="Este aplicativo ainda não está ligado a um servidor. Suas compras continuam salvas neste aparelho."
      />
      <Plate inset style={styles.infoPlate}>
        <Text style={[type.small, { color: colors.textMuted, textAlign: 'center' }]}>
          Criar conta serve para guardar as compras na nuvem e abrir o histórico em outro celular. Nada do que você já
          registrou se perde até lá.
        </Text>
      </Plate>
      <GradientButton title="Voltar ao aplicativo" onPress={onBack} icon="arrow-back" />
    </AccountScreen>
  );
}

/** Rodapé de troca de tela: uma frase e uma ligação. */
export function SwapLine({ text, action, onPress }: { text: string; action: string; onPress: () => void }) {
  return (
    <View style={styles.swap}>
      <Text style={[type.small, { color: colors.textMuted }]}>{text}</Text>
      <Pressable onPress={onPress} accessibilityRole="link" hitSlop={8} style={styles.swapLink}>
        {({ pressed }) => (
          <Text style={[type.small, { color: soft.ring, fontWeight: '700' }, pressed && { textDecorationLine: 'underline' }]}>
            {action}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  back: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: soft.plate,
    alignItems: 'center',
    justifyContent: 'center',
  },
  done: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: [{ offsetX: 0, offsetY: 6, blurRadius: 14, color: 'rgba(17, 145, 90, 0.35)' }],
  },
  track: {
    flexDirection: 'row',
    gap: 6,
    height: 8,
    borderRadius: 4,
    backgroundColor: soft.sunken,
    boxShadow: sunken(1),
    padding: 1.5,
  },
  tick: { flex: 1, borderRadius: 3 },
  strengthRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  infoPlate: { padding: space.lg },
  swap: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  swapLink: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
});
