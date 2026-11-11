import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { LOCAL_MIGRATIONS, migrate } from '../../src/data/schema';
import { Repository } from '../../src/data/repository';
import { RemoteAdapter, SyncService, toRemoteRow } from '../../src/data/sync';
import { cartTotals } from '../../src/domain/cart';
import { parseReceipt } from '../../src/domain/receiptParser';
import { reconcile } from '../../src/domain/reconciliation';
import { NodeSqliteDriver } from '../nodeSqliteDriver';
import * as F from '../fixtures/receipts';

async function open(path?: string) {
  const db = new NodeSqliteDriver(path);
  await migrate(db);
  return { db, repo: new Repository(db, randomUUID) };
}

const leite = (purchaseId: string, id?: string) => ({
  id, purchaseId, productId: null, barcode: '7891000100103', name: 'Leite integral', brand: null, packageLabel: '1 L',
  saleUnit: 'un' as const, quantityMilli: 1000, unitPriceCents: 549, priceSource: 'manual' as const, addedVia: 'scan' as const,
});

describe('persistência local', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'confere-')); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('recupera a compra em andamento depois de fechar o aplicativo (teste 17)', async () => {
    const file = join(dir, 'app.db');
    const a = await open(file);
    const p = await a.repo.startPurchase('cart');
    const item = await a.repo.addCartItem(leite(p.id));
    await a.repo.updateCartItem(item.id, { quantityMilli: 3000 });
    a.db.close(); // aplicativo encerrado inesperadamente

    const b = await open(file);
    const active = await b.repo.getActivePurchase();
    expect(active?.id).toBe(p.id);
    const items = await b.repo.listCartItems(p.id);
    expect(items).toHaveLength(1);
    expect(cartTotals(items).totalCents).toBe(1647);
    expect((await b.repo.listEditLog('cart_item', item.id))[0]).toMatchObject({ field: 'quantityMilli', old_value: '1000', new_value: '3000' });
    b.db.close();
  });

  it('não duplica item ao repetir a mesma inclusão', async () => {
    const { repo } = await open();
    const p = await repo.startPurchase();
    await repo.addCartItem(leite(p.id, 'fixo'));
    await repo.addCartItem(leite(p.id, 'fixo'));
    expect(await repo.listCartItems(p.id)).toHaveLength(1);
  });

  it('remove item e mantém histórico de preços coerente', async () => {
    const { repo } = await open();
    const product = await repo.saveProduct({ barcode: '789', name: 'Arroz', brand: 'Teste', category: null, packageAmount: 5000, packageUnit: 'g', saleUnit: 'un', imageUri: null, source: 'user' });
    const p = await repo.startPurchase();
    const it = await repo.addCartItem({ ...leite(p.id), productId: product.id, name: 'Arroz', unitPriceCents: 2899 });
    expect(await repo.listPriceHistory(product.id)).toHaveLength(1);
    await repo.updateCartItem(it.id, { unitPriceCents: 2799 });
    expect((await repo.listPriceHistory(product.id))[0].unitPriceCents).toBe(2799);
    await repo.removeCartItem(it.id);
    expect(await repo.listCartItems(p.id)).toHaveLength(0);
    expect(await repo.listPriceHistory(product.id)).toHaveLength(0);
  });

  it('salva cupom, relatório e resoluções no histórico', async () => {
    const { repo } = await open();
    const p = await repo.startPurchase('receipt_only');
    const rid = await repo.saveParsedReceipt(p.id, parseReceipt([F.TEST_RECEIPT_REPEATED]));
    const stored = (await repo.getReceipt(rid))!;
    expect(stored.parsed.items).toHaveLength(3);
    const report = reconcile(null, stored.parsed);
    const reportId = await repo.saveReport(p.id, rid, report);
    const saved = (await repo.getReport(reportId))!;
    const dup = saved.divergences.find((d) => d.kind === 'possible_duplicate')!;
    await repo.setResolution(dup.id, 'confirmed_ok');
    // reexecutar mantém o id e a resolução
    const again = reconcile(null, stored.parsed, { resolutions: await repo.getResolutions(rid) });
    await repo.saveReport(p.id, rid, again);
    const after = (await repo.getReport(reportId))!;
    expect(after.divergences.find((d) => d.kind === 'possible_duplicate')).toMatchObject({ id: dup.id, resolution: 'confirmed_ok' });
    const summary = (await repo.listPurchaseSummaries())[0];
    expect(summary).toMatchObject({ receiptStatus: 'draft', reportOverall: 'green', receiptTotalCents: 3997 });
    expect((await repo.getPurchase(p.id))?.storeName).toBe('MERCADO TESTE FICTICIO');
  });

  it('exclui compra e tudo que pertence a ela', async () => {
    const { repo } = await open();
    const p = await repo.startPurchase();
    await repo.addCartItem(leite(p.id));
    await repo.saveParsedReceipt(p.id, parseReceipt([F.TEST_RECEIPT_TWO_LINES]));
    await repo.deletePurchase(p.id);
    expect(await repo.listPurchaseSummaries()).toHaveLength(0);
    expect(await repo.listCartItems(p.id)).toHaveLength(0);
  });
});

