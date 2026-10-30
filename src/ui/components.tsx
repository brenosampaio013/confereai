import { Ionicons } from '@expo/vector-icons';
import { ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardTypeOptions,
  Modal,
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
import { Cents, formatBRL, formatSignedBRL } from '@/domain/money';
import { colors, radius, shadow, space, SeverityTone, tone, type } from './theme';

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
        style={({ pressed }) => [styles.card, shadow, pressed && { opacity: 0.85 }, style]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, shadow, style]}>{children}</View>;
}

export function Row({ children, style, gap = space.sm }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <Row style={{ justifyContent: 'space-between', marginTop: space.sm }}>
      <T v="caption" color={colors.textMuted} style={{ textTransform: 'uppercase' }}>
        {children}
      </T>
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

type ButtonKind = 'primary' | 'confirm' | 'secondary' | 'ghost' | 'danger';
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
}) {
  const palette = {
    primary: { bg: colors.navy, pressed: colors.navyPressed, fg: colors.white, border: colors.navy },
    confirm: { bg: colors.green, pressed: colors.greenPressed, fg: colors.white, border: colors.green },
    secondary: { bg: colors.surface, pressed: colors.navySoft, fg: colors.navy, border: colors.border },
    ghost: { bg: 'transparent', pressed: colors.navySoft, fg: colors.navy, border: 'transparent' },
    danger: { bg: colors.surface, pressed: colors.redSoft, fg: colors.redText, border: colors.border },
  }[kind];
  const off = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        { backgroundColor: pressed ? palette.pressed : palette.bg, borderColor: palette.border },
        off && { opacity: 0.5 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={compact ? 18 : 21} color={palette.fg} /> : null}
          <Text style={[type.bodyStrong, { color: palette.fg, textAlign: 'center', flexShrink: 1 }]} numberOfLines={2}>
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}

export function IconButton({ icon, onPress, label, color = colors.navy, size = 24, bg }: { icon: IconName; onPress: () => void; label: string; color?: string; size?: number; bg?: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={({ pressed }) => [styles.iconButton, { backgroundColor: bg ?? 'transparent' }, pressed && { opacity: 0.6 }]}
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
      {icon ? <Ionicons name={icon} size={13} color={tone[t].fg} /> : null}
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

export function Banner({ t = 'navy', icon = 'information-circle', title, children, action }: { t?: SeverityTone; icon?: IconName; title?: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <View style={[styles.banner, { backgroundColor: tone[t].bg }]} accessibilityRole="alert">
      <Ionicons name={icon} size={22} color={tone[t].fg} style={{ marginTop: 1 }} />
      <View style={{ flex: 1, gap: 2 }}>
        {title ? <T v="bodyStrong" color={tone[t].fg}>{title}</T> : null}
        {typeof children === 'string' ? <T v="small" color={tone[t].fg}>{children}</T> : children}
        {action}
      </View>
    </View>
  );
}

export function EmptyState({ icon, title, text, action }: { icon: IconName; title: string; text?: string; action?: ReactNode }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={30} color={colors.navy} />
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
  return (
    <View style={{ gap: 6 }}>
      <T v="small" style={{ fontWeight: '600' }}>{label}</T>
      <View style={[styles.input, error ? { borderColor: colors.red } : null, multiline && { minHeight: 88, alignItems: 'flex-start' }]}>
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
          style={[type.body, { flex: 1, color: colors.text, paddingVertical: 0 }]}
        />
        {suffix ? <T color={colors.textMuted}>{suffix}</T> : null}
      </View>
      {error ? <T v="small" color={colors.redText}>{error}</T> : hint ? <T v="small" color={colors.textMuted}>{hint}</T> : null}
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
              <Text style={[type.small, { fontWeight: '600', color: active ? colors.white : colors.navy }]}>{o.label}</Text>
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

export function Loading({ text }: { text?: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xl, backgroundColor: colors.bg }}>
      <ActivityIndicator size="large" color={colors.navy} />
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
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  button: {
    minHeight: 54,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    borderWidth: 1,
  },
  buttonCompact: { minHeight: 44, paddingHorizontal: space.md },
  iconButton: { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  banner: { flexDirection: 'row', gap: space.md, padding: space.md, borderRadius: radius.md, alignItems: 'flex-start' },
  empty: { alignItems: 'center', gap: space.sm, paddingVertical: space.xl, paddingHorizontal: space.lg },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.navySoft, alignItems: 'center', justifyContent: 'center', marginBottom: space.xs },
  input: {
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  segmented: { flexDirection: 'row', backgroundColor: colors.navySoft, borderRadius: radius.md, padding: 4, gap: 4 },
  segment: { flex: 1, minHeight: 42, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  segmentActive: { backgroundColor: colors.navy },
  stepper: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  backdrop: { flex: 1, backgroundColor: 'rgba(8, 20, 33, 0.45)' },
  sheet: {
    maxHeight: '88%',
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.lg + 4,
    borderTopRightRadius: radius.lg + 4,
    padding: space.lg,
    gap: space.md,
  },
});
