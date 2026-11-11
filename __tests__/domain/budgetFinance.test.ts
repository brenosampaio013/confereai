import { budgetAlertOnChange, budgetMessage, budgetStatus, DEFAULT_THRESHOLDS, parseThresholds, validateThresholds } from '../../src/domain/budget';
import { cartTotals } from '../../src/domain/cart';
import { comparePurchases, itemsSavings, monthKey, monthlySeries, shiftMonth, spendByStore, summarizeMonth, SpendRecord } from '../../src/domain/finance';
import { compareStores, freshness, PriceRecord } from '../../src/domain/priceHistory';
import { normalizeProductCapture, productIdentityKey } from '../../src/domain/productCapture';
import { cartItem } from '../helpers';

describe('orçamento da compra', () => {
  it('exemplo do pedido: R$ 350,00 de R$ 400,00', () => {
    const s = budgetStatus(40000, 35000);
    expect(s).toMatchObject({ remainingCents: 5000, overCents: 0, usedPercent: 87, level: 'near' });
    expect(budgetMessage(s).replace(/ /g, ' ')).toBe(
      'Você já gastou R$ 350,00 dos R$ 400,00 disponíveis. Restam apenas R$ 50,00. Cuidado para não ultrapassar seu orçamento!',
    );
  });

  it('muda de faixa exatamente nos limites (75%, 85%, 100%, acima)', () => {
    expect(budgetStatus(40000, 29999).level).toBe('ok');
    expect(budgetStatus(40000, 30000).level).toBe('attention'); // 75% exato
    expect(budgetStatus(40000, 33999).level).toBe('attention');
    expect(budgetStatus(40000, 34000).level).toBe('near'); // 85% exato
    expect(budgetStatus(40000, 39999).level).toBe('near');
    expect(budgetStatus(40000, 40000)).toMatchObject({ level: 'reached', remainingCents: 0, usedPercent: 100 });
    expect(budgetStatus(40000, 40001)).toMatchObject({ level: 'over', overCents: 1, remainingCents: 0, usedPercent: 100 });
    expect(budgetStatus(40000, 52350)).toMatchObject({ level: 'over', overCents: 12350, usedPercent: 130 });
  });

  it('não erra no limite com valores que dariam fração em ponto flutuante', () => {
    // 85% de R$ 0,07 = 5,95 centavos: 5 ainda não chegou, 6 chegou.
    expect(budgetStatus(7, 5).level).toBe('ok');
    expect(budgetStatus(7, 6).level).toBe('near');
    expect(budgetStatus(33333, 24999).level).toBe('ok'); // 74,99…%
    expect(budgetStatus(33333, 25000).level).toBe('attention'); // 75,0007%
  });

  it('usa limites configurados e recusa configurações inválidas', () => {
    expect(budgetStatus(10000, 5000, { attention: 50, near: 90 }).level).toBe('attention');
    expect(budgetStatus(10000, 8900, { attention: 50, near: 90 }).level).toBe('attention');
    expect(validateThresholds({ attention: 90, near: 80 })).toMatch(/antes/);
    expect(validateThresholds({ attention: 0, near: 80 })).toMatch(/1 e 99/);
    expect(validateThresholds({ attention: 70.5, near: 80 })).not.toBeNull();
    expect(parseThresholds('60,80')).toEqual({ attention: 60, near: 80 });
    expect(parseThresholds('90,80')).toEqual(DEFAULT_THRESHOLDS);
    expect(parseThresholds(null)).toEqual(DEFAULT_THRESHOLDS);
    expect(() => budgetStatus(0, 100)).toThrow();
  });

  it('alerta só quando o gasto sobe de faixa', () => {
    expect(budgetAlertOnChange(20000, 29000, 40000)).toBeNull(); // continua ok
    expect(budgetAlertOnChange(29000, 31000, 40000)?.level).toBe('attention');
    expect(budgetAlertOnChange(31000, 32000, 40000)).toBeNull(); // mesma faixa: não repete
    expect(budgetAlertOnChange(32000, 35000, 40000)?.level).toBe('near');
    expect(budgetAlertOnChange(35000, 40000, 40000)?.level).toBe('reached');
    expect(budgetAlertOnChange(40000, 41000, 40000)).toMatchObject({ level: 'over', overCents: 1000 });
    expect(budgetAlertOnChange(41000, 43000, 40000)).toMatchObject({ level: 'over', overCents: 3000 }); // informa o novo excesso
    expect(budgetAlertOnChange(10000, 45000, 40000)?.level).toBe('over'); // pula direto
  });

  it('remover item ou diminuir quantidade nunca dispara alerta', () => {
    expect(budgetAlertOnChange(45000, 41000, 40000)).toBeNull();
    expect(budgetAlertOnChange(35000, 35000, 40000)).toBeNull();
    expect(budgetAlertOnChange(35000, 31000, 40000)).toBeNull();
  });

  it('acompanha adicionar, alterar quantidade, desconto e remover no carrinho', () => {
    const arroz = cartItem({ name: 'Arroz 5kg', unitPriceCents: 2899, quantityMilli: 2000 }); // 57,98
    const carne = cartItem({ name: 'Patinho', unitPriceCents: 4590, saleUnit: 'kg', quantityMilli: 1250 }); // 57,375 → 57,38
    const sabao = cartItem({ name: 'Sabão', unitPriceCents: 1990, quantityMilli: 3000, discountCents: 1990 }); // leve 3 pague 2 → 39,80
    let items = [arroz];
    expect(budgetStatus(15000, cartTotals(items).totalCents)).toMatchObject({ spentCents: 5798, remainingCents: 9202, usedPercent: 38 });
    items = [arroz, carne, sabao];
    expect(cartTotals(items).totalCents).toBe(5798 + 5738 + 3980);
    expect(budgetStatus(15000, cartTotals(items).totalCents)).toMatchObject({ spentCents: 15516, level: 'over', overCents: 516 });
    items = [{ ...arroz, quantityMilli: 1000 }, carne, sabao]; // tira um arroz
    expect(budgetStatus(15000, cartTotals(items).totalCents)).toMatchObject({ spentCents: 12617, level: 'attention', remainingCents: 2383 });
    items = [carne, sabao];
    expect(budgetStatus(15000, cartTotals(items).totalCents).level).toBe('ok');
  });
});

