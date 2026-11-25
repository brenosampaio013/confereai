import { Ionicons } from '@expo/vector-icons';
import { ReactNode, useState } from 'react';
import {
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
import { Button } from './components';
import { colors, radius, space, type } from './theme';

/**
 * Peças das telas de conta (entrar, criar conta, recuperar, confirmar).
 *
 * Até a versão 2.0 tinham visual próprio, azulado e em relevo. Agora seguem o design system do
 * resto do app: os mesmos campos, botões e avisos. Os nomes e as opções continuam os mesmos para
 * não mexer nas telas.
 */

/** Na web o navegador desenha o próprio anel de foco dentro do campo; a borda já mostra o foco. */
const semAnelDoNavegador =
  Platform.OS === 'web' ? ({ outlineStyle: 'none' } as unknown as { outlineWidth: number }) : null;

export type IconName = keyof typeof Ionicons.glyphMap;

/* ------------------------------------------------------------------ */
/* Fundo e estrutura                                                   */
/* ------------------------------------------------------------------ */

/** Tela de conta: fundo do app e uma coluna central de 400 px. */
export function SoftScreen({ children, footer, corner }: { children: ReactNode; footer?: ReactNode; corner?: ReactNode }) {
  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
      {corner ? <View style={styles.corner}>{corner}</View> : null}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.column}>{children}</View>
        </ScrollView>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Superfície de apoio. `inset` é a versão recolhida (para textos de explicação). */
export function Plate({
  children,
  style,
  inset,
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Mantido por compatibilidade: o relevo deixou de existir. */
  level?: 1 | 2 | 3;
  inset?: boolean;
}) {
  return <View style={[styles.plate, inset && styles.plateInset, style]}>{children}</View>;
}

/** Cabeçalho das telas de conta: a marca, o título e uma linha de explicação. */
export function SoftHeader({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <View style={styles.header}>
      <View style={styles.badge}>{children}</View>
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
    <View style={{ gap: 6 }}>
      <Text style={styles.fieldLabel} numberOfLines={1}>
        {label}
      </Text>
      <View style={[styles.field, focused && styles.fieldFocused, !!error && styles.fieldError]}>
        <Ionicons name={icon} size={20} color={error ? colors.redText : focused ? colors.action : colors.textMuted} />
        <TextInput
          testID={testID}
          accessibilityLabel={label}
          accessibilityHint={hint}
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          placeholderTextColor={colors.textFaint}
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
            <Ionicons name={hidden ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <View style={styles.fieldNote} accessibilityRole="alert" accessibilityLiveRegion="polite">
          <Ionicons name="alert-circle" size={16} color={colors.redText} />
          <Text style={[type.small, { color: colors.redText, flex: 1 }]}>{error}</Text>
        </View>
      ) : hint ? (
        <Text style={[type.small, { color: colors.textMuted }]}>{hint}</Text>
      ) : null}
    </View>
  );
}

/** Caixa de seleção; marcada, fica verde floresta com o visto branco. */
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
        {checked ? <Ionicons name="checkmark" size={16} color={colors.onAction} /> : null}
      </View>
      {children ?? <Text style={[type.small, { color: colors.text, flex: 1 }]}>{label}</Text>}
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* Ações                                                               */
/* ------------------------------------------------------------------ */

/**
 * Ação principal da tela de conta: o botão principal do app. `tone="green"` é o botão de
 * confirmar (verde claro), para o fim de um fluxo que deu certo.
 */
export function GradientButton({
  title,
  onPress,
  loading,
  disabled,
  icon = null,
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
  return (
    <Button
      title={title}
      onPress={onPress}
      loading={loading}
      disabled={disabled}
      icon={icon ?? undefined}
      kind={tone === 'green' ? 'confirm' : 'primary'}
      testID={testID}
    />
  );
}

/** Ação secundária: o botão secundário do app. */
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
  return <Button title={title} onPress={onPress} icon={icon} loading={loading} disabled={disabled} kind="secondary" />;
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
            { color: strong ? colors.action : colors.textMuted, fontWeight: strong ? '700' : '600' },
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

/** Aviso de erro, sucesso ou informação: o mesmo desenho do aviso do app. */
export function SoftNote({ tone, children }: { tone: 'red' | 'green' | 'navy'; children: ReactNode }) {
  const skin = {
    red: { bg: colors.redSoft, fg: colors.redText, icon: 'alert-circle' as IconName },
    green: { bg: colors.greenSoft, fg: colors.greenText, icon: 'checkmark-circle' as IconName },
    navy: { bg: colors.actionSoft, fg: colors.action, icon: 'information-circle' as IconName },
  }[tone];
  return (
    <View style={[styles.note, { backgroundColor: skin.bg }]} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Ionicons name={skin.icon} size={20} color={skin.fg} style={{ marginTop: 1 }} />
      <Text style={[type.small, { color: colors.text, flex: 1 }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  corner: { position: 'absolute', top: space.md, left: space.lg, zIndex: 3 },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: space.xl, paddingVertical: space.xxl },
  column: { width: '100%', maxWidth: 400, alignSelf: 'center', gap: space.lg },
  footer: { paddingHorizontal: space.xl, paddingBottom: space.md, alignItems: 'center' },
  plate: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  plateInset: { backgroundColor: colors.surfaceAlt },
  header: { alignItems: 'center', gap: space.sm, marginBottom: space.sm },
  badge: { alignItems: 'center', justifyContent: 'center', marginBottom: space.sm },
  title: { ...type.display, color: colors.text, textAlign: 'center' },
  subtitle: { ...type.body, fontSize: 15, lineHeight: 22, color: colors.textMuted, textAlign: 'center', maxWidth: 330 },
  fieldLabel: { ...type.small, fontWeight: '600', color: colors.text },
  field: {
    minHeight: 52,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderField,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  fieldFocused: { borderColor: colors.action, outlineColor: colors.action, outlineStyle: 'solid', outlineWidth: 1 },
  fieldError: { borderColor: colors.redText, outlineColor: colors.redText, outlineStyle: 'solid', outlineWidth: 1 },
  input: { ...type.body, flex: 1, color: colors.text, paddingVertical: 13 },
  eye: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -10 },
  fieldNote: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1, minHeight: 44 },
  checkBox: { width: 24, height: 24, borderRadius: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  checkBoxOff: { backgroundColor: colors.surface, borderColor: colors.borderField },
  checkBoxOn: { backgroundColor: colors.action, borderColor: colors.action },
  note: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start', borderRadius: radius.md, paddingVertical: space.md, paddingHorizontal: 14 },
});
