import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { isCloudConfigured } from '@/lib/config';
import { resendConfirmation } from '@/services/auth';
import { AccountHeader, AccountScreen, CloudOff } from '@/ui/account';
import { GradientButton, Plate, SoftButton, SoftLink, SoftNote } from '@/ui/soft';
import { colors, space, type } from '@/ui/theme';

/** Espera entre reenvios, em segundos: o servidor também limita, e avisar antes evita erro. */
const WAIT = 60;

export default function Confirmar() {
  const { email } = useLocalSearchParams<{ email?: string }>();
  const [left, setLeft] = useState(WAIT);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: 'green' | 'red'; text: string } | null>(null);

  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);

  const toLogin = () => router.replace('/auth');
  if (!isCloudConfigured()) return <CloudOff onBack={toLogin} />;

  const resend = async () => {
    if (busy || left > 0 || !email) return;
    setBusy(true);
    setNote(null);
    try {
      await resendConfirmation(email);
      setNote({ tone: 'green', text: 'Enviamos o e-mail de novo. Confira sua caixa de entrada.' });
      setLeft(WAIT);
    } catch (e) {
      setNote({ tone: 'red', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AccountScreen>
      <AccountHeader
        done
        title="Conta criada"
        subtitle="Falta um passo: confirme o endereço para a conta ficar ativa."
      />

      <Plate inset style={{ padding: space.lg, alignItems: 'center', gap: 6 }}>
        <Text style={[type.small, { color: colors.textMuted }]}>Enviamos um link de confirmação para</Text>
        <Text style={[type.bodyStrong, { color: colors.navy }]} numberOfLines={2}>
          {email ?? 'seu e-mail'}
        </Text>
      </Plate>

      <View style={{ gap: space.sm }}>
        {[
          'Abra o e-mail e toque no link de confirmação.',
          'Volte aqui e entre com seu e-mail e senha.',
          'Não chegou? Procure na caixa de spam antes de reenviar.',
        ].map((line, i) => (
          <View key={line} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
            <Text style={[type.small, { color: colors.textMuted, fontWeight: '700', fontVariant: ['tabular-nums'], width: 16 }]}>{i + 1}</Text>
            <Text style={[type.small, { color: colors.textMuted, flex: 1 }]}>{line}</Text>
          </View>
        ))}
      </View>

      {note ? <SoftNote tone={note.tone}>{note.text}</SoftNote> : null}

      <GradientButton title="Já confirmei, quero entrar" onPress={toLogin} />

      {email ? (
        <SoftButton
          title={left > 0 ? `Reenviar e-mail em ${left}s` : 'Reenviar e-mail'}
          onPress={resend}
          icon="refresh-outline"
          loading={busy}
          disabled={left > 0}
        />
      ) : null}

      <SoftLink title="Usar outro e-mail" onPress={() => router.replace('/auth/criar-conta')} />
    </AccountScreen>
  );
}
