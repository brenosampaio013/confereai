import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { isValidEmail, passwordProblem, passwordStrength } from '@/domain/auth';
import { isCloudConfigured } from '@/lib/config';
import { signUp } from '@/services/auth';
import { useApp } from '@/state/AppContext';
import { AccountHeader, AccountScreen, CloudOff, StrengthMeter, SwapLine } from '@/ui/account';
import { GradientButton, SoftCheck, SoftField, SoftNote } from '@/ui/soft';
import { colors, type } from '@/ui/theme';

type Errors = { name?: string; email?: string; password?: string; confirm?: string; terms?: string };

export default function CriarConta() {
  const { bump } = useApp();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/auth'));
  if (!isCloudConfigured()) return <CloudOff onBack={back} />;

  const strength = passwordStrength(password);
  const clear = (k: keyof Errors) => setErrors((e) => (e[k] ? { ...e, [k]: undefined } : e));

  const submit = async () => {
    if (busy) return;
    const next: Errors = {};
    if (name.trim().length < 2) next.name = 'Informe seu nome.';
    if (!isValidEmail(email)) next.email = 'Informe um e-mail válido, como nome@provedor.com.';
    const problem = passwordProblem(password);
    if (problem) next.password = problem;
    if (confirm !== password) next.confirm = 'As duas senhas precisam ser iguais.';
    if (!accepted) next.terms = 'Para criar a conta, aceite a política de privacidade.';
    setErrors(next);
    setFailure(null);
    if (Object.keys(next).length > 0) return;

    setBusy(true);
    try {
      const outcome = await signUp(name, email, password);
      bump();
      if (outcome.kind === 'entrou') router.replace('/profile');
      else router.replace({ pathname: '/auth/confirmar', params: { email: outcome.email } });
    } catch (e) {
      setFailure(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AccountScreen
      onBack={back}
      footer={<SwapLine text="Já tem uma conta?" action="Entrar" onPress={back} />}
    >
      <AccountHeader title="Crie sua conta" subtitle="Comece a organizar suas compras e a economizar de verdade." />

      <SoftField
        label="Nome completo"
        icon="person-outline"
        value={name}
        onChangeText={(v) => {
          setName(v);
          clear('name');
        }}
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
        error={errors.name}
      />

      <SoftField
        label="E-mail"
        icon="mail-outline"
        value={email}
        onChangeText={(v) => {
          setEmail(v);
          clear('email');
        }}
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        error={errors.email}
      />

      <View style={{ gap: 8 }}>
        <SoftField
          label="Senha"
          icon="lock-closed-outline"
          value={password}
          onChangeText={(v) => {
            setPassword(v);
            clear('password');
          }}
          secure
          autoComplete="password-new"
          textContentType="newPassword"
          error={errors.password}
          hint={password ? undefined : 'Pelo menos 8 caracteres, com letras e números.'}
        />
        {password ? <StrengthMeter strength={strength} /> : null}
      </View>

      <SoftField
        label="Confirmar senha"
        icon="shield-checkmark-outline"
        value={confirm}
        onChangeText={(v) => {
          setConfirm(v);
          clear('confirm');
        }}
        secure
        autoComplete="password-new"
        textContentType="newPassword"
        returnKeyType="done"
        onSubmitEditing={submit}
        error={errors.confirm}
      />

      <View style={{ gap: 6 }}>
        <SoftCheck
          checked={accepted}
          onChange={(v) => {
            setAccepted(v);
            clear('terms');
          }}
          label="Li e aceito a política de privacidade"
        >
          <Text style={[type.small, { color: colors.text, flex: 1 }]}>
            Li e aceito a{' '}
            <Text
              style={{ color: colors.action, fontWeight: '700' }}
              accessibilityRole="link"
              onPress={() => router.push('/privacy')}
            >
              política de privacidade
            </Text>{' '}
            do Meu Carrin.
          </Text>
        </SoftCheck>
        {errors.terms ? <SoftNote tone="red">{errors.terms}</SoftNote> : null}
      </View>

      {failure ? <SoftNote tone="red">{failure}</SoftNote> : null}

      <GradientButton title="Criar minha conta" onPress={submit} loading={busy} />
    </AccountScreen>
  );
}
