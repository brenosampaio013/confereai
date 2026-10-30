import { parseReceipt, validateReceipt, parseUnitPriceToken } from '../../src/domain/receiptParser';
import * as F from '../fixtures/receipts';

describe('leitura de cupom (dados fictícios de teste)', () => {
  it('extrai cabeçalho, itens, desconto e totais de uma NFC-e', () => {
    const r = parseReceipt([F.TEST_RECEIPT_NFCE]);
    expect(r.storeName).toBe('MERCADO TESTE FICTICIO LTDA');
    expect(r.cnpj).toBe('11222333000181');
    expect(r.issuedAt).toBe('2026-10-30T14:22:10');
    expect(r.accessKey).toHaveLength(44);
    expect(r.items).toHaveLength(5);
    const [leite, arroz, , banana, oleo] = r.items;
    expect(leite).toMatchObject({ seq: 1, code: '7891000100103', description: 'LEITE INTEGRAL 1L', quantityMilli: 2000, unitPriceCents: 549, totalCents: 1098, confidence: 1 });
    expect(arroz).toMatchObject({ totalCents: 2899 });
    expect(banana).toMatchObject({ unit: 'kg', quantityMilli: 1250, unitPriceCents: 799, totalCents: 999 });
    expect(oleo).toMatchObject({ discountCents: 200, totalCents: 1000 });
    expect(r.totals).toMatchObject({ itemCount: 5, subtotalCents: 6845, discountCents: 200, totalCents: 6645 });
    const v = validateReceipt(r);
    expect(v.problems).toEqual([]);
    expect(v.complete).toBe(true);
    expect(v.totalDiffCents).toBe(0);
  });

  it('lê layout com item em duas linhas', () => {
    const r = parseReceipt([F.TEST_RECEIPT_TWO_LINES]);
    expect(r.items.map((i) => [i.description, i.quantityMilli, i.totalCents])).toEqual([
      ['LEITE INTEGRAL 1L', 2000, 1098],
      ['ARROZ TIPO 1 5KG', 1000, 2899],
    ]);
    expect(r.totals.totalCents).toBe(3997);
    expect(validateReceipt(r).complete).toBe(true);
  });

  it('lê layout ECF/SAT com alíquotas entre preço e total', () => {
    const r = parseReceipt([F.TEST_RECEIPT_ECF]);
    expect(r.items.map((i) => [i.description, i.quantityMilli, i.unitPriceCents, i.totalCents])).toEqual([
      ['LT INT TESTELAC 1L', 1000, 549, 549],
      ['REFRIG COLA TESTE 2L', 2000, 750, 1500],
    ]);
    expect(r.totals.totalCents).toBe(2049);
  });

  it('sinaliza leitura incompleta sem inventar valores (teste 11)', () => {
    const r = parseReceipt([F.TEST_RECEIPT_INCOMPLETE]);
    expect(r.items).toHaveLength(3);
    const arroz = r.items[1];
    expect(arroz.description).toBe('ARROZ TIPO 1 5KG');
    expect(arroz.totalCents).toBeNull();
    expect(arroz.unitPriceCents).toBeNull();
    expect(arroz.issues).toEqual(expect.arrayContaining(['missing_quantity', 'missing_total']));
    const v = validateReceipt(r);
    expect(v.complete).toBe(false);
    expect(v.problems).toEqual(expect.arrayContaining(['O valor total da nota não foi identificado.']));
    expect(v.lowConfidenceItemIds).toContain(arroz.id);
  });

  it('combina fotos de um cupom longo removendo apenas a sobreposição clara', () => {
    const r = parseReceipt([F.TEST_RECEIPT_PART_1, F.TEST_RECEIPT_PART_2]);
    expect(r.items.map((i) => i.seq)).toEqual([1, 2, 3, 4, 5]);
    expect(r.warnings.join(' ')).toMatch(/sobreposição/);
    expect(validateReceipt(r).complete).toBe(true);
  });

  it('mantém e sinaliza linha duvidosa na emenda de fotos sem numeração', () => {
    const p1 = ['LEITE INTEGRAL 1L 1 UN X 5,49 5,49', 'CAFE TESTE 500G 1 UN X 15,90 15,90'];
    const p2 = ['CAFE TESTE 500G 1 UN X 15,90 15,90', 'ACUCAR 1KG 1 UN X 4,99 4,99'];
    const r = parseReceipt([p1, p2]);
    expect(r.items).toHaveLength(4);
    expect(r.items.filter((i) => i.issues.includes('possible_overlap'))).toHaveLength(2);
  });

  it('identifica conta que não fecha na linha', () => {
    const r = parseReceipt([['001 789 BISCOITO TESTE 2 UN X 3,00 9,00', 'TOTAL R$ 9,00']]);
    expect(r.items[0].issues).toContain('math_mismatch');
  });

  it('desconsidera item cancelado, avisando o usuário', () => {
    const r = parseReceipt([[
      '001 789 BISCOITO TESTE 1 UN X 3,00 3,00',
      '002 790 SUCO TESTE 1L 1 UN X 6,00 6,00',
      'ITEM 002 CANCELADO',
      'TOTAL R$ 3,00',
    ]]);
    expect(r.items.map((i) => i.seq)).toEqual([1]);
    expect(r.warnings.join()).toMatch(/cancelamento do item 002/);
  });

  it('atribui desconto geral não associado e exige revisão', () => {
    const r = parseReceipt([['DESCONTO -1,00', '001 789 BISCOITO TESTE 1 UN X 3,00 3,00', 'TOTAL R$ 2,00']]);
    expect(r.unassignedDiscountCents).toBe(100);
    expect(validateReceipt(r).totalDiffCents).toBe(0);
  });

  it('lê preço unitário com três casas', () => {
    expect(parseUnitPriceToken('7,990')).toEqual({ cents: 799, exact: true });
    expect(parseUnitPriceToken('7,995')).toEqual({ cents: 800, exact: false });
  });
});
