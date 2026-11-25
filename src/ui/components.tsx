import { Ionicons } from '@expo/vector-icons';
import { Children, ReactNode, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardTypeOptions,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView, Edge } from 'react-native-safe-area-context';
import Svg, { Polygon } from 'react-native-svg';
import { Cents, formatBRL, formatSignedBRL } from '@/domain/money';
import { colors, floating, radius, space, SeverityTone, tone, touchTarget, type } from './theme';

/**
 * Anel de foco do teclado (web): 2px sólido em `colors.focus`, afastado 2px do controle.
 * O React Native Web informa `focused` ao estilo do Pressable; no celular ele não aparece.
 */
const anelDeFoco = (focused?: boolean) =>
  focused ? ({ outlineColor: colors.focus, outlineStyle: 'solid', outlineWidth: 2, outlineOffset: 2 } as ViewStyle) : null;
type Estado = { pressed: boolean; focused?: boolean; hovered?: boolean };

/** Na web, o campo já mostra o foco na própria borda: o anel do navegador sairia duplicado. */
const semAnelDoNavegador = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as unknown as TextStyle) : null;

export type IconName = keyof typeof Ionicons.glyphMap;

/* ------------------------------------------------------------------ */
/* Texto                                                               */
/* ------------------------------------------------------------------ */

type Variant = keyof typeof type;
export function T({
  v = 'body',
  color,
  style,
  children,
  numberOfLines,
  center,
}: {
  v?: Variant;
  color?: string;
  style?: StyleProp<TextStyle>;
  children: ReactNode;
  numberOfLines?: number;
  center?: boolean;
}) {
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[type[v], { color: color ?? colors.text }, center && { textAlign: 'center' }, style]}
    >
      {children}
    </Text>
  );
}

export function Money({ cents, v = 'money', color, signed }: { cents: Cents | null; v?: Variant; color?: string; signed?: boolean }) {
  return (
    <T v={v} color={color} style={{ fontVariant: ['tabular-nums'] }}>
      {cents == null ? '—' : signed ? formatSignedBRL(cents) : formatBRL(cents)}
    </T>
  );
}

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

export function Screen({
  children,
  scroll = true,
  edges = ['bottom'],
  footer,
  padded = true,
}: {
  children: ReactNode;
  scroll?: boolean;
  edges?: Edge[];
  footer?: ReactNode;
  padded?: boolean;
}) {
  const content = padded ? { padding: space.lg, gap: space.lg, paddingBottom: space.xxl } : undefined;
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: colors.bg }}>
      {scroll ? (
        <ScrollView contentContainerStyle={content} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, content]}>{children}</View>
      )}
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

export function Card({ children, style, onPress, accessibilityLabel }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; accessibilityLabel?: string }) {
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={(e) => {
          const { pressed, focused, hovered } = e as Estado;
          return [styles.card, (pressed || hovered) && { borderColor: colors.borderField }, pressed && { backgroundColor: colors.surfaceAlt }, anelDeFoco(focused), style];
        }}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Row({ children, style, gap = space.sm }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <Row style={{ justifyContent: 'space-between', marginTop: space.sm }}>
      <T v="heading">{children}</T>
      {action}
    </Row>
  );
}

export function Divider() {
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />;
}

/* ------------------------------------------------------------------ */
/* Botões                                                              */
/* ------------------------------------------------------------------ */

