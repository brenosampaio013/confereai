import { matchItems, reconcile } from '../../src/domain/reconciliation';
import { parseReceipt } from '../../src/domain/receiptParser';
import type { ParsedReceipt, ReceiptItem } from '../../src/domain/types';
import { descriptionSimilarity } from '../../src/domain/matching';
import { cartItem } from '../helpers';
import * as F from '../fixtures/receipts';

function rItem(p: Partial<ReceiptItem> & { id: string; description: string; totalCents: number }): ReceiptItem {
  return {
    seq: null, code: null, quantityMilli: 1000, unit: 'un', rawUnit: 'UN', unitPriceCents: p.totalCents,
    discountCents: 0, surchargeCents: 0, confidence: 1, issues: [], sourcePart: 0, rawLines: [], userEdited: false,
    ...p,
  };
}
function receipt(items: ReceiptItem[], total?: number): ParsedReceipt {
  const sum = items.reduce((a, i) => a + i.totalCents! - i.discountCents, 0);
  return {
    storeName: 'TESTE', cnpj: null, issuedAt: null, accessKey: null, items, unassignedDiscountCents: 0,
    totals: { itemCount: null, subtotalCents: null, discountCents: null, surchargeCents: null, totalCents: total ?? sum },
    unparsedLines: [], warnings: [],
  };
}
const kinds = (r: ReturnType<typeof reconcile>) => r.divergences.filter((d) => d.severity !== 'green').map((d) => d.kind);