describe('resumo financeiro', () => {
  const rec = (id: string, date: string, totalCents: number, storeName: string | null = 'Mercado A', savingsCents = 0, budgetCents: number | null = null): SpendRecord => ({ id, date, totalCents, storeName, savingsCents, budgetCents });
  // Datas no meio do dia para não depender do fuso do aparelho.
  const records = [
    rec('1', '2026-11-03T15:00:00Z', 35012, 'Mercado A', 1250),
    rec('2', '2026-11-10T15:00:00Z', 12099, 'mercado a ', 300),
    rec('3', '2026-11-20T15:00:00Z', 8000, 'Atacado B'),
    rec('4', '2026-10-15T15:00:00Z', 40000, 'Atacado B', 999),
    rec('5', '2026-08-15T15:00:00Z', 1000, null),
  ];

  it('total, quantidade, média, maior compra, economia e comparação com o mês anterior', () => {
    const s = summarizeMonth(records, '2026-11');
    expect(s.totalCents).toBe(55111);
    expect(s.count).toBe(3);
    expect(s.averageCents).toBe(18370); // 55111 / 3 = 18370,33
    expect(s.biggest?.id).toBe('1');
    expect(s.savingsCents).toBe(1550);
    expect(s.previousTotalCents).toBe(40000);
    expect(s.diffCents).toBe(15111);
    expect(s.diffPercent).toBe(38);
  });

  it('mês sem compras e mês anterior vazio', () => {
    expect(summarizeMonth(records, '2026-09')).toMatchObject({ totalCents: 0, count: 0, averageCents: null, biggest: null, previousTotalCents: 1000, diffCents: -1000, diffPercent: -100 });
    expect(summarizeMonth(records, '2026-08').diffPercent).toBeNull();
  });

  it('série mensal inclui meses zerados e atravessa a virada do ano', () => {
    expect(monthlySeries(records, '2026-11', 4).map((p) => [p.month, p.totalCents, p.count])).toEqual([
      ['2026-08', 1000, 1], ['2026-09', 0, 0], ['2026-10', 40000, 1], ['2026-11', 55111, 3],
    ]);
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(monthKey(new Date(2026, 0, 31, 23, 59))).toBe('2026-01');
  });

  it('gasto por supermercado junta grafias do mesmo nome', () => {
    expect(spendByStore(records, '2026-11')).toEqual([
      { store: 'Mercado A', totalCents: 47111, count: 2 },
      { store: 'Atacado B', totalCents: 8000, count: 1 },
    ]);
    expect(spendByStore(records, null).find((s) => s.store === 'Supermercado não informado')?.totalCents).toBe(1000);
  });

  it('economia: descontos + diferença entre preço normal e promocional', () => {
    const items = [
      cartItem({ name: 'A', unitPriceCents: 799, regularPriceCents: 999, quantityMilli: 3000 }), // 3 × 2,00
      cartItem({ name: 'B', unitPriceCents: 500, discountCents: 150 }),
      cartItem({ name: 'C', unitPriceCents: 500, regularPriceCents: 400 }), // "normal" menor não conta
      cartItem({ name: 'D', unitPriceCents: 3990, regularPriceCents: 4590, saleUnit: 'kg', quantityMilli: 750 }), // 34,43 − 29,93
    ];
    expect(itemsSavings(items)).toBe(600 + 150 + (3443 - 2993));
  });

  it('compara duas compras pelos produtos em comum', () => {
    const a = [
      cartItem({ name: 'Arroz', productId: 'p1', unitPriceCents: 2899 }),
      cartItem({ name: 'Feijão', barcode: '0789', unitPriceCents: 800 }),
      cartItem({ name: 'Banana', unitPriceCents: 599, saleUnit: 'kg' }),
      cartItem({ name: 'Só A', unitPriceCents: 100 }),
    ];
    const b = [
      cartItem({ name: 'Arroz Tio', productId: 'p1', unitPriceCents: 3299 }),
      cartItem({ name: 'Feijao', barcode: '789', unitPriceCents: 750 }),
      cartItem({ name: 'banana', unitPriceCents: 599, saleUnit: 'kg' }),
      cartItem({ name: 'Só B', unitPriceCents: 100 }),
    ];
    const c = comparePurchases(a, b);
    expect(c.common.map((x) => [x.name, x.diffCents])).toEqual([['Arroz', 400], ['Feijão', -50], ['Banana', 0]]);
    expect(c.commonDiffCents).toBe(350);
    expect(c.onlyA).toEqual(['Só A']);
    expect(c.onlyB).toEqual(['Só B']);
  });
});