type ButtonKind = 'primary' | 'confirm' | 'secondary' | 'ghost' | 'danger' | 'onDark';
export function Button({
  title,
  onPress,
  kind = 'primary',
  icon,
  disabled,
  loading,
  compact,
  style,
  accessibilityHint,
  testID,
}: {
  title: string;
  onPress: () => void;
  kind?: ButtonKind;
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
  testID?: string;
}) {
  const palette = {
    primary: { bg: colors.action, pressed: colors.actionPressed, fg: colors.onAction, border: colors.action },
    confirm: { bg: colors.accent, pressed: colors.accentPressed, fg: colors.onAccent, border: colors.accent },
    secondary: { bg: colors.surface, pressed: colors.actionSoft, fg: colors.action, border: colors.borderField },
    ghost: { bg: 'transparent', pressed: colors.actionSoft, fg: colors.action, border: 'transparent' },
    danger: { bg: colors.surface, pressed: colors.redSoft, fg: colors.redText, border: colors.borderField },
    onDark: { bg: 'transparent', pressed: 'rgba(255,255,255,0.12)', fg: colors.onHighlight, border: colors.onHighlightMuted },
  }[kind];
  const off = disabled || loading;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      accessibilityHint={accessibilityHint}
      style={(e) => {
        const { pressed, focused, hovered } = e as Estado;
        return [
          styles.button,
          compact && styles.buttonCompact,
          { backgroundColor: pressed || hovered ? palette.pressed : palette.bg, borderColor: palette.border },
          pressed && { transform: [{ scale: 0.98 }] },
          off && { opacity: 0.45 },
          anelDeFoco(focused),
          style,
        ];
      }}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={compact ? 18 : 21} color={palette.fg} /> : null}
          <Text style={[type.bodyStrong, compact && { fontSize: 15 }, { color: palette.fg, textAlign: 'center', flexShrink: 1 }]} numberOfLines={2}>
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}

export function IconButton({ icon, onPress, label, color = colors.action, size = 24, bg }: { icon: IconName; onPress: () => void; label: string; color?: string; size?: number; bg?: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={(e) => {
        const { pressed, focused, hovered } = e as Estado;
        return [styles.iconButton, { backgroundColor: pressed || hovered ? colors.actionSoft : (bg ?? 'transparent') }, anelDeFoco(focused)];
      }}
    >
      <Ionicons name={icon} size={size} color={color} />
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* Indicadores                                                         */
/* ------------------------------------------------------------------ */

export function Pill({ label, t = 'neutral', icon }: { label: string; t?: SeverityTone; icon?: IconName }) {
  return (
    <View style={[styles.pill, { backgroundColor: tone[t].bg }]}>
      {icon ? <Ionicons name={icon} size={14} color={tone[t].fg} /> : null}
      <Text style={[type.caption, { color: tone[t].fg }]}>{label}</Text>
    </View>
  );
}

export const SEVERITY_LABEL: Record<'green' | 'yellow' | 'red', string> = {
  green: 'Sem divergências',
  yellow: 'Revisar',
  red: 'Atenção',
};
export const SEVERITY_ICON: Record<'green' | 'yellow' | 'red', IconName> = {
  green: 'checkmark-circle',
  yellow: 'alert-circle',
  red: 'warning',
};

/**
 * Se o conteúdo é só texto — uma string, ou texto misturado com variáveis, que o JSX entrega como
 * uma lista de pedaços. Esse conteúdo precisa ir dentro de um <T>: solto numa <View>, a web o
 * mostra na fonte do navegador e o React Native recusa texto fora de <Text>.
 */
export function soTexto(children: ReactNode): boolean {
  const partes = Children.toArray(children);
  return partes.length > 0 && partes.every((p) => typeof p === 'string' || typeof p === 'number');
}

export function Banner({ t = 'navy', icon = 'information-circle', title, children, action }: { t?: SeverityTone; icon?: IconName; title?: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <View style={[styles.banner, { backgroundColor: tone[t].bg }]} accessibilityRole="alert">
      <Ionicons name={icon} size={22} color={tone[t].fg} style={{ marginTop: 1 }} />
      <View style={{ flex: 1, gap: 2 }}>
        {title ? <T v="bodyStrong" color={tone[t].fg}>{title}</T> : null}
        {soTexto(children) ? <T v="small" color={colors.text}>{children}</T> : children}
        {action}
      </View>
    </View>
  );
}

export function EmptyState({ icon, title, text, action }: { icon: IconName; title: string; text?: string; action?: ReactNode }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={30} color={colors.action} />
      </View>
      <T v="heading" center>{title}</T>
      {text ? <T v="small" color={colors.textMuted} center>{text}</T> : null}
      {action}
    </View>
  );
}

export function KeyValue({ label, value, strong }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <Row style={{ justifyContent: 'space-between' }}>
      <T v="small" color={colors.textMuted}>{label}</T>
      {typeof value === 'string' ? <T v={strong ? 'bodyStrong' : 'body'}>{value}</T> : value}
    </Row>
  );
}

