import { ScanGuard, decisionToEvent } from '../../src/domain/scanGuard';

describe('proteção contra leituras repetidas', () => {
  const inCart = (set: Set<string>) => (c: string) => set.has(c);

  it('ignora a repetição técnica enquanto o código continua diante da câmera (teste 4)', () => {
    const g = new ScanGuard({ technicalWindowMs: 2500 });
    const cart = new Set<string>();
    const first = g.evaluateCameraRead('789', 0, inCart(cart));
    expect(first.kind).toBe('new');
    cart.add('789');
    // a câmera dispara várias vezes por segundo durante 10 s
    for (let t = 100; t <= 10_000; t += 100) {
      expect(g.evaluateCameraRead('789', t, inCart(cart)).kind).toBe('technical_repeat');
    }
    expect(decisionToEvent({ kind: 'technical_repeat', code: '789' }, false)).toBe('scan_technical_repeat');
  });

  it('identifica nova leitura intencional e pede confirmação (teste 5)', () => {
    const g = new ScanGuard({ technicalWindowMs: 2500 });
    const cart = new Set<string>(['789']);
    g.evaluateCameraRead('789', 0, () => false);
    // código saiu de vista e foi lido novamente 4 s depois
    const again = g.evaluateCameraRead('789', 4000, inCart(cart));
    expect(again.kind).toBe('already_in_cart');
    expect(decisionToEvent(again, false)).toBe('scan_intentional_repeat');
  });

  it('não bloqueia inclusão manual de mais unidades', () => {
    const g = new ScanGuard();
    const cart = new Set<string>(['789']);
    g.evaluateCameraRead('789', 0, inCart(cart));
    const manual = g.evaluateManual('789', 100, inCart(cart));
    expect(manual.kind).toBe('already_in_cart');
    expect(decisionToEvent(manual, true)).toBe('manual_entry');
  });

  it('não adiciona um produto vizinho lido logo em seguida', () => {
    const g = new ScanGuard({ minIntervalMs: 600 });
    expect(g.evaluateCameraRead('111', 0, () => false).kind).toBe('new');
    expect(g.evaluateCameraRead('222', 200, () => false).kind).toBe('technical_repeat');
    expect(g.evaluateCameraRead('222', 3000, () => false).kind).toBe('new');
  });
});
