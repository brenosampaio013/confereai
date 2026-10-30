import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { migrate } from '../../src/data/schema';
import { Repository } from '../../src/data/repository';
import { RemoteAdapter, SyncService } from '../../src/data/sync';
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
