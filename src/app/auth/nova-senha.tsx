import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { passwordProblem, passwordStrength } from '@/domain/auth';
import { isCloudConfigured } from '@/lib/config';
import { setNewPassword } from '@/services/auth';
import { useApp } from '@/state/AppContext';
import { AccountHeader, AccountScreen, CloudOff, StrengthMeter } from '@/ui/account';
import { GradientButton, SoftField, SoftLink, SoftNote } from '@/ui/soft';

/**
 * Chegada do link de recuperação: o Supabase já abriu uma sessão temporária para este
 * endereço, e aqui a pessoa grava a nova senha. Sem essa sessão, não há o que gravar.
 */
export default function NovaSenha() {
  const { session } = useApp();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const toLogin = () => router.replace('/auth');
  if (!isCloudConfigured()) return <CloudOff onBack={toLogin} />;

  if (!session) {
    return (
      <AccountScreen onBack={toLogin}>
        <AccountHeader
          title="Link expirado"
          subtitle="Este link de recuperação não vale mais. Peça um novo para criar sua senha."
        />
        <GradientButton title="Pedir novo link" onPress={() => router.replace('/auth/recuperar')} />
        <SoftLink title="Voltar para entrar" onPress={toLogin} />
      </AccountScreen>
    );
  }

  const strength = passwordStrength(password);

  const submit = async () => {
    if (busy) return;
    const next: typeof errors = {};
    const problem = passwordProblem(password);
    if (problem) next.password = problem;
    if (confirm !== password) next.confirm = 'As duas senhas precisam ser iguais.';
    setErrors(next);
    setFailure(null);
    if (Object.keys(next).length > 0) return;

    setBusy(true);
    try {
      await setNewPassword(password);
      setDone(true);
      setTimeout(() => router.replace('/profile'), 900);
    } catch (e) {
      setFailure(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AccountScreen>
      <AccountHeader title="Criar nova senha" subtitle="Escolha uma senha que você lembre e que ninguém adivinhe." />

      <View style={{ gap: 8 }}>
        <SoftField
          label="Nova senha"
          icon="lock-closed-outline"
          value={password}
          onChangeText={(v) => {
            setPassword(v);
            setErrors((e) => ({ ...e, password: undefined }));
          }}
          secure
          autoComplete="password-new"
          textContentType="newPassword"
          error={errors.password}
          hint={password ? undefined : 'Pelo menos 8 caracteres, com letras e números.'}
          autoFocus
        />
        {password ? <StrengthMeter strength={strength} /> : null}
      </View>

      <SoftField
        label="Confirmar nova senha"
        icon="shield-checkmark-outline"
        value={confirm}
        onChangeText={(v) => {
          setConfirm(v);
          setErrors((e) => ({ ...e, confirm: undefined }));
        }}
        secure
        autoComplete="password-new"
        textContentType="newPassword"
        returnKeyType="done"
        onSubmitEditing={submit}
        error={errors.confirm}
      />

      {failure ? <SoftNote tone="red">{failure}</SoftNote> : null}
      {done ? <SoftNote tone="green">Senha alterada. Abrindo suas compras…</SoftNote> : null}

      <GradientButton title="Salvar nova senha" onPress={submit} loading={busy} disabled={done} tone="green" icon="checkmark" />
    </AccountScreen>
  );
}