/* ------------------------------------------------------------------ */
/* Formulários                                                         */
/* ------------------------------------------------------------------ */

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  error,
  hint,
  prefix,
  suffix,
  autoFocus,
  secureTextEntry,
  autoCapitalize,
  multiline,
  testID,
}: {
  label: string;
  value: string;
  onChangeText: (s: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  error?: string | null;
  hint?: string;
  prefix?: string;
  suffix?: string;
  autoFocus?: boolean;
  secureTextEntry?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  multiline?: boolean;
  testID?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <T v="small" style={{ fontWeight: '600' }}>{label}</T>
      <View
        style={[
          styles.input,
          focused && styles.inputFocused,
          error ? styles.inputError : null,
          multiline && { minHeight: 88, alignItems: 'flex-start', paddingVertical: space.md },
        ]}
      >
        {prefix ? <T color={colors.textMuted}>{prefix}</T> : null}
        <TextInput
          testID={testID}
          accessibilityLabel={label}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textFaint}
          keyboardType={keyboardType}
          autoFocus={autoFocus}
          secureTextEntry={secureTextEntry}
          autoCapitalize={autoCapitalize}
          multiline={multiline}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[type.body, { flex: 1, color: colors.text, paddingVertical: 0 }, semAnelDoNavegador]}
        />
        {suffix ? <T color={colors.textMuted}>{suffix}</T> : null}
      </View>
      {error ? (
        <Row gap={6}>
          <Ionicons name="alert-circle" size={16} color={colors.redText} />
          <T v="small" color={colors.redText} style={{ flex: 1 }}>{error}</T>
        </Row>
      ) : hint ? (
        <T v="small" color={colors.textMuted}>{hint}</T>
      ) : null}
    </View>
  );
}

