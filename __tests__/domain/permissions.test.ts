import { cameraPermissionView } from '../../src/lib/permissions';

describe('permissão da câmera (teste 19)', () => {
  it('mostra carregamento enquanto o estado é desconhecido', () => {
    expect(cameraPermissionView(null).kind).toBe('loading');
  });
  it('libera a câmera quando concedida', () => {
    expect(cameraPermissionView({ granted: true, canAskAgain: true, status: 'granted' }).kind).toBe('granted');
  });
  it('pede permissão quando ainda é possível perguntar', () => {
    expect(cameraPermissionView({ granted: false, canAskAgain: true, status: 'undetermined' }).kind).toBe('request');
  });
  it('orienta a abrir as configurações quando negada definitivamente, com alternativa manual', () => {
    const v = cameraPermissionView({ granted: false, canAskAgain: false, status: 'denied' });
    expect(v.kind).toBe('blocked');
    expect(v.kind === 'blocked' && v.message).toMatch(/digitar o código/);
  });
  it('trata aparelho sem câmera', () => {
    expect(cameraPermissionView(null, false).kind).toBe('unavailable');
  });
});
