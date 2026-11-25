import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { isValidEmail } from '@/domain/auth';
import { isCloudConfigured } from '@/lib/config';
import { signIn } from '@/services/auth';
import { getSessionPersistence } from '@/services/secureStorage';
import { useApp } from '@/state/AppContext';
import { AccountHeader, AccountScreen, CloudOff, SwapLine } from '@/ui/account';
import { GradientButton, Plate, SoftCheck, SoftField, SoftLink, SoftNote } from '@/ui/soft';
import { colors, space, type } from '@/ui/theme';

/**
 * Volta para onde a pessoa estava. Quem abre esta tela direto pelo endereço — pelo botão
 * "Abrir o app" da landing, por exemplo — não tem para onde voltar: vai para a tela inicial,
 * que é onde uma compra começa.
 */
function leave() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

export default function Entrar() {
  const { session, isAnonymous, bump } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // A escolha anterior da caixa "manter conectado" vem do armazenamento do aparelho.
    getSessionPersistence().then(setRemember, () => {});
  }, []);

  if (!isCloudConfigured()) return <CloudOff onBack={leave} />;

  if (session && !isAnonymous) {
    return (
      <AccountScreen onBack={leave} backLabel="Fechar">
        <AccountHeader title="Você já está conectado" subtitle="Suas compras estão sendo guardadas nesta conta." />
        <Plate inset style={{ padding: space.lg, alignItems: 'center' }}>
          <Text style={[type.bodyStrong, { color: colors.action }]}>{session.user.email}</Text>
        </Plate>
        <GradientButton title="Voltar ao aplicativo" onPress={leave} icon="arrow-back" />
      </AccountScreen>
    );
  }

  const submit = async () => {
    if (busy) return;
    const next: typeof errors = {};
    if (!isValidEmail(email)) next.email = 'Informe um e-mail válido, como nome@provedor.com.';
    if (!password) next.password = 'Digite sua senha.';
    setErrors(next);
    setFailure(null);
    if (Object.keys(next).length > 0) return;

    setBusy(true);
    try {
      await signIn(email, password, remember);
      setDone(true);
      bump();
      setTimeout(leave, 700);
    } catch (e) {
      setFailure(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AccountScreen
      onBack={leave}
      backLabel="Fechar"
      footer={<SwapLine text="Ainda não tem conta?" action="Criar conta" onPress={() => router.push('/auth/criar-conta')} />}
    >
      <AccountHeader title="Que bom te ver de novo" subtitle="Entre na sua conta e continue organizando suas compras." />

      <SoftField
        label="E-mail"
        icon="mail-outline"
        value={email}
        onChangeText={(v) => {
          setEmail(v);
          if (errors.email) setErrors((e) => ({ ...e, email: undefined }));
        }}
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        error={errors.email}
        testID="campo-email"
      />

      <SoftField
        label="Senha"
        icon="lock-closed-outline"
        value={password}
        onChangeText={(v) => {
          setPassword(v);
          if (errors.password) setErrors((e) => ({ ...e, password: undefined }));
        }}
        secure
        autoComplete="password"
        textContentType="password"
        returnKeyType="done"
        onSubmitEditing={submit}
        error={errors.password}
        testID="campo-senha"
      />

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, justifyContent: 'space-between' }}>
        <SoftCheck checked={remember} onChange={setRemember} label="Manter conectado" />
        <SoftLink title="Esqueci a senha" onPress={() => router.push('/auth/recuperar')} strong align="right" />
      </View>

      {failure ? <SoftNote tone="red">{failure}</SoftNote> : null}
      {done ? <SoftNote tone="green">Tudo certo. Abrindo suas compras…</SoftNote> : null}

      <GradientButton title="Entrar" onPress={submit} loading={busy} disabled={done} testID="botao-entrar" />

      <SoftLink title="Continuar sem conta" onPress={leave} />
    </AccountScreen>
  );
}
