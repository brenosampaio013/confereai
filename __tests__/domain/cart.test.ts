import { addItem, adjustQuantity, cartTotals, findByBarcode, isValidGtin, itemGrossCents, itemNetCents, removeItem, sameGtin, updateItem, upcEToUpcA, validateItem } from '../../src/domain/cart';
import { extractPackageMeasure, samePackage } from '../../src/domain/units';
import { cartItem } from '../helpers';

describe('carrinho', () => {
  it('adiciona produto e recalcula o total (testes 1 e 7)', () => {
    let items = addItem([], cartItem({ id: 'a', name: 'Arroz 5 kg', unitPriceCents: 2899 }));
    items = addItem(items, cartItem({ id: 'b', name: 'Leite 1 L', unitPriceCents: 549, quantityMilli: 2000 }));
    expect(items).toHaveLength(2);
    expect(cartTotals(items)).toMatchObject({ totalCents: 2899 + 1098, lineCount: 2, unitCount: 3 });
  });

  it('não duplica o mesmo item ao reenviar a mesma inclusão', () => {
    const it1 = cartItem({ id: 'a', name: 'Arroz', unitPriceCents: 2899 });
    expect(addItem(addItem([], it1), it1)).toHaveLength(1);
  });

  it('remove produto (teste 2)', () => {
    const items = [cartItem({ id: 'a', name: 'A', unitPriceCents: 100 }), cartItem({ id: 'b', name: 'B', unitPriceCents: 200 })];
    const after = removeItem(items, 'a');
    expect(after.map((i) => i.id)).toEqual(['b']);
    expect(cartTotals(after).totalCents).toBe(200);
  });

  it('altera quantidade e não permite zerar silenciosamente (teste 3)', () => {
    const it1 = cartItem({ id: 'a', name: 'Leite', unitPriceCents: 549 });
    expect(adjustQuantity(it1, 1000)).toBe(2000);
    expect(adjustQuantity(it1, -1000)).toBeNull();
    const updated = updateItem([it1], 'a', { quantityMilli: 3000 }, 'now');
    expect(itemGrossCents(updated[0])).toBe(1647);
    expect(updated[0].updatedAt).toBe('now');
  });

  it('calcula subtotais por quantidade × preço (teste 6)', () => {
    expect(itemGrossCents(cartItem({ name: 'x', unitPriceCents: 333, quantityMilli: 3000 }))).toBe(999);
  });

  it('calcula produtos vendidos por peso (teste 9)', () => {
    const banana = cartItem({ name: 'Banana', unitPriceCents: 799, quantityMilli: 1250, saleUnit: 'kg' });
    expect(itemGrossCents(banana)).toBe(999);
    const queijo = cartItem({ name: 'Queijo', unitPriceCents: 5990, quantityMilli: 215, saleUnit: 'kg' });
    // 0,215 × 59,90 = 12,8785 → 12,88
    expect(itemGrossCents(queijo)).toBe(1288);
    expect(cartTotals([banana, queijo])).toMatchObject({ totalCents: 2287, unitCount: 2 });
  });

  it('aplica descontos uma única vez e nunca gera valor negativo (teste 10)', () => {
    const oleo = cartItem({ name: 'Óleo', unitPriceCents: 1000, discountCents: 200 });
    expect(itemNetCents(oleo)).toBe(800);
    const t = cartTotals([oleo, cartItem({ name: 'Sal', unitPriceCents: 300 })]);
    expect(t).toMatchObject({ grossCents: 1300, discountCents: 200, totalCents: 1100 });
    expect(validateItem({ ...oleo, discountCents: 1500 })).toContain('O desconto não pode ser maior que o subtotal do item.');
  });

  it('valida dados do item', () => {
    expect(validateItem({ name: '', quantityMilli: 0, unitPriceCents: -1, discountCents: 0, saleUnit: 'un' })).toHaveLength(3);
    expect(validateItem({ name: 'x', quantityMilli: 1500, unitPriceCents: 1, discountCents: 0, saleUnit: 'un' })).toHaveLength(1);
  });

  it('trata códigos GTIN', () => {
    expect(isValidGtin('7891000100103')).toBe(true);
    expect(isValidGtin('7891000100104')).toBe(false);
    expect(isValidGtin('96385074')).toBe(true);
    expect(sameGtin('0012345678905', '012345678905')).toBe(true);
    expect(upcEToUpcA('01234505')).toBe('012000003455');
    const items = [cartItem({ name: 'Leite', unitPriceCents: 549, barcode: '7891000100103' })];
    expect(findByBarcode(items, '07891000100103')?.name).toBe('Leite');
  });

  it('não trata embalagens diferentes como equivalentes', () => {
    expect(samePackage(extractPackageMeasure('ARROZ 1KG'), extractPackageMeasure('ARROZ 500G'))).toBe(false);
    expect(samePackage(extractPackageMeasure('ARROZ 5KG'), extractPackageMeasure('ARROZ 5000 G'))).toBe(true);
    expect(extractPackageMeasure('LEITE 1L')).toEqual({ amount: 1000, unit: 'ml' });
    expect(extractPackageMeasure('SABAO PO 1,6KG')).toEqual({ amount: 1600, unit: 'g' });
    expect(samePackage(extractPackageMeasure('ARROZ'), extractPackageMeasure('ARROZ 1KG'))).toBeNull();
  });
});
