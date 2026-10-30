import { router } from 'expo-router';
import { useState } from 'react';
import { isCloudConfigured } from '@/lib/config';
import { getSupabase } from '@/services/supabase';
import { useApp } from '@/state/AppContext';
import { Banner, Button, Field, Screen, Segmented, T } from '@/ui/components';
import { colors } from '@/ui/theme';

type Mode = 'login' | 'signup' | 'reset';

export default function AuthScreen() {
  const { bump } = useApp();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ t: 'green' | 'red'; text: string } | null>(null);

  if (!isCloudConfigured()) {
    return (
      <Screen>
        <Banner t="yellow" icon="cloud-offline-outline" title="Contas indisponíveis">
          O servidor (Supabase) ainda não foi configurado neste aplicativo. Você pode continuar usando tudo localmente.
        </Banner>
      </Screen>
    );
  }

  const submit = async () => {
    const sb = getSupabase()!;
    setMessage(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setMessage({ t: 'red', text: 'Informe um e-mail válido.' });
    if (mode !== 'reset' && password.length < 8) return setMessage({ t: 'red', text: 'A senha deve ter pelo menos 8 caracteres.' });
    setBusy(true);
    try {
      if (mode === 'login') {
        const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        bump();
        router.back();
      } else if (mode === 'signup') {
        const { data, error } = await sb.auth.signUp({ email: email.trim(), password });
        if (error) throw error;
        if (data.session) {
          bump();
          router.back();
        } else {
          setMessage({ t: 'green', text: 'Conta criada. Confirme pelo link enviado ao seu e-mail e depois entre.' });
          setMode('login');
        }
      } else {
        const { error } = await sb.auth.resetPasswordForEmail(email.trim());
        if (error) throw error;
        setMessage({ t: 'green', text: 'Se houver uma conta com este e-mail, enviamos um link para redefinir a senha.' });
      }
    } catch (e) {
      setMessage({ t: 'red', text: translate(e instanceof Error ? e.message : String(e)) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Segmented value={mode} onChange={(m) => { setMode(m); setMessage(null); }} options={[{ value: 'login', label: 'Entrar' }, { value: 'signup', label: 'Criar conta' }, { value: 'reset', label: 'Esqueci a senha' }]} />
      <T color={colors.textMuted}>
        {mode === 'signup'
          ? 'A conta serve para sincronizar suas compras com a nuvem. Os dados já salvos neste aparelho serão enviados para a sua conta.'
          : mode === 'reset'
            ? 'Enviaremos um link para você criar uma nova senha.'
            : 'Entre para sincronizar suas compras entre aparelhos.'}
      </T>
      <Field label="E-mail" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
      {mode !== 'reset' ? <Field label="Senha" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" hint={mode === 'signup' ? 'Mínimo de 8 caracteres.' : undefined} /> : null}
      {message ? <Banner t={message.t} icon={message.t === 'green' ? 'checkmark-circle' : 'alert-circle'}>{message.text}</Banner> : null}
      <Button title={mode === 'login' ? 'Entrar' : mode === 'signup' ? 'Criar conta' : 'Enviar link'} kind="confirm" onPress={submit} loading={busy} />
    </Screen>
  );
}

function translate(msg: string) {
  if (/invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos.';
  if (/email not confirmed/i.test(msg)) return 'Confirme seu e-mail antes de entrar.';
  if (/already registered|already been registered/i.test(msg)) return 'Este e-mail já tem uma conta. Use "Entrar".';
  if (/network|fetch/i.test(msg)) return 'Sem conexão com o servidor. Tente novamente.';
  return msg;
}
