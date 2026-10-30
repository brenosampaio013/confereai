import { accessKeyCheckDigit, isValidCnpj, parseAccessKey, parseNfceQr, isOfficialConsultUrl } from '../../src/domain/fiscal';
import { parseLabel } from '../../src/domain/labelParser';
import { compareWithLastPrice, PriceRecord } from '../../src/domain/priceHistory';

// Chave fictícia construída para teste (dígito verificador calculado).
const base43 = '3526101122233300018165001000001234100000123';
const KEY = base43 + accessKeyCheckDigit(base43);

describe('dados fiscais', () => {
  it('valida CNPJ', () => {
    expect(isValidCnpj('11.222.333/0001-81')).toBe(true);
    expect(isValidCnpj('11.222.333/0001-82')).toBe(false);
    expect(isValidCnpj('00000000000000')).toBe(false);
  });

  it('interpreta a chave de acesso', () => {
    const k = parseAccessKey(KEY)!;
    expect(k).toMatchObject({ valid: true, uf: 'SP', year: 2026, month: 10, cnpj: '11222333000181', model: '65' });
    expect(parseAccessKey(KEY.slice(0, 43) + ((Number(KEY[43]) + 1) % 10))!.valid).toBe(false);
  });

  it('lê QR Code v2 online (sem valor) e offline (com valor)', () => {
    const online = parseNfceQr(`https://www.nfce.fazenda.sp.gov.br/qrcode?p=${KEY}|2|1|1|ABCDEF`)!;
    expect(online.totalCents).toBeNull();
    expect(online.environment).toBe('production');
    expect(isOfficialConsultUrl(online.url)).toBe(true);
    const offline = parseNfceQr(`https://www.sefaz.rs.gov.br/NFCE/NFCE-COM.aspx?p=${KEY}|2|1|30|66.45|6162636465|1|HASH`)!;
    expect(offline.totalCents).toBe(6645);
    expect(offline.issuedDay).toBe(30);
  });

  it('lê QR Code v1', () => {
    const q = parseNfceQr(`http://nfce.sefaz.pe.gov.br/nfce/consulta?chNFe=${KEY}&nVersao=100&tpAmb=1&vNF=39.97`)!;
    expect(q.version).toBe('1');
    expect(q.totalCents).toBe(3997);
  });

  it('não considera oficial uma URL fora de .gov.br', () => {
    expect(isOfficialConsultUrl('https://exemplo.com/?p=1')).toBe(false);
    expect(parseNfceQr('texto qualquer')).toBeNull();
  });
});

describe('etiqueta de gôndola', () => {
  it('separa preço normal, promocional e condições', () => {
    const l = parseLabel(['ARROZ TESTE TIPO 1 5KG', 'DE R$ 29,99 POR R$ 26,99', 'LEVE 3 PAGUE 2', 'VALIDO ATE 31/10']);
    expect(l.regularPriceCents).toBe(2999);
    expect(l.promoPriceCents).toBe(2699);
    expect(l.promoConditions).toEqual(expect.arrayContaining(['LEVE 3 PAGUE 2']));
    expect(l.packageMeasure).toEqual({ amount: 5000, unit: 'g' });
    expect(l.productName).toBe('ARROZ TESTE TIPO 1 5KG');
  });

  it('não confunde preço por quilo com preço da embalagem', () => {
    const l = parseLabel(['QUEIJO TESTE 500G', 'R$ 24,90', 'R$ 49,80 /KG']);
    expect(l.regularPriceCents).toBe(2490);
    expect(l.referencePrice).toEqual({ cents: 4980, per: 'kg' });
    expect(l.soldByWeight).toBe(false);
  });

  it('identifica venda por peso', () => {
    const l = parseLabel(['BANANA PRATA', 'R$ 7,99 /KG']);
    expect(l.soldByWeight).toBe(true);
    expect(l.regularPriceCents).toBeNull();
  });

  it('marca campos ilegíveis', () => {
    expect(parseLabel(['@@##', '']).missing).toEqual(['name', 'price']);
  });
});

describe('histórico de preços', () => {
  const h: PriceRecord[] = [
    { id: '1', productId: 'arroz', purchaseId: 'p0', storeName: 'Mercado A', saleUnit: 'un', unitPriceCents: 2599, source: 'manual', promo: false, recordedAt: '2026-09-01T10:00:00Z' },
    { id: '2', productId: 'arroz', purchaseId: 'p1', storeName: 'Mercado A', saleUnit: 'un', unitPriceCents: 2699, source: 'manual', promo: false, recordedAt: '2026-10-01T10:00:00Z' },
    { id: '3', productId: 'outro', purchaseId: 'p1', storeName: 'Mercado A', saleUnit: 'un', unitPriceCents: 100, source: 'manual', promo: false, recordedAt: '2026-10-02T10:00:00Z' },
  ];
  it('compara com o último preço do mesmo produto', () => {
    const c = compareWithLastPrice(h, 'arroz', 'un', 2899, { excludePurchaseId: 'p2', storeName: 'mercado a' })!;
    expect(c.previous.id).toBe('2');
    expect(c.diffCents).toBe(200);
    expect(c.sameStore).toBe(true);
    expect(compareWithLastPrice(h, 'arroz', 'kg', 2899)).toBeNull();
  });
});