describe('funcionamento sem internet e sincronização (teste 18)', () => {
  function fakeRemote() {
    const store = new Map<string, Map<string, Record<string, unknown>>>();
    let failNext = false;
    const remote: RemoteAdapter & { store: typeof store; failOnce(): void; calls: number } = {
      store,
      calls: 0,
      failOnce() { failNext = true; },
      async upsert(table, rows) {
        remote.calls++;
        if (failNext) { failNext = false; throw new Error('Network request failed'); }
        const t = store.get(table) ?? new Map();
        for (const r of rows) t.set(r.id as string, r);
        store.set(table, t);
      },
      async pullSince() { return []; },
    };
    return remote;
  }

  it('registra produtos e calcula o total offline; a fila aguarda a conexão', async () => {
    const { db, repo } = await open();
    const remote = fakeRemote();
    let online = false;
    const sync = new SyncService(db, remote, { isOnline: async () => online, isAuthenticated: async () => true });
    const p = await repo.startPurchase();
    await repo.addCartItem(leite(p.id));
    await repo.addCartItem({ ...leite(p.id), barcode: '2', name: 'Pão', unitPriceCents: 1250 });
    expect(cartTotals(await repo.listCartItems(p.id)).totalCents).toBe(1799);
    expect(await sync.sync()).toMatchObject({ skipped: 'offline' });
    expect(remote.calls).toBe(0);
    expect(await repo.pendingSyncCount()).toBeGreaterThan(0);

    // conexão volta, mas o primeiro envio falha: nada é apagado localmente
    online = true;
    remote.failOnce();
    const failed = await sync.sync();
    expect(failed.failed).toBeGreaterThan(0);
    expect(await repo.pendingSyncCount()).toBeGreaterThan(0);
    expect(await repo.listCartItems(p.id)).toHaveLength(2);

    // novo envio: sem duplicidades no servidor
    const ok = await sync.sync();
    expect(ok.failed).toBe(0);
    expect(await repo.pendingSyncCount()).toBe(0);
    expect(remote.store.get('cart_items')!.size).toBe(2);
    await sync.sync();
    expect(remote.store.get('cart_items')!.size).toBe(2);
    expect(await repo.listCartItems(p.id)).toHaveLength(2); // dados locais preservados
  });

  it('não sincroniza sem autenticação, mas mantém os dados locais', async () => {
    const { db, repo } = await open();
    const sync = new SyncService(db, fakeRemote(), { isOnline: async () => true, isAuthenticated: async () => false });
    const p = await repo.startPurchase();
    await repo.addCartItem(leite(p.id));
    expect(await sync.sync()).toMatchObject({ skipped: 'not_authenticated' });
    expect(await repo.listCartItems(p.id)).toHaveLength(1);
  });

  it('pull aplica a versão mais recente e preserva alteração local pendente', async () => {
    const { db, repo } = await open();
    const p = await repo.startPurchase();
    const item = await repo.addCartItem(leite(p.id));
    const remote = fakeRemote();
    const remoteVersion = { ...(await repo.getRow('cart_items', item.id))!, quantity_milli: 5000, updated_at: '2000-01-01T00:00:00.000Z', user_id: 'u1' };
    remote.pullSince = async (table) => (table === 'cart_items' ? [remoteVersion] : []);
    const sync = new SyncService(db, remote, { isOnline: async () => true, isAuthenticated: async () => true });
    await sync.pull();
    expect((await repo.getCartItem(item.id))!.quantityMilli).toBe(1000); // local é mais novo

    remote.pullSince = async (table) => (table === 'cart_items' ? [{ ...remoteVersion, updated_at: '2999-01-01T00:00:00.000Z' }] : []);
    await sync.push();
    await sync.pull();
    expect((await repo.getCartItem(item.id))!.quantityMilli).toBe(5000); // remoto é mais novo
  });
});

