import { router } from 'expo-router';
import { useState } from 'react';
import { isValidEmail } from '@/domain/auth';
import { isCloudConfigured } from '@/lib/config';
import { sendPasswordReset } from '@/services/auth';
import { AccountHeader, AccountScreen, CloudOff, SwapLine } from '@/ui/account';
import { Text } from 'react-native';
import { GradientButton, Plate, SoftField, SoftNote } from '@/ui/soft';
import { colors, space, type } from '@/ui/theme';

export default function Recuperar() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/auth'));
  if (!isCloudConfigured()) return <CloudOff onBack={back} />;

  const submit = async () => {
    if (busy) return;
    if (!isValidEmail(email)) return setError('Informe um e-mail válido, como nome@provedor.com.');
    setError(null);
    setFailure(null);
    setBusy(true);
    try {
      await sendPasswordReset(email);
      setSent(true);
    } catch (e) {
      setFailure(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <AccountScreen onBack={back}>
        <AccountHeader
          done
          title="Link enviado"
          subtitle="Se houver uma conta com este e-mail, o link para criar uma nova senha chega em instantes."
        />
        <Plate inset style={{ padding: space.lg, alignItems: 'center', gap: 4 }}>
          <Text style={[type.bodyStrong, { color: colors.navy }]}>{email.trim()}</Text>
          <Text style={[type.small, { color: colors.textMuted, textAlign: 'center' }]}>
            O link vale por uma hora. Se não aparecer, procure na caixa de spam.
          </Text>
        </Plate>
        <SoftNote tone="green">Confira seu e-mail e volte aqui depois de criar a nova senha.</SoftNote>
        <GradientButton title="Voltar para entrar" onPress={back} icon="arrow-back" />
      </AccountScreen>
    );
  }

  return (
    <AccountScreen onBack={back} footer={<SwapLine text="Lembrou a senha?" action="Entrar" onPress={back} />}>
      <AccountHeader
        title="Recuperar senha"
        subtitle="Sem problema. Vamos ajudar você a recuperar o acesso à sua conta."
      />

      <SoftField
        label="E-mail"
        icon="mail-outline"
        value={email}
        onChangeText={(v) => {
          setEmail(v);
          if (error) setError(null);
        }}
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="send"
        onSubmitEditing={submit}
        error={error}
        autoFocus
      />

      {failure ? <SoftNote tone="red">{failure}</SoftNote> : null}

      <GradientButton title="Enviar link" onPress={submit} loading={busy} icon="paper-plane-outline" />
    </AccountScreen>
  );
}
