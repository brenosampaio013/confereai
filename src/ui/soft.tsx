import { Ionicons } from '@expo/vector-icons';
import { ReactNode, useId, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  KeyboardTypeOptions,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { colors, raised, soft, space, sunken, type } from './theme';

/**
 * Na web o navegador desenha o próprio anel de foco preto dentro do campo. Ele é removido
 * porque a borda azul do campo já indica o foco (e passa em 3:1), mas a propriedade não
 * existe no React Native, então é aplicada só na web.
 */
const semAnelDoNavegador =
  Platform.OS === 'web' ? ({ outlineStyle: 'none' } as unknown as { outlineWidth: number }) : null;

/**
 * Peças das telas de conta, no estilo "soft UI": o relevo indica o que fazer com cada coisa.
 * Relevo = aperte. Afundado = escreva. Plano = leia.
 *
 * A sombra dupla vem de `raised()` e `sunken()` (ver theme.ts) e usa `boxShadow`, suportado
 * pelo React Native 0.88 e pelo react-native-web — sem biblioteca extra. Os degradês saem do
 * react-native-svg, que já é dependência do projeto.
 */

export type IconName = keyof typeof Ionicons.glyphMap;

/* ------------------------------------------------------------------ */
/* Fundo e estrutura                                                   */
/* ------------------------------------------------------------------ */

/** Discos difusos sangrando pelas bordas: a única decoração das telas de conta. */
function Decor() {
  const id = useId();
  const [size, setSize] = useState({ w: 0, h: 0 });
  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      {size.w > 0 ? (
        <Svg width={size.w} height={size.h}>
          <Defs>
            <RadialGradient id={`${id}-halo`} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.95} />
              <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id={`${id}-blue`} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="#9FB8EC" stopOpacity={0.5} />
              <Stop offset="1" stopColor="#9FB8EC" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={size.w * 0.16} cy={size.h * 0.06} r={size.w * 0.62} fill={`url(#${id}-halo)`} />
          <Circle cx={size.w * -0.06} cy={size.h * 0.02} r={size.w * 0.42} fill={`url(#${id}-blue)`} />
          <Circle cx={size.w * 1.06} cy={size.h * 0.33} r={size.w * 0.45} fill={`url(#${id}-blue)`} />
          <Circle cx={size.w * 0.92} cy={size.h * 1.0} r={size.w * 0.7} fill={`url(#${id}-halo)`} />
        </Svg>
      ) : null}
    </View>
  );
}

/** Tela de conta: fundo azul claro, decoração ao fundo e uma coluna central de 400 px. */
export function SoftScreen({ children, footer, corner }: { children: ReactNode; footer?: ReactNode; corner?: ReactNode }) {
  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
      <Decor />
      {corner ? <View style={styles.corner}>{corner}</View> : null}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.column}>{children}</View>
        </ScrollView>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Superfície em relevo. `inset` inverte a luz para o estado afundado. */
