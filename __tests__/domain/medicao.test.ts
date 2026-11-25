import { dadosDoEvento, EVENTOS_DO_APP } from '@/domain/medicao';

describe('medição do funil: o que o app pode enviar', () => {
  it('o app só registra os eventos que lhe cabem (assinatura é do servidor)', () => {
    expect(EVENTOS_DO_APP).toEqual([
      'app_first_use', 'signup_started', 'signup_completed', 'pricing_viewed', 'checkout_started', 'free_limit_reached', 'upgrade_clicked',
    ]);
  });

  it('mantém só os dados permitidos, em palavras curtas', () => {
    expect(dadosDoEvento({ plano: 'mais', periodo: 'anual' })).toEqual({ plano: 'mais', periodo: 'anual' });
    expect(dadosDoEvento({ tipo: 'cupom', lugar: 'leitura_do_cupom' })).toEqual({ tipo: 'cupom', lugar: 'leitura_do_cupom' });
  });

  it('descarta o que o banco recusaria, em vez de perder o evento inteiro', () => {
    expect(dadosDoEvento({ plano: 'familia', periodo: 'semanal', tipo: 'outro' })).toEqual({});
    expect(dadosDoEvento({ lugar: 'Ana Souza' })).toEqual({});
    expect(dadosDoEvento({ lugar: '11987654321' })).toEqual({});
    expect(dadosDoEvento({ email: 'ana@exemplo.test' } as never)).toEqual({});
  });
});