describe('histórico de preços por supermercado', () => {
  const now = new Date('2026-11-11T12:00:00Z');
  const p = (id: string, store: string | null, cents: number, daysAgo: number, extra: Partial<PriceRecord> = {}): PriceRecord => ({
    id, productId: 'arroz', purchaseId: null, storeName: store, saleUnit: 'un', unitPriceCents: cents, source: 'manual', promo: false,
    recordedAt: new Date(now.getTime() - daysAgo * 86_400_000).toISOString(), ...extra,
  });

  it('exemplo do pedido: Supermercado A R$ 28,99 × Supermercado B R$ 32,99', () => {
    const c = compareStores([p('1', 'Supermercado B', 3299, 3), p('2', 'Supermercado A', 2899, 1), p('3', 'Supermercado A', 3099, 20)], 'un', now);
    expect(c.stores.map((s) => [s.store, s.last.unitPriceCents, s.count])).toEqual([['Supermercado A', 2899, 2], ['Supermercado B', 3299, 1]]);
    expect(c.cheapest?.store).toBe('Supermercado A');
    expect(c.spreadCents).toBe(400);
    expect(c.latest?.unitPriceCents).toBe(2899);
    expect(c.stores[0]).toMatchObject({ minCents: 2899, maxCents: 3099 });
  });

  it('preço antigo não é tratado como atual nem vence a comparação', () => {
    expect(freshness(p('x', 'A', 1, 7).recordedAt, now)).toBe('current');
    expect(freshness(p('x', 'A', 1, 8).recordedAt, now)).toBe('recent');
    expect(freshness(p('x', 'A', 1, 30).recordedAt, now)).toBe('recent');
    expect(freshness(p('x', 'A', 1, 31).recordedAt, now)).toBe('old');
    const c = compareStores([p('1', 'Barato Antigo', 1999, 200), p('2', 'Caro Atual', 3299, 2)], 'un', now);
    expect(c.cheapest?.store).toBe('Caro Atual');
    expect(c.stores.map((s) => [s.store, s.freshness])).toEqual([['Caro Atual', 'current'], ['Barato Antigo', 'old']]);
    expect(compareStores([p('1', 'Só Antigo', 1999, 200)], 'un', now).cheapest).toBeNull();
  });

  it('separa unidades da mesma rede e ignora outra unidade de venda', () => {
    const c = compareStores(
      [
        p('1', 'Rede X · Centro', 1000, 1, { storeLocationId: 'loc-1' }),
        p('2', 'Rede X · Bairro', 900, 1, { storeLocationId: 'loc-2' }),
        p('3', 'Rede X · Centro', 5000, 1, { storeLocationId: 'loc-1', saleUnit: 'kg' }),
      ],
      'un',
      now,
    );
    expect(c.stores).toHaveLength(2);
    expect(c.cheapest?.storeLocationId).toBe('loc-2');
  });
});

