import * as Linking from 'expo-linking';
import { translateAuthError } from '@/domain/auth';
import { getSupabase } from './supabase';
import { setSessionPersistence } from './secureStorage';

/**
 * Operações de conta sobre o Supabase Auth. As telas chamam só estas funções:
 * elas falham com mensagens já traduzidas e nunca inventam sucesso.
 *
 * A senha nunca passa pelo banco do aplicativo nem é guardada aqui — quem a
 * recebe, confere e armazena (em forma de hash) é o serviço de autenticação.
 */

function client() {
  const sb = getSupabase();
  if (!sb) throw new Error('O servidor de contas ainda não foi configurado neste aplicativo.');
  return sb;
}

const fail = (e: unknown): never => {
  throw new Error(translateAuthError(e instanceof Error ? e.message : String(e)));
};

/** Endereço de volta dos e-mails: a origem atual na web, o esquema meucarrin:// no celular. */
const linkTo = (path: string) => Linking.createURL(path);

/** Entra com e-mail e senha. `remember` decide se a sessão sobrevive ao fechar o aplicativo. */
export async function signIn(email: string, password: string, remember: boolean): Promise<void> {
  await setSessionPersistence(remember);
  const { error } = await client().auth.signInWithPassword({ email: email.trim(), password });
  if (error) fail(error);
}

export type SignUpOutcome =
  /** O projeto não exige confirmação: a pessoa já entrou. */
  | { kind: 'entrou' }
  /** Falta confirmar o e-mail antes de entrar. */
  | { kind: 'confirmar'; email: string };

/** Cria a conta. O nome fica nos metadados do usuário; a senha vai direto ao serviço de autenticação. */
export async function signUp(name: string, email: string, password: string): Promise<SignUpOutcome> {
  await setSessionPersistence(true);
  const address = email.trim();
  const { data, error } = await client().auth.signUp({
    email: address,
    password,
    options: { data: { full_name: name.trim() }, emailRedirectTo: linkTo('/auth') },
  });
  if (error) fail(error);
  // Conta já existente com confirmação pendente volta sem sessão e com a lista de provedores vazia.
  if (data.user && data.user.identities?.length === 0) {
    throw new Error('Este e-mail já tem conta. Entre com ele ou recupere a senha.');
  }
  return data.session ? { kind: 'entrou' } : { kind: 'confirmar', email: address };
}

/** Envia o link de redefinição. Não revela se o e-mail existe. */
export async function sendPasswordReset(email: string): Promise<void> {
  const { error } = await client().auth.resetPasswordForEmail(email.trim(), { redirectTo: linkTo('/auth/nova-senha') });
  if (error) fail(error);
}

/** Reenvia o e-mail de confirmação do cadastro. */
export async function resendConfirmation(email: string): Promise<void> {
  const { error } = await client().auth.resend({
    type: 'signup',
    email: email.trim(),
    options: { emailRedirectTo: linkTo('/auth') },
  });
  if (error) fail(error);
}

/** Grava a nova senha. Exige a sessão aberta pelo link de recuperação. */
export async function setNewPassword(password: string): Promise<void> {
  const { error } = await client().auth.updateUser({ password });
  if (error) fail(error);
}
