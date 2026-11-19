import { isValidEmail, passwordProblem, passwordStrength, translateAuthError, PASSWORD_MIN } from '../../src/domain/auth';

describe('e-mail', () => {
  it('aceita endereços comuns', () => {
    expect(isValidEmail('maria@exemplo.com')).toBe(true);
    expect(isValidEmail('  maria.souza+feira@mail.exemplo.com.br  ')).toBe(true);
  });

  it('recusa o que não é endereço', () => {
    expect(isValidEmail('maria@')).toBe(false);
    expect(isValidEmail('maria@exemplo')).toBe(false);
    expect(isValidEmail('maria exemplo.com')).toBe(false);
    expect(isValidEmail('@exemplo.com')).toBe(false);
    expect(isValidEmail('maria@@exemplo.com')).toBe(false);
    expect(isValidEmail('')).toBe(false);
  });
});

describe('exigências da senha', () => {
  it('cobra comprimento, letra e número', () => {
    expect(passwordProblem('abc')).toMatch(new RegExp(`${PASSWORD_MIN} caracteres`));
    expect(passwordProblem('12345678')).toBe('A senha precisa de pelo menos uma letra.');
    expect(passwordProblem('abcdefgh')).toBe('A senha precisa de pelo menos um número.');
    expect(passwordProblem('compra2026')).toBeNull();
  });
});

describe('força da senha', () => {
  it('não pontua senha curta demais', () => {
    expect(passwordStrength('abc').score).toBe(0);
    expect(passwordStrength('abc').tip).toBe('Faltam 5 caracteres.');
    expect(passwordStrength('abcdefg').tip).toBe('Falta 1 caractere.');
  });

  it('sobe com comprimento e variedade', () => {
    expect(passwordStrength('abcdefgh').score).toBe(1);
    expect(passwordStrength('Compra2026').score).toBe(2);
    expect(passwordStrength('Compra2026!').score).toBe(3);
    expect(passwordStrength('Compra-Feira-2026!').score).toBe(4);
  });

  it('senha vazia não mostra rótulo', () => {
    expect(passwordStrength('')).toEqual({ score: 0, label: '', tip: null });
  });
});

describe('mensagens do servidor em português', () => {
  it('traduz as falhas mais comuns', () => {
    expect(translateAuthError('Invalid login credentials')).toBe('E-mail ou senha incorretos. Confira e tente de novo.');
    expect(translateAuthError('Email not confirmed')).toMatch(/Confirme seu e-mail/);
    expect(translateAuthError('User already registered')).toMatch(/já tem conta/);
    expect(translateAuthError('New password should be different from the old password.')).toMatch(/diferente da anterior/);
    expect(translateAuthError('Failed to fetch')).toMatch(/Sem conexão/);
  });

  it('devolve o tempo de espera informado pelo servidor', () => {
    expect(translateAuthError('For security purposes, you can only request this after 47 seconds.')).toBe(
      'Aguarde 47 segundos antes de tentar de novo.',
    );
  });

  it('não inventa tradução para mensagem desconhecida', () => {
    expect(translateAuthError('Alguma falha específica do projeto')).toBe('Alguma falha específica do projeto');
  });
});