describe('leitura da foto do produto com a etiqueta', () => {
  it('converte os textos impressos em centavos e medidas', () => {
    const r = normalizeProductCapture({
      product_name: 'Arroz Branco Tipo 1', brand: 'Tio João', package_text: '5 kg', barcode: '7893500018469', regular_price: 'R$ 32,99', promo_price: '28,99',
      price_basis: 'unit', reference_price: '5,80', reference_per: 'kg', promo_conditions: ['CLUBE', 'VÁLIDO ATÉ 15/11'], label_matches_product: 'yes', uncertain_fields: ['brand', 'x'],
    });
    expect(r).toMatchObject({
      productName: 'Arroz Branco Tipo 1', brand: 'Tio João', barcode: '7893500018469', regularPriceCents: 3299, promoPriceCents: 2899,
      referencePrice: { cents: 580, per: 'kg' }, packageMeasure: { amount: 5000, unit: 'g' }, soldByWeight: false, association: 'match', missing: [], uncertain: ['marca'],
    });
    expect(r.promoConditions).toEqual(['CLUBE', 'VÁLIDO ATÉ 15/11']);
  });

  it('nunca usa o preço por kg como preço da embalagem', () => {
    const r = normalizeProductCapture({ product_name: 'Café', regular_price: null, reference_price: '39,90', reference_per: 'kg', price_basis: 'unit', label_matches_product: 'yes' });
    expect(r.regularPriceCents).toBeNull();
    expect(r.missing).toEqual(['price']);
    expect(r.referencePrice).toEqual({ cents: 3990, per: 'kg' });
  });

  it('produto vendido por peso usa o preço por quilo', () => {
    const r = normalizeProductCapture({ product_name: 'Banana prata', regular_price: '5,99', price_basis: 'kg', label_matches_product: 'yes' });
    expect(r).toMatchObject({ soldByWeight: true, regularPriceCents: null, referencePrice: { cents: 599, per: 'kg' }, missing: [] });
  });

  it('descarta código inválido, preços absurdos e textos ilegíveis; marca associação incerta', () => {
    const r = normalizeProductCapture({ product_name: '[ilegível]', barcode: '7891234567890', regular_price: '0,00', promo_price: 'abc', label_matches_product: 'talvez' });
    expect(r).toMatchObject({ productName: null, barcode: null, regularPriceCents: null, promoPriceCents: null, association: 'uncertain', missing: ['name', 'price'] });
    expect(normalizeProductCapture({ regular_price: '999999,99' }).regularPriceCents).toBeNull();
    expect(normalizeProductCapture(null).missing).toEqual(['name', 'price']);
  });

  it('corrige preços normal e promocional trocados e promoção sem preço normal', () => {
    const swapped = normalizeProductCapture({ product_name: 'X', regular_price: '7,99', promo_price: '9,99', promo_conditions: ['CLUBE'] });
    expect(swapped).toMatchObject({ regularPriceCents: 999, promoPriceCents: 799 });
    const alone = normalizeProductCapture({ product_name: 'X', promo_price: '4,50' });
    expect(alone).toMatchObject({ regularPriceCents: 450, promoPriceCents: null });
  });

  it('identidade de produto sem código ignora acentos e caixa, mas distingue embalagens', () => {
    expect(productIdentityKey('Feijão Carioca', 'KICALDO', 1000, 'g')).toBe(productIdentityKey(' feijao  carioca ', 'Kicaldo', 1000, 'g'));
    expect(productIdentityKey('Feijão', 'Kicaldo', 1000, 'g')).not.toBe(productIdentityKey('Feijão', 'Kicaldo', 2000, 'g'));
  });
});
