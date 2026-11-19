/**
 * Regras das telas de conta, sem dependência de React ou do Supabase: validação do e-mail,
 * exigências da senha e tradução das mensagens do servidor. Coberto por __tests__/domain/auth.test.ts.
 */

/** Exigências mínimas da senha no cadastro. Mantidas em um lugar só para telas e testes. */
export const PASSWORD_MIN = 8;

export function isValidEmail(email: string): boolean {
  const e = email.trim();
  if (e.length < 6 || e.length > 254) return false;
  if (/\s/.test(e)) return false;
  return /^[^@]+@[^@.]+(\.[^@.]+)+$/.test(e);
}

/** O que falta para a senha ser aceita, ou null quando está boa. */
export function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN) return `A senha precisa de pelo menos ${PASSWORD_MIN} caracteres.`;
  if (!/[a-zA-Z]/.test(password)) return 'A senha precisa de pelo menos uma letra.';
  if (!/\d/.test(password)) return 'A senha precisa de pelo menos um número.';
  return null;
}

export type Strength = { score: 0 | 1 | 2 | 3 | 4; label: string; tip: string | null };

const LABEL = ['Muito curta', 'Fraca', 'Média', 'Forte', 'Muito forte'] as const;

/** Força da senha para o medidor: comprimento e variedade de caracteres. */
export function passwordStrength(password: string): Strength {
  if (!password) return { score: 0, label: '', tip: null };
  const variety =
    Number(/[a-z]/.test(password)) +
    Number(/[A-Z]/.test(password)) +
    Number(/\d/.test(password)) +
    Number(/[^a-zA-Z0-9]/.test(password));
  let score = 0;
  if (password.length >= PASSWORD_MIN) {
    score = 1;
    if (password.length >= 12) score += 1;
    if (variety >= 3) score += 1;
    if (variety >= 4 && password.length >= 10) score += 1;
  }
  const s = Math.min(score, 4) as Strength['score'];
  const tip =
    password.length < PASSWORD_MIN
      ? PASSWORD_MIN - password.length === 1
        ? 'Falta 1 caractere.'
        : `Faltam ${PASSWORD_MIN - password.length} caracteres.`
      : s < 3
        ? 'Misture letras maiúsculas, números e símbolos.'
        : null;
  return { score: s, label: LABEL[s], tip };
}

/**
 * Mensagens do Supabase em português, na voz do aplicativo: dizem o que houve e o que fazer.
 * O texto original é devolvido quando não há correspondência — melhor um recado estranho do
 * que um recado errado.
 */
export function translateAuthError(message: string): string {
  const m = message.toLowerCase();
  if (/invalid login credentials|invalid credentials/.test(m)) return 'E-mail ou senha incorretos. Confira e tente de novo.';
  if (/email not confirmed/.test(m)) return 'Confirme seu e-mail pelo link que enviamos antes de entrar.';
  if (/already registered|already been registered|user already exists/.test(m))
    return 'Este e-mail já tem conta. Entre com ele ou recupere a senha.';
  if (/password should be at least|weak.?password/.test(m)) return `Senha muito curta: use pelo menos ${PASSWORD_MIN} caracteres.`;
  if (/same.?password|should be different/.test(m)) return 'A nova senha precisa ser diferente da anterior.';
  if (/unable to validate email|invalid.*email|email.*invalid/.test(m)) return 'E-mail inválido. Confira o endereço.';
  if (/for security purposes.*(\d+) seconds/.test(m)) {
    const s = m.match(/(\d+) seconds/)?.[1];
    return `Aguarde ${s ?? 'alguns'} segundos antes de tentar de novo.`;
  }
  if (/rate limit|too many requests/.test(m)) return 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.';
  if (/signups? not allowed|signup is disabled/.test(m)) return 'O cadastro está temporariamente fechado. Tente mais tarde.';
  if (/expired|invalid.*(link|token)|token.*(invalid|expired)/.test(m))
    return 'Este link expirou. Peça um novo para continuar.';
  if (/network|fetch|failed to fetch|timeout/.test(m)) return 'Sem conexão com o servidor. Verifique a internet e tente de novo.';
  if (/session|jwt/.test(m)) return 'Sua sessão expirou. Entre novamente.';
  return message;
}