export function Plate({
  children,
  style,
  level = 2,
  inset,
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  level?: 1 | 2 | 3;
  inset?: boolean;
}) {
  return (
    <View
      style={[
        { backgroundColor: inset ? soft.sunken : soft.plate, borderRadius: 22, boxShadow: inset ? sunken() : raised(level) },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Cabeçalho das telas de conta: marca em relevo, título e uma linha de explicação. */
export function SoftHeader({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <View style={styles.header}>
      <Plate level={3} style={styles.badge}>
        {children}
      </Plate>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Campos                                                              */
/* ------------------------------------------------------------------ */

export function SoftField({
  label,
  value,
  onChangeText,
  icon,
  placeholder,
  secure,
  error,
  hint,
  keyboardType,
  autoCapitalize = 'none',
  autoComplete,
  textContentType,
  autoFocus,
  onSubmitEditing,
  returnKeyType,
  testID,
}: {
  label: string;
  value: string;
  onChangeText: (s: string) => void;
  icon: IconName;
  placeholder?: string;
  secure?: boolean;
  error?: string | null;
  hint?: string;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences' | 'words';
  autoComplete?: 'email' | 'name' | 'password' | 'password-new' | 'off';
  textContentType?: 'emailAddress' | 'name' | 'password' | 'newPassword' | 'none';
  autoFocus?: boolean;
  onSubmitEditing?: () => void;
  returnKeyType?: 'next' | 'done' | 'send';
  testID?: string;
}) {
  const [focused, setFocused] = useState(false);
  const [shown, setShown] = useState(false);
  const hidden = !!secure && !shown;
  return (
    <View style={{ gap: 4 }}>
      <Text style={styles.fieldLabel} numberOfLines={1}>
        {value ? label : ' '}
      </Text>
      <View
        style={[
          styles.field,
          focused && { borderColor: soft.ring },
          !!error && { borderColor: colors.red },
        ]}
      >
        <Ionicons name={icon} size={20} color={error ? colors.redText : focused ? soft.ring : soft.placeholder} />
        <TextInput
          testID={testID}
          accessibilityLabel={label}
          accessibilityHint={hint}
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder ?? label}
          placeholderTextColor={soft.placeholder}
          secureTextEntry={hidden}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoComplete={autoComplete}
          textContentType={textContentType}
          autoCorrect={false}
          autoFocus={autoFocus}
          onSubmitEditing={onSubmitEditing}
          returnKeyType={returnKeyType}
          style={[styles.input, semAnelDoNavegador]}
        />
        {secure ? (
          <Pressable
            onPress={() => setShown((s) => !s)}
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Mostrar senha' : 'Ocultar senha'}
            accessibilityState={{ checked: !hidden }}
            hitSlop={10}
            style={styles.eye}
          >
            <Ionicons name={hidden ? 'eye-off-outline' : 'eye-outline'} size={20} color={soft.placeholder} />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <View style={styles.fieldNote} accessibilityRole="alert" accessibilityLiveRegion="polite">
          <Ionicons name="alert-circle" size={15} color={colors.redText} />
          <Text style={[type.small, { color: colors.redText, flex: 1 }]}>{error}</Text>
        </View>
      ) : hint ? (
        <Text style={[type.small, { color: colors.textMuted }]}>{hint}</Text>
      ) : null}
    </View>
  );
}

/** Caixa de seleção em relevo; marcada, afunda e fica azul. */
export function SoftCheck({
  checked,
  onChange,
  label,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  children?: ReactNode;
}) {
  return (
    <Pressable
      onPress={() => onChange(!checked)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      hitSlop={6}
      style={styles.checkRow}
    >
      <View style={[styles.checkBox, checked ? styles.checkBoxOn : styles.checkBoxOff]}>
        {checked ? <Ionicons name="checkmark" size={15} color={colors.white} /> : null}
      </View>
      {children ?? <Text style={[type.small, { color: colors.text, flex: 1 }]}>{label}</Text>}
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* Ações                                                               */
/* ------------------------------------------------------------------ */

/** Ação principal da tela: a única superfície saturada. */
export function GradientButton({
  title,
  onPress,
  loading,
  disabled,
  icon = 'arrow-forward',
  tone = 'blue',
  testID,
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  icon?: IconName | null;
  tone?: 'blue' | 'green';
  testID?: string;
}) {
  const id = useId();
  const off = !!disabled || !!loading;
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [from, to] = tone === 'green' ? [colors.green, '#07663C'] : [soft.gradientFrom, soft.gradientTo];
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy: !!loading }}
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      style={({ pressed }) => [
        styles.cta,
        { backgroundColor: from, boxShadow: pressed ? raised(1) : raised(2), opacity: off ? 0.55 : 1 },
        pressed && { transform: [{ scale: 0.99 }] },
      ]}
    >
      {size.w > 0 ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Svg width={size.w} height={size.h}>
            <Defs>
              <LinearGradient id={`${id}-cta`} x1="0%" y1="0%" x2="100%" y2="100%">
                <Stop offset="0" stopColor={from} />
                <Stop offset="1" stopColor={to} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width={size.w} height={size.h} rx={28} fill={`url(#${id}-cta)`} />
          </Svg>
        </View>
      ) : null}
      {loading ? (
        <ActivityIndicator color={colors.white} />
      ) : (
        <>
          <Text style={styles.ctaText} numberOfLines={1}>
            {title}
          </Text>
          {icon ? (
            <View style={styles.ctaDisc}>
              <Ionicons name={icon} size={18} color={colors.white} />
            </View>
          ) : null}
        </>
      )}
    </Pressable>
  );
}

/** Ação secundária: relevo sem cor. */
export function SoftButton({
  title,
  onPress,
  icon,
  loading,
  disabled,
}: {
  title: string;
  onPress: () => void;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
}) {
  const off = !!disabled || !!loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy: !!loading }}
      style={({ pressed }) => [
        styles.soft,
        { boxShadow: pressed ? sunken(1) : raised(1), opacity: off ? 0.55 : 1 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.navy} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={18} color={colors.navy} /> : null}
          <Text style={[type.bodyStrong, { color: colors.navy }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

/** Ligação em texto, para as trocas de tela. */
export function SoftLink({
  title,
  onPress,
  strong,
  align = 'center',
}: {
  title: string;
  onPress: () => void;
  strong?: boolean;
  align?: 'center' | 'left' | 'right';
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      hitSlop={8}
      style={{ alignSelf: alignment[align], minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 }}
    >
      {({ pressed }) => (
        <Text
          style={[
            type.small,
            { color: strong ? soft.ring : colors.textMuted, fontWeight: strong ? '700' : '600' },
            pressed && { textDecorationLine: 'underline' },
          ]}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const alignment = { center: 'center', left: 'flex-start', right: 'flex-end' } as const;

/* ------------------------------------------------------------------ */
/* Recados                                                             */
/* ------------------------------------------------------------------ */

/** Aviso de erro ou de sucesso, no mesmo relevo das demais peças. */
export function SoftNote({ tone, children }: { tone: 'red' | 'green' | 'navy'; children: ReactNode }) {
  const skin = {
    red: { fg: colors.redText, icon: 'alert-circle' as IconName },
    green: { fg: colors.greenText, icon: 'checkmark-circle' as IconName },
    navy: { fg: colors.navy, icon: 'information-circle' as IconName },
  }[tone];
  return (
    <View style={[styles.note, { boxShadow: sunken(1) }]} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Ionicons name={skin.icon} size={19} color={skin.fg} style={{ marginTop: 1 }} />
      <Text style={[type.small, { color: skin.fg, flex: 1 }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: soft.bg },
  corner: { position: 'absolute', top: space.md, left: space.lg, zIndex: 3 },
  fieldLabel: { fontSize: 12.5, lineHeight: 16, fontWeight: '600', color: colors.textMuted, paddingHorizontal: 8 },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: space.xl, paddingVertical: space.xxl },
  column: { width: '100%', maxWidth: 400, alignSelf: 'center', gap: space.lg },
  footer: { paddingHorizontal: space.xl, paddingBottom: space.md, alignItems: 'center' },
  header: { alignItems: 'center', gap: space.sm, marginBottom: space.sm },
  badge: {
    width: 92,
    height: 92,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.md,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800',
    letterSpacing: -0.7,
    color: colors.navy,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500',
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 330,
  },
  field: {
    minHeight: 58,
    borderRadius: 20,
    backgroundColor: soft.sunken,
    boxShadow: sunken(),
    borderWidth: 1.5,
    borderColor: 'transparent',
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  input: { flex: 1, fontSize: 16, lineHeight: 22, color: colors.text, paddingVertical: 14 },
  eye: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -12 },
  fieldNote: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 6 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1, minHeight: 44 },
  checkBox: { width: 24, height: 24, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  checkBoxOff: { backgroundColor: soft.plate, boxShadow: raised(1) },
  checkBoxOn: { backgroundColor: soft.ring, boxShadow: sunken(1) },
  cta: {
    minHeight: 58,
    borderRadius: 28,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 22,
  },
  ctaText: { fontSize: 17, fontWeight: '700', color: colors.white, letterSpacing: 0.2 },
  ctaDisc: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  soft: {
    minHeight: 52,
    borderRadius: 26,
    backgroundColor: soft.plate,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 20,
  },
  note: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    backgroundColor: soft.sunken,
    borderRadius: 16,
    padding: 14,
  },
});