describe('motor de conferência', () => {
  it('Exemplo 1 / teste 12: quantidade diferente entre carrinho e nota', () => {
    const cart = [cartItem({ id: 'leite', name: 'Leite integral', packageLabel: '1 L', barcode: '7891000100103', unitPriceCents: 549 })];
    const rec = receipt([rItem({ id: 'r1', code: '7891000100103', description: 'LEITE INTEGRAL 1L', quantityMilli: 2000, unitPriceCents: 549, totalCents: 1098 })]);
    const rep = reconcile(cart, rec);
    expect(kinds(rep)).toEqual(['quantity_more']);
    const d = rep.divergences.find((x) => x.kind === 'quantity_more')!;
    expect(d.title).toBe('Possível divergência de quantidade');
    expect(d.explanation).toContain('Você registrou 1 un');
    expect(d.potentialDiffCents).toBe(549);
    expect(d.severity).toBe('red');
    expect(rep.overall).toBe('red');
    expect(rep.differenceCents).toBe(549);
  });

  it('linhas repetidas na nota para um item registrado uma vez = possível cobrança duplicada', () => {
    const cart = [cartItem({ id: 'leite', name: 'Leite integral 1L', barcode: '7891000100103', unitPriceCents: 549 })];
    const rec = parseReceipt([F.TEST_RECEIPT_REPEATED]);
    const rep = reconcile(cart, rec);
    const dup = rep.divergences.find((d) => d.kind === 'possible_duplicate')!;
    expect(dup.severity).toBe('red');
    expect(dup.potentialDiffCents).toBe(549);
    expect(kinds(rep)).toContain('not_in_cart'); // arroz não foi registrado
  });

  it('não acusa erro quando várias unidades foram registradas (compra legítima)', () => {
    const cart = [cartItem({ id: 'leite', name: 'Leite integral 1L', barcode: '7891000100103', unitPriceCents: 549, quantityMilli: 2000 }),
      cartItem({ id: 'arroz', name: 'Arroz tipo 1 5 kg', barcode: '7896006711117', unitPriceCents: 2899 })];
    const rep = reconcile(cart, parseReceipt([F.TEST_RECEIPT_REPEATED]));
    expect(kinds(rep)).toEqual([]);
    expect(rep.overall).toBe('green');
    expect(rep.okCartItemIds.sort()).toEqual(['arroz', 'leite']);
  });

  it('Exemplo 2 / teste 13: preço diferente', () => {
    const cart = [cartItem({ id: 'leite', name: 'Leite', barcode: '789', unitPriceCents: 549 })];
    const rep = reconcile(cart, receipt([rItem({ id: 'r1', code: '789', description: 'LEITE', unitPriceCents: 629, totalCents: 629 })]));
    const d = rep.divergences.find((x) => x.kind === 'price_higher')!;
    expect(d.title).toBe('Preço diferente do registrado');
    expect(d.explanation).toContain('R$ 0,80');
    expect(d.potentialDiffCents).toBe(80);
  });

  it('Exemplo 3 / teste 14: item da nota ausente no carrinho', () => {
    const cart = Array.from({ length: 10 }, (_, i) => cartItem({ id: `c${i}`, name: `Produto ${i}`, barcode: `100${i}`, unitPriceCents: 100 }));
    const items = cart.map((c, i) => rItem({ id: `r${i}`, code: c.barcode!, description: `PRODUTO ${i}`, totalCents: 100 }));
    items.push(rItem({ id: 'extra', code: '999', description: 'CHOCOLATE TESTE', totalCents: 799 }));
    const rep = reconcile(cart, receipt(items));
    expect(kinds(rep)).toEqual(['not_in_cart']);
    expect(rep.divergences.find((d) => d.kind === 'not_in_cart')!.receiptItemIds).toEqual(['extra']);
  });

  it('Exemplo 4 / teste 15: item do carrinho ausente na nota', () => {
    const cart = [
      cartItem({ id: 'arroz', name: 'Arroz', barcode: '1', unitPriceCents: 2899 }),
      cartItem({ id: 'feijao', name: 'Feijão', barcode: '2', unitPriceCents: 849 }),
      cartItem({ id: 'leite', name: 'Leite', barcode: '3', unitPriceCents: 549 }),
      cartItem({ id: 'oleo', name: 'Óleo', barcode: '4', unitPriceCents: 800 }),
    ];
    const rec = receipt([
      rItem({ id: 'a', code: '1', description: 'ARROZ', totalCents: 2899 }),
      rItem({ id: 'f', code: '2', description: 'FEIJAO', totalCents: 849 }),
      rItem({ id: 'o', code: '4', description: 'OLEO', totalCents: 800 }),
    ]);
    const rep = reconcile(cart, rec);
    const d = rep.divergences.find((x) => x.kind === 'not_in_receipt')!;
    expect(d.title).toBe('Não localizamos Leite na nota');
    expect(d.explanation).toMatch(/Antes de concluir/);
    expect(d.severity).toBe('yellow');
  });

  it('Exemplo 5 / teste 10: desconto na nota não gera falso alerta', () => {
    const cart = [cartItem({ id: 'o', name: 'Óleo', barcode: '4', unitPriceCents: 1000 })];
    const rep = reconcile(cart, receipt([rItem({ id: 'r', code: '4', description: 'OLEO', unitPriceCents: 1000, totalCents: 1000, discountCents: 200 })]));
    expect(kinds(rep)).toEqual([]);
    expect(rep.divergences.find((d) => d.kind === 'discount')?.severity).toBe('green');
    expect(rep.receiptTotalCents).toBe(800);
  });

  it('desconto registrado no carrinho e aplicado na nota confere', () => {
    const cart = [cartItem({ id: 'o', name: 'Óleo', barcode: '4', unitPriceCents: 1000, discountCents: 200 })];
    const rep = reconcile(cart, receipt([rItem({ id: 'r', code: '4', description: 'OLEO', unitPriceCents: 1000, totalCents: 1000, discountCents: 200 })]));
    expect(kinds(rep)).toEqual([]);
  });

  it('desconto registrado que não aparece na nota é sinalizado', () => {
    const cart = [cartItem({ id: 'o', name: 'Óleo', barcode: '4', unitPriceCents: 1000, discountCents: 200 })];
    const rep = reconcile(cart, receipt([rItem({ id: 'r', code: '4', description: 'OLEO', unitPriceCents: 1000, totalCents: 1000 })]));
    expect(rep.divergences.find((d) => d.kind === 'price_higher')?.title).toBe('Desconto registrado não aparece na nota');
  });

  it('teste 16: descrições diferentes para o mesmo produto', () => {
    expect(descriptionSimilarity('Leite Integral Italac', 'LT INT ITALAC 1L')).toBeGreaterThanOrEqual(0.75);
    const cart = [cartItem({ id: 'leite', name: 'Leite Integral', brand: 'Testelac', packageLabel: '1 L', unitPriceCents: 549 })];
    const rep = reconcile(cart, parseReceipt([F.TEST_RECEIPT_ECF]));
    expect(rep.matches).toEqual([{ cartItemId: 'leite', receiptItemIds: [expect.any(String)], method: 'description', uncertain: false }]);
    expect(rep.okCartItemIds).toEqual(['leite']);
  });

  it('não associa produtos só pelo nome quando a embalagem é diferente', () => {
    const cart = [cartItem({ id: 'a', name: 'Arroz Tipo 1', packageLabel: '1 kg', unitPriceCents: 699 })];
    const m = matchItems(cart, [rItem({ id: 'r', description: 'ARROZ TIPO 1 500G', totalCents: 399 })]);
    expect(m).toEqual([]);
  });

  it('associação só por nome com preço diferente fica como "confirme"', () => {
    const cart = [cartItem({ id: 'c', name: 'Café Torrado Teste', unitPriceCents: 1590 })];
    const rep = reconcile(cart, receipt([rItem({ id: 'r', description: 'CAFE TORRADO TESTE', totalCents: 1890 })]));
    expect(kinds(rep)).toEqual(['match_uncertain']);
  });

  it('descrição quase idêntica com a mesma embalagem permite apontar diferença de preço', () => {
    const cart = [cartItem({ id: 'a', name: 'Arroz branco tipo 1', packageLabel: '5 kg', unitPriceCents: 2899 })];
    const rep = reconcile(cart, receipt([rItem({ id: 'r', description: 'ARROZ BRANCO TIPO 1 5KG', totalCents: 2999 })]));
    expect(kinds(rep)).toEqual(['price_higher']);
    expect(rep.divergences.find((d) => d.kind === 'price_higher')!.potentialDiffCents).toBe(100);
  });

  it('nome parecido sem embalagem declarada continua exigindo confirmação', () => {
    const cart = [cartItem({ id: 'a', name: 'Arroz branco tipo 1', unitPriceCents: 2899 })];
    const rep = reconcile(cart, receipt([rItem({ id: 'r', description: 'ARROZ BRANCO TIPO 1', totalCents: 2999 })]));
    expect(kinds(rep)).toEqual(['match_uncertain']);
  });

  it('associação manual tem prioridade e permite nova conferência', () => {
    const cart = [cartItem({ id: 'c', name: 'Biscoito recheado', unitPriceCents: 300 })];
    const rec = receipt([rItem({ id: 'r', description: 'BISC REC CHOC', totalCents: 300 })]);
    const rep = reconcile(cart, rec, { manualMatches: { r: 'c' } });
    expect(rep.matches[0].method).toBe('manual');
    expect(rep.overall).toBe('green');
  });

  it('produto pesado: valor depende da balança, com tolerância', () => {
    const cart = [cartItem({ id: 'b', name: 'Banana prata', saleUnit: 'kg', quantityMilli: 1250, unitPriceCents: 799, barcode: '2000001' })];
    const ok = reconcile(cart, receipt([rItem({ id: 'r', code: '2000001', description: 'BANANA', unit: 'kg', quantityMilli: 1260, unitPriceCents: 799, totalCents: 1006 })]));
    expect(kinds(ok)).toEqual([]);
    const truncated = reconcile(cart, receipt([rItem({ id: 'r', code: '2000001', description: 'BANANA', unit: 'kg', quantityMilli: 1250, unitPriceCents: 799, totalCents: 998 })]));
    expect(kinds(truncated)).toEqual([]);
    const heavier = reconcile(cart, receipt([rItem({ id: 'r', code: '2000001', description: 'BANANA', unit: 'kg', quantityMilli: 1500, unitPriceCents: 799, totalCents: 1199 })]));
    expect(heavier.divergences.find((d) => d.kind === 'quantity_more')?.severity).toBe('yellow');
  });

  it('cenário somente nota: explica a limitação e sinaliza linhas repetidas sem afirmar erro', () => {
    const rep = reconcile(null, parseReceipt([F.TEST_RECEIPT_REPEATED]));
    expect(rep.scenario).toBe('receipt_only');
    expect(rep.limitations.join(' ')).toMatch(/não é possível afirmar/);
    const dup = rep.divergences.find((d) => d.kind === 'possible_duplicate')!;
    expect(dup.severity).toBe('yellow');
    expect(dup.receiptItemIds).toHaveLength(2);
    expect(dup.explanation).toMatch(/normal quando você levou mais de uma unidade/);
  });

  it('cenário somente nota: leitura incompleta nunca resulta em verde', () => {
    const rep = reconcile(null, parseReceipt([F.TEST_RECEIPT_INCOMPLETE]));
    expect(rep.complete).toBe(false);
    expect(rep.overall).not.toBe('green');
    expect(kinds(rep)).toContain('needs_review');
  });

  it('cupom completo e carrinho completo conferem (verde)', () => {
    const cart = [
      cartItem({ id: '1', name: 'Leite integral 1L', barcode: '7891000100103', unitPriceCents: 549, quantityMilli: 2000 }),
      cartItem({ id: '2', name: 'Arroz tipo 1 5kg', barcode: '7896006711117', unitPriceCents: 2899 }),
      cartItem({ id: '3', name: 'Feijão carioca 1kg', barcode: '7896102500011', unitPriceCents: 849 }),
      cartItem({ id: '4', name: 'Banana prata', barcode: '2000001', unitPriceCents: 799, saleUnit: 'kg', quantityMilli: 1250 }),
      cartItem({ id: '5', name: 'Óleo de soja 900ml', barcode: '7891107101621', unitPriceCents: 1000 }),
    ];
    const rep = reconcile(cart, parseReceipt([F.TEST_RECEIPT_NFCE]));
    expect(kinds(rep)).toEqual([]);
    expect(rep.overall).toBe('green');
    expect(rep.cartTotalCents).toBe(6845);
    expect(rep.receiptTotalCents).toBe(6645);
    expect(rep.differenceCents).toBe(-200); // desconto do óleo
  });

  it('preserva resoluções do usuário ao reexecutar', () => {
    const cart = [cartItem({ id: 'leite', name: 'Leite', barcode: '789', unitPriceCents: 549 })];
    const rec = receipt([rItem({ id: 'r1', code: '789', description: 'LEITE', quantityMilli: 2000, unitPriceCents: 549, totalCents: 1098 })]);
    const first = reconcile(cart, rec);
    const key = first.divergences[0].key;
    const again = reconcile(cart, rec, { resolutions: { [key]: 'confirmed_ok' } });
    expect(again.divergences[0].resolution).toBe('confirmed_ok');
    expect(again.overall).toBe('green');
  });
});