export function Segmented<T extends string>({ options, value, onChange, label }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label?: string }) {
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={[type.small, { fontWeight: '600', color: colors.text }]}>{label}</Text> : null}
      <View style={styles.segmented} accessibilityRole="radiogroup">
        {options.map((o) => {
          const active = o.value === value;
          return (
            <Pressable
              key={o.value}
              onPress={() => onChange(o.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              style={[styles.segment, active && styles.segmentActive]}
            >
              <Text style={[type.small, { fontSize: 15, fontWeight: '600', color: active ? colors.onAction : colors.textMuted }]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function Stepper({ onMinus, onPlus, label, minusIcon = 'remove' }: { onMinus: () => void; onPlus: () => void; label: string; minusIcon?: IconName }) {
  return (
    <View style={styles.stepper}>
      <IconButton icon={minusIcon} onPress={onMinus} label="Diminuir quantidade" size={20} />
      <Text style={[type.bodyStrong, { minWidth: 64, textAlign: 'center', color: colors.text, fontVariant: ['tabular-nums'] }]}>{label}</Text>
      <IconButton icon="add" onPress={onPlus} label="Aumentar quantidade" size={20} />
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Diálogo                                                             */
/* ------------------------------------------------------------------ */

export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title: string; children: ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Fechar" />
      <View style={styles.sheet}>
        <View style={styles.sheetHandle} />
        <Row style={{ justifyContent: 'space-between' }}>
          <T v="title" style={{ flex: 1 }}>{title}</T>
          <IconButton icon="close" onPress={onClose} label="Fechar" />
        </Row>
        <ScrollView contentContainerStyle={{ gap: space.md, paddingBottom: space.xl }} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </View>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Cupom                                                               */
/* ------------------------------------------------------------------ */

const DENTE = 18;
const ALTURA_DENTE = 9;

/** Pontos da borda serrilhada (a mesma do logotipo), ajustados para fechar na largura exata. */
export function serrilha(largura: number, dente = DENTE, altura = ALTURA_DENTE): string {
  const n = Math.max(1, Math.round(largura / dente));
  const passo = largura / n;
  const pontos = ['0,0', `${largura},0`];
  for (let i = n; i > 0; i--) pontos.push(`${(i - 0.5) * passo},${altura}`, `${(i - 1) * passo},0`);
  return pontos.join(' ');
}

/**
 * O resultado da conferência desenhado como um cupom fiscal: cantos de cima arredondados e a
 * borda de baixo serrilhada. É o único lugar do app com a serrilha.
 */
export function Cupom({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const [largura, setLargura] = useState(0);
  return (
    <View style={[styles.cupomSombra, style]} onLayout={(e) => setLargura(e.nativeEvent.layout.width)}>
      <View style={styles.cupom}>{children}</View>
      {largura > 0 ? (
        <Svg width={largura} height={ALTURA_DENTE} style={{ marginTop: -0.5 }}>
          <Polygon points={serrilha(largura)} fill={colors.surface} />
        </Svg>
      ) : null}
    </View>
  );
}

/** Linha picotada que separa o número principal do cupom dos totais. */
export function Picote() {
  return <View style={styles.picote} />;
}

export function Loading({ text }: { text?: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xl, backgroundColor: colors.bg }}>
      <ActivityIndicator size="large" color={colors.action} />
      {text ? <T color={colors.textMuted} center>{text}</T> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    padding: space.lg,
    paddingTop: space.md,
    gap: space.sm,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  button: {
    minHeight: 52,
    borderRadius: radius.md,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    borderWidth: 1,
  },
  buttonCompact: { minHeight: 44, paddingHorizontal: 14 },
  iconButton: { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  banner: { flexDirection: 'row', gap: space.md, paddingVertical: space.md, paddingHorizontal: 14, borderRadius: radius.md, alignItems: 'flex-start' },
  empty: { alignItems: 'center', gap: space.sm, paddingVertical: space.xxl, paddingHorizontal: space.lg },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.actionSoft, alignItems: 'center', justifyContent: 'center', marginBottom: space.xs },
  input: {
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderField,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  // Foco e erro engrossam a borda sem mexer no tamanho: 1px de borda + 1px de contorno por fora.
  inputFocused: { borderColor: colors.action, outlineColor: colors.action, outlineStyle: 'solid', outlineWidth: 1 },
  inputError: { borderColor: colors.redText, outlineColor: colors.redText, outlineStyle: 'solid', outlineWidth: 1 },
  segmented: { flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 4, gap: 4 },
  segment: { flex: 1, minHeight: 42, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  segmentActive: { backgroundColor: colors.action },
  stepper: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderField, minHeight: touchTarget },
  backdrop: { flex: 1, backgroundColor: colors.scrim },
  sheet: {
    maxHeight: '88%',
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.lg,
    gap: space.md,
    ...floating,
  },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderField, alignSelf: 'center', marginBottom: space.xs },
  cupomSombra: { filter: 'drop-shadow(0px 1px 1px rgba(17, 32, 26, 0.14)) drop-shadow(0px 10px 18px rgba(17, 32, 26, 0.14))' },
  cupom: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingTop: 20,
    paddingHorizontal: space.lg,
    paddingBottom: space.lg,
    gap: space.md,
  },
  picote: { borderTopWidth: 1.5, borderStyle: 'dashed', borderColor: colors.border, marginVertical: space.xs },
});