describe('orçamento, histórico de compras e preços por supermercado', () => {
  const arroz = { barcode: '7893500018469', name: 'Arroz Tio João', brand: 'Tio João', category: null, packageAmount: 5000, packageUnit: 'g' as const, saleUnit: 'un' as const, imageUri: null, source: 'user' as const };

  it('guarda o orçamento com a compra e calcula a diferença para o valor final', async () => {
    const { repo } = await open();
    const p = await repo.startPurchase('cart', 'Supermercado A', 40000);
    await repo.addCartItem({ ...leite(p.id), unitPriceCents: 10000, quantityMilli: 3000, discountCents: 500 });
    await repo.addCartItem({ ...leite(p.id), name: 'Promo', barcode: null, unitPriceCents: 799, regularPriceCents: 999, quantityMilli: 2000 });
    await repo.updatePurchase(p.id, { status: 'closed' });
    const s = (await repo.getPurchaseSummary(p.id))!;
    expect(s.purchase).toMatchObject({ budgetCents: 40000, storeName: 'Supermercado A', status: 'closed' });
    expect(s.purchase.closedAt).not.toBeNull();
    expect(s).toMatchObject({ cartTotalCents: 31098, discountCents: 500, savingsCents: 900, finalTotalCents: 31098, budgetDiffCents: -8902 });
    await repo.updatePurchase(p.id, { budgetCents: 30000 });
    expect((await repo.getPurchaseSummary(p.id))!.budgetDiffCents).toBe(1098);
    await repo.updatePurchase(p.id, { budgetCents: null });
    expect((await repo.getPurchaseSummary(p.id))!.budgetDiffCents).toBeNull();
    await expect(repo.updatePurchase(p.id, { budgetCents: -5 })).rejects.toThrow(/Orçamento/);
    await expect(repo.startPurchase('cart', null, 12.5)).rejects.toThrow(/Orçamento/);
  });

  it('o valor final usa o total da nota quando ela existe', async () => {
    const { repo } = await open();
    const p = await repo.startPurchase('cart', null, 5000);
    await repo.addCartItem({ ...leite(p.id), unitPriceCents: 4000 });
    await repo.saveParsedReceipt(p.id, parseReceipt([F.TEST_RECEIPT_NFCE]));
    const s = (await repo.getPurchaseSummary(p.id))!;
    expect(s.receiptTotalCents).not.toBeNull();
    expect(s.finalTotalCents).toBe(s.receiptTotalCents);
    expect(s.budgetDiffCents).toBe(s.receiptTotalCents! - 5000);
  });

  it('o histórico sobrevive ao fechamento do app e lista só compras encerradas nos gastos', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'confere-'));
    const file = join(dir, 'app.db');
    const a = await open(file);
    const p1 = await a.repo.startPurchase('cart', 'Mercado A', 20000);
    await a.repo.addCartItem({ ...leite(p1.id), unitPriceCents: 15000 });
    await a.repo.updatePurchase(p1.id, { status: 'closed' });
    const p2 = await a.repo.startPurchase('cart', 'Mercado B');
    await a.repo.addCartItem({ ...leite(p2.id), unitPriceCents: 999 });
    a.db.close();
    const b = await open(file);
    const spend = await b.repo.listSpendRecords();
    expect(spend).toHaveLength(1); // a compra em andamento não entra
    expect(spend[0]).toMatchObject({ id: p1.id, storeName: 'Mercado A', totalCents: 15000, budgetCents: 20000 });
    const items = await b.repo.listCartItems(p1.id);
    expect(items[0]).toMatchObject({ name: 'Leite integral', quantityMilli: 1000, unitPriceCents: 15000 });
    b.db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('separa o histórico de preços por supermercado e unidade', async () => {
    const { repo } = await open();
    const product = await repo.saveProduct(arroz);
    const a = await repo.startPurchase('cart', 'Supermercado A');
    await repo.addCartItem({ ...leite(a.id), productId: product.id, name: product.name, unitPriceCents: 2899 });
    await repo.updatePurchase(a.id, { status: 'closed' });
    const b = await repo.startPurchase('cart', 'Supermercado B');
    await repo.addCartItem({ ...leite(b.id), productId: product.id, name: product.name, unitPriceCents: 3299, regularPriceCents: 3499, promoNote: 'Clube' });
    const h = await repo.listPriceHistory(product.id);
    expect(h.map((x) => [x.storeName, x.unitPriceCents, x.promo, x.regularPriceCents]).sort()).toEqual([['Supermercado A', 2899, false, null], ['Supermercado B', 3299, true, 3499]]);
    // Trocar o supermercado (ou vincular a uma unidade) vale para os preços já registrados na compra.
    await repo.updatePurchase(b.id, { storeName: 'Supermercado B · Centro', storeLocationId: '11111111-1111-4111-8111-111111111111' });
    const h2 = await repo.listPriceHistory(product.id);
    expect(h2.find((x) => x.unitPriceCents === 3299)).toMatchObject({ storeName: 'Supermercado B · Centro', storeLocationId: '11111111-1111-4111-8111-111111111111' });
    const rows = await repo.listProductPrices();
    expect(rows).toHaveLength(1);
    expect(rows[0].storeCount).toBe(2);
  });

  it('registra preço visto sem compra e reaproveita produto sem código de barras', async () => {
    const { repo } = await open();
    const p = await repo.saveProduct({ ...arroz, barcode: null, name: 'Feijão Carioca', brand: 'Kicaldo', packageAmount: 1000 });
    expect((await repo.findProductByIdentity('feijao carioca', 'KICALDO', 1000, 'g', 'un'))?.id).toBe(p.id);
    expect(await repo.findProductByIdentity('Feijão Carioca', 'Kicaldo', 2000, 'g', 'un')).toBeNull();
    expect(await repo.findProductByIdentity('Feijão Carioca', 'Kicaldo', 1000, 'g', 'kg')).toBeNull();
    const id = await repo.recordPriceObservation({ productId: p.id, storeName: ' Mercado C ', saleUnit: 'un', unitPriceCents: 899, source: 'photo_ai' });
    await expect(repo.recordPriceObservation({ productId: p.id, storeName: null, saleUnit: 'un', unitPriceCents: 0, source: 'manual' })).rejects.toThrow();
    expect(await repo.listPriceHistory(p.id)).toMatchObject([{ id, storeName: 'Mercado C', purchaseId: null, source: 'photo_ai', unitPriceCents: 899 }]);
    await repo.removePriceRecord(id);
    expect(await repo.listPriceHistory(p.id)).toHaveLength(0);
  });

  it('só oferece à base da comunidade preços de unidade cadastrada, uma única vez', async () => {
    const { repo } = await open();
    const product = await repo.saveProduct(arroz);
    const semUnidade = await repo.startPurchase('cart', 'Mercado sem cadastro');
    await repo.addCartItem({ ...leite(semUnidade.id), productId: product.id, unitPriceCents: 2899 });
    expect(await repo.listUnsharedPrices()).toHaveLength(0);
    await repo.updatePurchase(semUnidade.id, { storeLocationId: '22222222-2222-4222-8222-222222222222' });
    const pending = await repo.listUnsharedPrices();
    expect(pending).toMatchObject([{ locationId: '22222222-2222-4222-8222-222222222222', barcode: arroz.barcode, name: arroz.name, unitPriceCents: 2899, packageAmount: 5000 }]);
    await repo.markPricesShared(pending.map((x) => x.id));
    expect(await repo.listUnsharedPrices()).toHaveLength(0);
    // Corrigir o preço volta a oferecer o registro.
    const item = (await repo.listCartItems(semUnidade.id))[0];
    await repo.updateCartItem(item.id, { unitPriceCents: 2799 });
    expect((await repo.listUnsharedPrices())[0].unitPriceCents).toBe(2799);
  });

  it('migra um banco da versão anterior sem perder dados', async () => {
    const db = new NodeSqliteDriver();
    await db.exec(LOCAL_MIGRATIONS[0]);
    await db.run("INSERT INTO meta (key, value) VALUES ('schema_version', '1')");
    await db.run("INSERT INTO purchases (id, store_name, status, mode, started_at, updated_at) VALUES ('old', 'Antiga', 'closed', 'cart', '2026-10-01T10:00:00.000Z', '2026-10-01T10:00:00.000Z')");
    await migrate(db);
    const repo = new Repository(db, randomUUID);
    expect(await repo.getPurchase('old')).toMatchObject({ storeName: 'Antiga', budgetCents: null, storeLocationId: null });
    await repo.updatePurchase('old', { budgetCents: 1000 });
    expect((await repo.getPurchase('old'))!.budgetCents).toBe(1000);
  });

  it('a coluna local shared_at não é enviada ao servidor', async () => {
    const row = toRemoteRow('price_history', { id: 'x', shared_at: '2026', promo: 1, store_location_id: null, regular_price_cents: 5 });
    expect(row).toEqual({ id: 'x', promo: true, store_location_id: null, regular_price_cents: 5 });
  });
});
