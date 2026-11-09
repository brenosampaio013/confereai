import {
  addDays, confirmationText, discountInfo, distanceMeters, emptyDraft, formatDistance, formatOfferPrice, parseDateBR,
  previewLocationStatus, relativeTime, validateStep, validatePickedImage, validityText, verificationBadges,
} from '../../src/domain/marketplace';
import { locationPermissionView } from '../../src/lib/permissions';

describe('marketplace — regras do aplicativo', () => {
  it('calcula distância (Haversine) igual ao servidor', () => {
    expect(Math.round(distanceMeters(-23.55052, -46.633308, -23.55052 + 60 / 111195, -46.633308))).toBe(60);
    expect(Math.round(distanceMeters(-23.55052, -46.633308, -22.90556, -47.06083) / 1000)).toBe(84);
  });

  it('prévia de proximidade: dentro, fora, imprecisa e margem de erro', () => {
    expect(previewLocationStatus(60, 12)).toBe('compatible');
    expect(previewLocationStatus(2000, 10)).toBe('far');
    expect(previewLocationStatus(30, 350)).toBe('low_accuracy');
    expect(previewLocationStatus(230, 50)).toBe('low_accuracy');
    expect(previewLocationStatus(260, 50)).toBe('far');
    expect(previewLocationStatus(450, 20, 500)).toBe('compatible');
  });

  it('permissão de localização (teste 5) nunca impede publicar manualmente', () => {
    expect(locationPermissionView(null).kind).toBe('loading');
    expect(locationPermissionView({ granted: true, canAskAgain: true, status: 'granted' }).kind).toBe('granted');
    const req = locationPermissionView({ granted: false, canAskAgain: true, status: 'undetermined' });
    expect(req.kind === 'request' && req.message).toMatch(/nunca suas coordenadas/);
    const blocked = locationPermissionView({ granted: false, canAskAgain: false, status: 'denied' });
    expect(blocked.kind === 'blocked' && blocked.message).toMatch(/manualmente/);
  });

  it('indicadores de verificação são separados; localização sozinha não vira "verificada"', () => {
    const onlyLoc = verificationBadges({ location_compatible: true, photo_verified: false, community_confirmed: false, moderator_verified: false, independent_confirmations: 0 });
    expect(onlyLoc.map((b) => b.label)).toEqual(['Localização compatível']);
    expect(onlyLoc[0].detail).toMatch(/não comprova o preço/);
    const all = verificationBadges({ location_compatible: true, photo_verified: true, community_confirmed: true, moderator_verified: true, independent_confirmations: 4 });
    expect(all.map((b) => b.key)).toEqual(['location', 'photo', 'community', 'moderation']);
    expect(verificationBadges({ location_compatible: false, photo_verified: false, community_confirmed: false, moderator_verified: false, independent_confirmations: 0 })).toEqual([]);
  });

  it('deixa explícito quando não há confirmações suficientes', () => {
    expect(confirmationText(0)).toMatch(/sem confirmações/);
    expect(confirmationText(2)).toMatch(/ainda não é suficiente/);
    expect(confirmationText(3)).toBe('3 confirmações de pessoas diferentes.');
  });

  it('não calcula desconto sem comprovação do preço anterior', () => {
    expect(discountInfo(null, 2990, true)).toEqual({ percent: null, regularText: null });
    expect(discountInfo(3990, 2990, false)).toEqual({ percent: null, regularText: 'Preço anterior informado por quem publicou: R$ 39,90' });
    expect(discountInfo(3990, 2990, true)).toEqual({ percent: 25, regularText: 'Antes: R$ 39,90' });
  });

  it('formata preço, distância, datas e tempo relativo', () => {
    expect(formatOfferPrice(2990, 'kg')).toBe('R$ 29,90/kg');
    expect(formatDistance(0.234)).toBe('230 m');
    expect(formatDistance(3.46)).toBe('3,5 km');
    expect(formatDistance(null)).toBeNull();
    expect(relativeTime(new Date(Date.now() - 20 * 60000).toISOString())).toBe('há 20 minutos');
    expect(validityText('2026-11-10', '2026-11-01', '2026-11-05')).toBe('Válida até 10/11/2026');
    expect(validityText('2026-11-10', '2026-11-08', '2026-11-05')).toBe('Começa em 08/11/2026, até 10/11/2026');
    expect(validityText('2026-11-05', undefined, '2026-11-05')).toBe('Válida até hoje');
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(parseDateBR('31/02/2026')).toBeNull();
    expect(parseDateBR('10/11/2026')).toBe('2026-11-10');
  });

  it('valida cada etapa da publicação', () => {
    const d = emptyDraft('2026-11-09');
    expect(validateStep('product', d, '2026-11-09')).toEqual(['Informe o nome do produto.', 'Escolha a categoria.']);
    expect(validateStep('photos', { ...d, photos: [{ uri: 'x', type: 'product', width: 800, height: 600 }] })).toHaveLength(1);
    expect(validateStep('photos', { ...d, photos: [{ uri: 'x', type: 'price_tag', width: 800, height: 600 }] })).toEqual([]);
    const price = { ...d, promoPriceCents: 2990, regularPriceCents: 2500 };
    expect(validateStep('price', price, '2026-11-09')).toContain('O preço anterior deve ser maior que o promocional.');
    expect(validateStep('price', { ...d, promoPriceCents: 2990, conditionTypes: ['min_quantity'] }, '2026-11-09')).toContain('Informe a quantidade mínima.');
    expect(validateStep('price', { ...d, promoPriceCents: 2990, endsOn: '2027-03-01' }, '2026-11-09')).toContain('A validade máxima é de 60 dias.');
    expect(validateStep('store', d)).toEqual(['Escolha a unidade do supermercado.']);
  });

  it('rejeita imagens vazias ou de formato inválido', () => {
    expect(validatePickedImage({ width: 0, height: 0 })).toMatch(/vazia/);
    expect(validatePickedImage({ width: 1200, height: 900, mimeType: 'application/pdf' })).toMatch(/Formato/);
    expect(validatePickedImage({ width: 1200, height: 900, mimeType: 'image/jpeg', fileSize: 3e6 })).toBeNull();
  });
});
