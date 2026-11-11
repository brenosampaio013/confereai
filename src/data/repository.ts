import { cartTotals } from '@/domain/cart';
import { itemsSavings, type SpendRecord } from '@/domain/finance';
import { productIdentityKey } from '@/domain/productCapture';
import type { Cents } from '@/domain/money';
import type { PriceRecord } from '@/domain/priceHistory';
import type {
  CartItem,
  Divergence,
  ParsedReceipt,
  PriceSource,
  Product,
  Purchase,
  ReceiptItem,
  ReconciliationReport,
  Resolution,
  Severity,
} from '@/domain/types';
import type { SaleUnit } from '@/domain/units';
import type { SyncedTable } from './schema';
import type { SqlDriver, SqlValue } from './sql';

export interface Clock {
  now(): string;
}
export const systemClock: Clock = { now: () => new Date().toISOString() };

type Row = Record<string, SqlValue>;

const json = (v: unknown) => JSON.stringify(v ?? []);
const parseJson = <T>(v: SqlValue, fallback: T): T => {
  if (typeof v !== 'string') return fallback;
  try {
    return JSON.parse(v) as T;
  } catch {
    return fallback;
  }
};

function toProduct(r: Row): Product {
  return {
    id: r.id as string,
    barcode: (r.barcode as string) ?? null,
    name: r.name as string,
    brand: (r.brand as string) ?? null,
    category: (r.category as string) ?? null,
    packageAmount: (r.package_amount as number) ?? null,
    packageUnit: (r.package_unit as Product['packageUnit']) ?? null,
    saleUnit: r.sale_unit as SaleUnit,
    imageUri: (r.image_uri as string) ?? null,
    source: r.source as Product['source'],
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function toPurchase(r: Row): Purchase {
  return {
    id: r.id as string,
    storeName: (r.store_name as string) ?? null,
    storeCnpj: (r.store_cnpj as string) ?? null,
    storeLocationId: (r.store_location_id as string) ?? null,
    budgetCents: (r.budget_cents as number) ?? null,
    status: r.status as Purchase['status'],
    mode: r.mode as Purchase['mode'],
    startedAt: r.started_at as string,
    closedAt: (r.closed_at as string) ?? null,
    updatedAt: r.updated_at as string,
  };
}

function toCartItem(r: Row): CartItem {
  return {
    id: r.id as string,
    purchaseId: r.purchase_id as string,
    productId: (r.product_id as string) ?? null,
    barcode: (r.barcode as string) ?? null,
    name: r.name as string,
    brand: (r.brand as string) ?? null,
    packageLabel: (r.package_label as string) ?? null,
    saleUnit: r.sale_unit as SaleUnit,
    quantityMilli: r.quantity_milli as number,
    unitPriceCents: r.unit_price_cents as number,
    discountCents: r.discount_cents as number,
    priceSource: r.price_source as PriceSource,
    regularPriceCents: (r.regular_price_cents as number) ?? null,
    promoNote: (r.promo_note as string) ?? null,
    addedVia: r.added_via as CartItem['addedVia'],
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function toReceiptItem(r: Row): ReceiptItem {
  return {
    id: r.id as string,
    seq: (r.seq as number) ?? null,
    code: (r.code as string) ?? null,
    description: r.description as string,
    quantityMilli: (r.quantity_milli as number) ?? null,
    unit: r.unit as SaleUnit,
    rawUnit: (r.raw_unit as string) ?? null,
    unitPriceCents: (r.unit_price_cents as number) ?? null,
    totalCents: (r.total_cents as number) ?? null,
    discountCents: r.discount_cents as number,
    surchargeCents: r.surcharge_cents as number,
    confidence: r.confidence as number,
    issues: parseJson(r.issues_json, []),
    sourcePart: r.source_part as number,
    rawLines: parseJson(r.raw_lines_json, []),
    userEdited: !!r.user_edited,
  };
}

export interface StoredReceipt {
  id: string;
  purchaseId: string;
  status: 'draft' | 'reviewed';
  qrUrl: string | null;
  qrTotalCents: Cents | null;
  ocrProvider: string | null;
  parsed: ParsedReceipt;
  manualMatches: Record<string, string>;
  manualUnmatched: string[];
  createdAt: string;
}

export interface StoredReport extends ReconciliationReport {
  id: string;
  purchaseId: string;
  receiptId: string;
  divergences: (Divergence & { id: string })[];
}

export interface PurchaseSummary {
  purchase: Purchase;
  itemCount: number;
  cartTotalCents: Cents;
  receiptTotalCents: Cents | null;
  /** Descontos informados nos itens (carrinho). */
  discountCents: Cents;
  /** Economia registrada: descontos + diferença entre preço normal e promocional. */
  savingsCents: Cents;
  /** Valor final da compra: total da nota quando houver, senão o total registrado. */
  finalTotalCents: Cents;
  /** Valor final − orçamento (positivo = passou do orçamento); null sem orçamento. */
  budgetDiffCents: Cents | null;
  reportOverall: Severity | null;
  reportComplete: boolean | null;
  openDivergences: number;
  receiptStatus: 'none' | 'draft' | 'reviewed';
  latestReportId: string | null;
}

export interface NewCartItem {
  purchaseId: string;
  productId: string | null;
  barcode: string | null;
  name: string;
  brand: string | null;
  packageLabel: string | null;
  saleUnit: SaleUnit;
  quantityMilli: number;
  unitPriceCents: Cents;
  discountCents?: Cents;
  priceSource: PriceSource;
  regularPriceCents?: Cents | null;
  promoNote?: string | null;
  addedVia: 'scan' | 'manual';
}

export interface ProductPriceRow {
  product: Product;
  last: PriceRecord | null;
  storeCount: number;
}

export interface UnsharedPrice {
  id: string;
  locationId: string;
  barcode: string | null;
  name: string;
  brand: string | null;
  packageAmount: number | null;
  packageUnit: string | null;
  saleUnit: SaleUnit;
  unitPriceCents: Cents;
  regularPriceCents: Cents | null;
  promo: boolean;
  recordedAt: string;
}

export class Repository {
  constructor(
    private readonly db: SqlDriver,
    private readonly newId: () => string,
    private readonly clock: Clock = systemClock,
  ) {}

  /* ------------------------------ util ------------------------------ */

  private async enqueue(table: SyncedTable, rowId: string) {
    await this.db.run('INSERT INTO sync_queue (table_name, row_id, enqueued_at) VALUES (?, ?, ?)', [table, rowId, this.clock.now()]);
  }

  private async logEdit(entity: string, entityId: string, field: string, oldValue: unknown, newValue: unknown) {
    if (String(oldValue ?? '') === String(newValue ?? '')) return;
    const id = this.newId();
    const now = this.clock.now();
    await this.db.run(
      'INSERT INTO edit_log (id, entity, entity_id, field, old_value, new_value, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)',
      [id, entity, entityId, field, oldValue == null ? null : String(oldValue), newValue == null ? null : String(newValue), now, now],
    );
    await this.enqueue('edit_log', id);
  }

  async listEditLog(entity: string, entityId: string) {
    return this.db.all<{ field: string; old_value: string | null; new_value: string | null; created_at: string }>(
      'SELECT field, old_value, new_value, created_at FROM edit_log WHERE entity = ? AND entity_id = ? AND deleted_at IS NULL ORDER BY created_at DESC',
      [entity, entityId],
    );
  }

  /* ---------------------------- products ---------------------------- */

  async getProductByBarcode(barcode: string): Promise<Product | null> {
    const stripped = barcode.replace(/^0+/, '');
    const r = await this.db.first<Row>(
      "SELECT * FROM products WHERE deleted_at IS NULL AND (barcode = ? OR ltrim(barcode, '0') = ?) LIMIT 1",
      [barcode, stripped],
    );
    return r ? toProduct(r) : null;
  }

  async getProduct(id: string): Promise<Product | null> {
    const r = await this.db.first<Row>('SELECT * FROM products WHERE id = ? AND deleted_at IS NULL', [id]);
    return r ? toProduct(r) : null;
  }

  async listProducts(): Promise<Product[]> {
    const rows = await this.db.all<Row>('SELECT * FROM products WHERE deleted_at IS NULL ORDER BY name COLLATE NOCASE');
    return rows.map(toProduct);
  }

  async saveProduct(input: Omit<Product, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<Product> {
    const now = this.clock.now();
    if (input.id) {
      const prev = await this.getProduct(input.id);
      if (prev) {
        for (const f of ['name', 'brand', 'barcode', 'category', 'packageAmount', 'packageUnit', 'saleUnit'] as const) {
          await this.logEdit('product', prev.id, f, prev[f], input[f]);
        }
        await this.db.run(
          `UPDATE products SET barcode=?, name=?, brand=?, category=?, package_amount=?, package_unit=?, sale_unit=?, image_uri=?, source=?, updated_at=? WHERE id=?`,
          [input.barcode, input.name.trim(), input.brand, input.category, input.packageAmount, input.packageUnit, input.saleUnit, input.imageUri, input.source, now, prev.id],
        );
        await this.enqueue('products', prev.id);
        return (await this.getProduct(prev.id))!;
      }
    }
    const id = input.id ?? this.newId();
    await this.db.run(
      `INSERT INTO products (id, barcode, name, brand, category, package_amount, package_unit, sale_unit, image_uri, source, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, input.barcode, input.name.trim(), input.brand, input.category, input.packageAmount, input.packageUnit, input.saleUnit, input.imageUri, input.source, now, now],
    );
    await this.enqueue('products', id);
    return (await this.getProduct(id))!;
  }

  /* ---------------------------- purchases --------------------------- */

  async getActivePurchase(): Promise<Purchase | null> {
    const r = await this.db.first<Row>(
      "SELECT * FROM purchases WHERE status = 'active' AND mode = 'cart' AND deleted_at IS NULL ORDER BY started_at DESC LIMIT 1",
    );
    return r ? toPurchase(r) : null;
  }

  async getPurchase(id: string): Promise<Purchase | null> {
    const r = await this.db.first<Row>('SELECT * FROM purchases WHERE id = ? AND deleted_at IS NULL', [id]);
    return r ? toPurchase(r) : null;
  }

  async startPurchase(mode: Purchase['mode'] = 'cart', storeName: string | null = null, budgetCents: Cents | null = null): Promise<Purchase> {
    if (budgetCents != null && (!Number.isInteger(budgetCents) || budgetCents <= 0)) throw new Error('Orçamento inválido');
    const now = this.clock.now();
    const id = this.newId();
    await this.db.run(
      'INSERT INTO purchases (id, store_name, status, mode, budget_cents, started_at, updated_at) VALUES (?,?,?,?,?,?,?)',
      [id, storeName, mode === 'cart' ? 'active' : 'checked', mode, budgetCents, now, now],
    );
    await this.enqueue('purchases', id);
    return (await this.getPurchase(id))!;
  }

  async updatePurchase(id: string, patch: Partial<Pick<Purchase, 'storeName' | 'storeCnpj' | 'status' | 'budgetCents' | 'storeLocationId'>>) {
    const prev = await this.getPurchase(id);
    if (!prev) throw new Error('Compra não encontrada');
    const now = this.clock.now();
    const next = { ...prev, ...patch };
    if (next.budgetCents != null && (!Number.isInteger(next.budgetCents) || next.budgetCents <= 0)) throw new Error('Orçamento inválido');
    if (patch.storeName !== undefined) await this.logEdit('purchase', id, 'storeName', prev.storeName, patch.storeName);
    if (patch.budgetCents !== undefined) await this.logEdit('purchase', id, 'budgetCents', prev.budgetCents, patch.budgetCents);
    await this.db.run('UPDATE purchases SET store_name=?, store_cnpj=?, store_location_id=?, budget_cents=?, status=?, closed_at=?, updated_at=? WHERE id=?', [
      next.storeName,
      next.storeCnpj,
      next.storeLocationId,
      next.budgetCents,
      next.status,
      next.status === 'active' ? null : prev.closedAt ?? now,
      now,
      id,
    ]);
    await this.enqueue('purchases', id);
    // O supermercado da compra vale para os preços registrados nela.
    if (patch.storeName !== undefined || patch.storeLocationId !== undefined) {
      const rows = await this.db.all<{ id: string }>('SELECT id FROM price_history WHERE purchase_id = ? AND deleted_at IS NULL', [id]);
      for (const r of rows) {
        await this.db.run('UPDATE price_history SET store_name = ?, store_location_id = ?, shared_at = NULL, updated_at = ? WHERE id = ?', [next.storeName, next.storeLocationId, now, r.id]);
        await this.enqueue('price_history', r.id);
      }
    }
  }

  /** Exclusão lógica da compra e de tudo que pertence a ela (propagada na sincronização). */
  async deletePurchase(id: string) {
    const now = this.clock.now();
    await this.db.transaction(async () => {
      const children: [SyncedTable, string][] = [
        ['cart_items', 'SELECT id FROM cart_items WHERE purchase_id = ? AND deleted_at IS NULL'],
        ['receipts', 'SELECT id FROM receipts WHERE purchase_id = ? AND deleted_at IS NULL'],
        ['receipt_items', 'SELECT ri.id FROM receipt_items ri JOIN receipts r ON r.id = ri.receipt_id WHERE r.purchase_id = ? AND ri.deleted_at IS NULL'],
        ['reports', 'SELECT id FROM reports WHERE purchase_id = ? AND deleted_at IS NULL'],
        ['divergences', 'SELECT d.id FROM divergences d JOIN reports rp ON rp.id = d.report_id WHERE rp.purchase_id = ? AND d.deleted_at IS NULL'],
        ['scan_events', 'SELECT id FROM scan_events WHERE purchase_id = ? AND deleted_at IS NULL'],
        ['price_history', 'SELECT id FROM price_history WHERE purchase_id = ? AND deleted_at IS NULL'],
      ];
      for (const [table, sql] of children) {
        const rows = await this.db.all<{ id: string }>(sql, [id]);
        for (const r of rows) {
          await this.db.run(`UPDATE ${table} SET deleted_at = ?, updated_at = ? WHERE id = ?`, [now, now, r.id]);
          await this.enqueue(table, r.id);
        }
      }
      await this.db.run('UPDATE purchases SET deleted_at = ?, updated_at = ? WHERE id = ?', [now, now, id]);
      await this.enqueue('purchases', id);
    });
  }

  async listPurchaseSummaries(limit = 200): Promise<PurchaseSummary[]> {
    const rows = await this.db.all<Row>(
      'SELECT * FROM purchases WHERE deleted_at IS NULL ORDER BY started_at DESC LIMIT ?',
      [limit],
    );
    const out: PurchaseSummary[] = [];
    for (const r of rows) out.push(await this.summarize(toPurchase(r)));
    return out;
  }

  async getPurchaseSummary(id: string): Promise<PurchaseSummary | null> {
    const p = await this.getPurchase(id);
    return p ? this.summarize(p) : null;
  }

  private async summarize(purchase: Purchase): Promise<PurchaseSummary> {
    const items = await this.listCartItems(purchase.id);
    const receipt = await this.db.first<Row>(
      'SELECT id, status, total_cents, discount_cents, unassigned_discount_cents FROM receipts WHERE purchase_id = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1',
      [purchase.id],
    );
    const totals = cartTotals(items);
    const receiptTotal = (receipt?.total_cents as number) ?? null;
    let savings = itemsSavings(items);
    if (purchase.mode === 'receipt_only' && receipt) {
      // Sem carrinho, a economia registrada é o desconto impresso na nota.
      const lines = await this.db.first<{ d: number | null }>('SELECT SUM(discount_cents) AS d FROM receipt_items WHERE receipt_id = ? AND deleted_at IS NULL', [receipt.id]);
      savings = (receipt.discount_cents as number) ?? (lines?.d ?? 0) + ((receipt.unassigned_discount_cents as number) ?? 0);
    }
    const finalTotal = receiptTotal ?? totals.totalCents;
    const report = receipt
      ? await this.db.first<Row>('SELECT id, overall, complete, open_count FROM reports WHERE receipt_id = ? AND deleted_at IS NULL', [receipt.id])
      : null;
    return {
      purchase,
      itemCount: items.length,
      cartTotalCents: totals.totalCents,
      receiptTotalCents: receiptTotal,
      discountCents: totals.discountCents,
      savingsCents: savings,
      finalTotalCents: finalTotal,
      budgetDiffCents: purchase.budgetCents != null ? finalTotal - purchase.budgetCents : null,
      reportOverall: (report?.overall as Severity) ?? null,
      reportComplete: report ? !!report.complete : null,
      openDivergences: (report?.open_count as number) ?? 0,
      receiptStatus: receipt ? (receipt.status as 'draft' | 'reviewed') : 'none',
      latestReportId: (report?.id as string) ?? null,
    };
  }

  /* ---------------------------- cart items -------------------------- */

  async listCartItems(purchaseId: string): Promise<CartItem[]> {
    const rows = await this.db.all<Row>(
      'SELECT * FROM cart_items WHERE purchase_id = ? AND deleted_at IS NULL ORDER BY created_at, id',
      [purchaseId],
    );
    return rows.map(toCartItem);
  }

  async getCartItem(id: string): Promise<CartItem | null> {
    const r = await this.db.first<Row>('SELECT * FROM cart_items WHERE id = ? AND deleted_at IS NULL', [id]);
    return r ? toCartItem(r) : null;
  }

  async addCartItem(input: NewCartItem & { id?: string }): Promise<CartItem> {
    const now = this.clock.now();
    const id = input.id ?? this.newId();
    // Idempotente: reenviar a mesma inclusão (mesmo id) não cria item duplicado.
    const existing = await this.db.first<Row>('SELECT id FROM cart_items WHERE id = ?', [id]);
    if (existing) return (await this.getCartItem(id))!;
    await this.db.run(
      `INSERT INTO cart_items (id, purchase_id, product_id, barcode, name, brand, package_label, sale_unit, quantity_milli, unit_price_cents, discount_cents, price_source, regular_price_cents, promo_note, added_via, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, input.purchaseId, input.productId, input.barcode, input.name.trim(), input.brand, input.packageLabel, input.saleUnit, input.quantityMilli, input.unitPriceCents, input.discountCents ?? 0, input.priceSource, input.regularPriceCents ?? null, input.promoNote ?? null, input.addedVia, now, now],
    );
    await this.enqueue('cart_items', id);
    await this.touchPurchase(input.purchaseId);
    const item = (await this.getCartItem(id))!;
    await this.recordPriceForItem(item);
    return item;
  }

  async updateCartItem(id: string, patch: Partial<Omit<CartItem, 'id' | 'purchaseId' | 'createdAt' | 'updatedAt'>>): Promise<CartItem> {
    const prev = await this.getCartItem(id);
    if (!prev) throw new Error('Item não encontrado');
    const next = { ...prev, ...patch };
    for (const f of ['name', 'quantityMilli', 'unitPriceCents', 'discountCents', 'priceSource', 'saleUnit', 'promoNote', 'productId', 'regularPriceCents'] as const) {
      await this.logEdit('cart_item', id, f, prev[f], next[f]);
    }
    const now = this.clock.now();
    await this.db.run(
      `UPDATE cart_items SET product_id=?, barcode=?, name=?, brand=?, package_label=?, sale_unit=?, quantity_milli=?, unit_price_cents=?, discount_cents=?, price_source=?, regular_price_cents=?, promo_note=?, updated_at=? WHERE id=?`,
      [next.productId, next.barcode, next.name.trim(), next.brand, next.packageLabel, next.saleUnit, next.quantityMilli, next.unitPriceCents, next.discountCents, next.priceSource, next.regularPriceCents, next.promoNote, now, id],
    );
    await this.enqueue('cart_items', id);
    await this.touchPurchase(prev.purchaseId);
    const item = (await this.getCartItem(id))!;
    if (prev.unitPriceCents !== item.unitPriceCents || prev.productId !== item.productId || prev.regularPriceCents !== item.regularPriceCents || prev.promoNote !== item.promoNote) await this.recordPriceForItem(item);
    return item;
  }

  async removeCartItem(id: string) {
    const prev = await this.getCartItem(id);
    if (!prev) return;
    const now = this.clock.now();
    await this.db.run('UPDATE cart_items SET deleted_at = ?, updated_at = ? WHERE id = ?', [now, now, id]);
    await this.enqueue('cart_items', id);
    const ph = await this.db.first<{ id: string }>('SELECT id FROM price_history WHERE cart_item_id = ? AND deleted_at IS NULL', [id]);
    if (ph) {
      await this.db.run('UPDATE price_history SET deleted_at = ?, updated_at = ? WHERE id = ?', [now, now, ph.id]);
      await this.enqueue('price_history', ph.id);
    }
    await this.touchPurchase(prev.purchaseId);
  }

  private async touchPurchase(id: string) {
    await this.db.run('UPDATE purchases SET updated_at = ? WHERE id = ?', [this.clock.now(), id]);
    await this.enqueue('purchases', id);
  }

  /* --------------------------- price history ------------------------ */

  /** Um registro de preço por item do carrinho (atualizado se o preço for corrigido). */
  private async recordPriceForItem(item: CartItem) {
    if (!item.productId) return;
    const purchase = await this.getPurchase(item.purchaseId);
    const now = this.clock.now();
    const existing = await this.db.first<{ id: string }>('SELECT id FROM price_history WHERE cart_item_id = ?', [item.id]);
    const id = existing?.id ?? this.newId();
    const promo = item.promoNote || (item.regularPriceCents != null && item.regularPriceCents > item.unitPriceCents) ? 1 : 0;
    await this.db.run(
      `INSERT INTO price_history (id, product_id, purchase_id, cart_item_id, store_name, store_location_id, sale_unit, unit_price_cents, regular_price_cents, source, promo, recorded_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET product_id=excluded.product_id, unit_price_cents=excluded.unit_price_cents, regular_price_cents=excluded.regular_price_cents, source=excluded.source,
         promo=excluded.promo, sale_unit=excluded.sale_unit, store_name=excluded.store_name, store_location_id=excluded.store_location_id, shared_at=NULL, updated_at=excluded.updated_at, deleted_at=NULL`,
      [id, item.productId, item.purchaseId, item.id, purchase?.storeName ?? null, purchase?.storeLocationId ?? null, item.saleUnit, item.unitPriceCents, item.regularPriceCents, item.priceSource, promo, item.createdAt, now],
    );
    await this.enqueue('price_history', id);
  }

  /**
   * Registra um preço visto na gôndola sem colocar o produto no carrinho
   * (ex.: foto do produto com a etiqueta só para acompanhar o preço).
   */
  async recordPriceObservation(o: {
    productId: string;
    storeName: string | null;
    storeLocationId?: string | null;
    saleUnit: SaleUnit;
    unitPriceCents: Cents;
    regularPriceCents?: Cents | null;
    promo?: boolean;
    source: PriceSource;
  }): Promise<string> {
    if (!Number.isInteger(o.unitPriceCents) || o.unitPriceCents <= 0) throw new Error('Informe um preço válido.');
    const id = this.newId();
    const now = this.clock.now();
    await this.db.run(
      `INSERT INTO price_history (id, product_id, purchase_id, cart_item_id, store_name, store_location_id, sale_unit, unit_price_cents, regular_price_cents, source, promo, recorded_at, updated_at)
       VALUES (?,?,NULL,NULL,?,?,?,?,?,?,?,?,?)`,
      [id, o.productId, o.storeName?.trim() || null, o.storeLocationId ?? null, o.saleUnit, o.unitPriceCents, o.regularPriceCents ?? null, o.source, o.promo ? 1 : 0, now, now],
    );
    await this.enqueue('price_history', id);
    return id;
  }

  async removePriceRecord(id: string) {
    const now = this.clock.now();
    await this.db.run('UPDATE price_history SET deleted_at = ?, updated_at = ? WHERE id = ?', [now, now, id]);
    await this.enqueue('price_history', id);
  }

  private toPriceRecord(r: Row): PriceRecord {
    return {
      id: r.id as string,
      productId: r.product_id as string,
      purchaseId: (r.purchase_id as string) ?? null,
      storeName: (r.store as string) ?? null,
      storeLocationId: (r.location as string) ?? null,
      saleUnit: r.sale_unit as SaleUnit,
      unitPriceCents: r.unit_price_cents as number,
      regularPriceCents: (r.regular_price_cents as number) ?? null,
      source: r.source as PriceSource,
      promo: !!r.promo,
      recordedAt: r.recorded_at as string,
    };
  }

  async listPriceHistory(productId: string): Promise<PriceRecord[]> {
    const rows = await this.db.all<Row>(
      `SELECT ph.*, COALESCE(p.store_name, ph.store_name) AS store, COALESCE(p.store_location_id, ph.store_location_id) AS location
       FROM price_history ph LEFT JOIN purchases p ON p.id = ph.purchase_id
       WHERE ph.product_id = ? AND ph.deleted_at IS NULL ORDER BY ph.recorded_at DESC`,
      [productId],
    );
    return rows.map((r) => this.toPriceRecord(r));
  }

  /** Produtos com o último preço registrado (tela "Preços"). */
  async listProductPrices(): Promise<ProductPriceRow[]> {
    const products = await this.listProducts();
    const rows = await this.db.all<Row>(
      `SELECT ph.*, COALESCE(p.store_name, ph.store_name) AS store, COALESCE(p.store_location_id, ph.store_location_id) AS location
       FROM price_history ph LEFT JOIN purchases p ON p.id = ph.purchase_id
       WHERE ph.deleted_at IS NULL ORDER BY ph.recorded_at DESC`,
    );
    const byProduct = new Map<string, PriceRecord[]>();
    for (const r of rows) {
      const rec = this.toPriceRecord(r);
      byProduct.set(rec.productId, [...(byProduct.get(rec.productId) ?? []), rec]);
    }
    return products
      .map((product) => {
        const list = byProduct.get(product.id) ?? [];
        return { product, last: list[0] ?? null, storeCount: new Set(list.map((l) => l.storeLocationId ?? l.storeName ?? '')).size };
      })
      .filter((r) => r.last)
      .sort((a, b) => (a.last!.recordedAt < b.last!.recordedAt ? 1 : -1));
  }

  /** Produto sem código de barras com o mesmo nome, marca e embalagem (evita cadastros repetidos). */
  async findProductByIdentity(name: string, brand: string | null, packageAmount: number | null, packageUnit: string | null, saleUnit: SaleUnit): Promise<Product | null> {
    const key = productIdentityKey(name, brand, packageAmount, packageUnit);
    const rows = await this.db.all<Row>('SELECT * FROM products WHERE deleted_at IS NULL AND barcode IS NULL AND sale_unit = ?', [saleUnit]);
    const hit = rows.map(toProduct).find((p) => productIdentityKey(p.name, p.brand, p.packageAmount, p.packageUnit) === key);
    return hit ?? null;
  }

  /** Preços ainda não enviados à base da comunidade, de compras vinculadas a uma unidade cadastrada. */
  async listUnsharedPrices(limit = 50): Promise<UnsharedPrice[]> {
    const rows = await this.db.all<Row>(
      `SELECT ph.id, COALESCE(p.store_location_id, ph.store_location_id) AS location, pr.barcode, pr.name, pr.brand, pr.package_amount, pr.package_unit,
              ph.sale_unit, ph.unit_price_cents, ph.regular_price_cents, ph.promo, ph.recorded_at
       FROM price_history ph JOIN products pr ON pr.id = ph.product_id LEFT JOIN purchases p ON p.id = ph.purchase_id
       WHERE ph.deleted_at IS NULL AND ph.shared_at IS NULL AND ph.unit_price_cents > 0 AND ph.source <> 'previous'
         AND COALESCE(p.store_location_id, ph.store_location_id) IS NOT NULL
       ORDER BY ph.recorded_at DESC LIMIT ?`,
      [limit],
    );
    return rows.map((r) => ({
      id: r.id as string,
      locationId: r.location as string,
      barcode: (r.barcode as string) ?? null,
      name: r.name as string,
      brand: (r.brand as string) ?? null,
      packageAmount: (r.package_amount as number) ?? null,
      packageUnit: (r.package_unit as string) ?? null,
      saleUnit: r.sale_unit as SaleUnit,
      unitPriceCents: r.unit_price_cents as number,
      regularPriceCents: (r.regular_price_cents as number) ?? null,
      promo: !!r.promo,
      recordedAt: r.recorded_at as string,
    }));
  }

  /** Marca preços como tratados pelo servidor (coluna local; não é sincronizada). */
  async markPricesShared(ids: string[]) {
    const now = this.clock.now();
    for (const id of ids) await this.db.run('UPDATE price_history SET shared_at = ? WHERE id = ?', [now, id]);
  }

  /* ------------------------------ gastos ---------------------------- */

  /** Compras encerradas com valor, para o resumo financeiro. */
  async listSpendRecords(): Promise<SpendRecord[]> {
    const all = await this.listPurchaseSummaries(2000);
    return all
      .filter((s) => s.purchase.status !== 'active' && s.finalTotalCents > 0)
      .map((s) => ({
        id: s.purchase.id,
        storeName: s.purchase.storeName,
        date: s.purchase.startedAt,
        totalCents: s.finalTotalCents,
        savingsCents: s.savingsCents,
        budgetCents: s.purchase.budgetCents,
      }));
  }

  /* ---------------------------- scan events ------------------------- */

  async logScanEvent(e: { purchaseId: string | null; type: string; barcode?: string | null; cartItemId?: string | null; detail?: string | null }) {
    const id = this.newId();
    const now = this.clock.now();
    await this.db.run(
      'INSERT INTO scan_events (id, purchase_id, type, barcode, cart_item_id, detail, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)',
      [id, e.purchaseId, e.type, e.barcode ?? null, e.cartItemId ?? null, e.detail ?? null, now, now],
    );
    await this.enqueue('scan_events', id);
  }

  async listScanEvents(purchaseId: string) {
    return this.db.all<{ type: string; barcode: string | null; detail: string | null; created_at: string }>(
      'SELECT type, barcode, detail, created_at FROM scan_events WHERE purchase_id = ? AND deleted_at IS NULL ORDER BY created_at DESC',
      [purchaseId],
    );
  }

  /* ------------------------------ receipts -------------------------- */

  async saveParsedReceipt(
    purchaseId: string,
    parsed: ParsedReceipt,
    meta: { qrUrl?: string | null; qrTotalCents?: Cents | null; ocrProvider?: string | null } = {},
  ): Promise<string> {
    const id = this.newId();
    const now = this.clock.now();
    await this.db.transaction(async () => {
      await this.db.run(
        `INSERT INTO receipts (id, purchase_id, store_name, cnpj, issued_at, access_key, qr_url, qr_total_cents, item_count, subtotal_cents, discount_cents, surcharge_cents, total_cents, unassigned_discount_cents, status, ocr_provider, warnings_json, unparsed_json, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'draft',?,?,?,?,?)`,
        [id, purchaseId, parsed.storeName, parsed.cnpj, parsed.issuedAt, parsed.accessKey, meta.qrUrl ?? null, meta.qrTotalCents ?? null, parsed.totals.itemCount, parsed.totals.subtotalCents, parsed.totals.discountCents, parsed.totals.surchargeCents, parsed.totals.totalCents, parsed.unassignedDiscountCents, meta.ocrProvider ?? null, json(parsed.warnings), json(parsed.unparsedLines), now, now],
      );
      await this.enqueue('receipts', id);
      let pos = 0;
      for (const it of parsed.items) await this.insertReceiptItem(id, it, pos++);
    });
    const purchase = await this.getPurchase(purchaseId);
    if (purchase && !purchase.storeName && parsed.storeName) {
      await this.updatePurchase(purchaseId, { storeName: parsed.storeName, storeCnpj: parsed.cnpj });
    }
    return id;
  }

  private async insertReceiptItem(receiptId: string, it: ReceiptItem, position: number): Promise<string> {
    const id = this.newId();
    const now = this.clock.now();
    await this.db.run(
      `INSERT INTO receipt_items (id, receipt_id, position, seq, code, description, quantity_milli, unit, raw_unit, unit_price_cents, total_cents, discount_cents, surcharge_cents, confidence, issues_json, source_part, raw_lines_json, user_edited, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, receiptId, position, it.seq, it.code, it.description, it.quantityMilli, it.unit, it.rawUnit, it.unitPriceCents, it.totalCents, it.discountCents, it.surchargeCents, it.confidence, json(it.issues), it.sourcePart, json(it.rawLines), it.userEdited ? 1 : 0, now, now],
    );
    await this.enqueue('receipt_items', id);
    return id;
  }

  async getReceipt(receiptId: string): Promise<StoredReceipt | null> {
    const r = await this.db.first<Row>('SELECT * FROM receipts WHERE id = ? AND deleted_at IS NULL', [receiptId]);
    if (!r) return null;
    const rows = await this.db.all<Row>(
      'SELECT * FROM receipt_items WHERE receipt_id = ? AND deleted_at IS NULL ORDER BY position, created_at',
      [receiptId],
    );
    const manualMatches: Record<string, string> = {};
    const manualUnmatched: string[] = [];
    for (const row of rows) {
      if (row.manual_cart_item_id) manualMatches[row.id as string] = row.manual_cart_item_id as string;
      if (row.manual_unmatched) manualUnmatched.push(row.id as string);
    }
    return {
      id: receiptId,
      purchaseId: r.purchase_id as string,
      status: r.status as 'draft' | 'reviewed',
      qrUrl: (r.qr_url as string) ?? null,
      qrTotalCents: (r.qr_total_cents as number) ?? null,
      ocrProvider: (r.ocr_provider as string) ?? null,
      createdAt: r.created_at as string,
      manualMatches,
      manualUnmatched,
      parsed: {
        storeName: (r.store_name as string) ?? null,
        cnpj: (r.cnpj as string) ?? null,
        issuedAt: (r.issued_at as string) ?? null,
        accessKey: (r.access_key as string) ?? null,
        items: rows.map(toReceiptItem),
        unassignedDiscountCents: r.unassigned_discount_cents as number,
        totals: {
          itemCount: (r.item_count as number) ?? null,
          subtotalCents: (r.subtotal_cents as number) ?? null,
          discountCents: (r.discount_cents as number) ?? null,
          surchargeCents: (r.surcharge_cents as number) ?? null,
          totalCents: (r.total_cents as number) ?? null,
        },
        unparsedLines: parseJson(r.unparsed_json, []),
        warnings: parseJson(r.warnings_json, []),
      },
    };
  }

  async getLatestReceiptId(purchaseId: string): Promise<string | null> {
    const r = await this.db.first<{ id: string }>(
      'SELECT id FROM receipts WHERE purchase_id = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1',
      [purchaseId],
    );
    return r?.id ?? null;
  }

  async updateReceiptItem(id: string, patch: Partial<Pick<ReceiptItem, 'description' | 'quantityMilli' | 'unit' | 'unitPriceCents' | 'totalCents' | 'discountCents' | 'surchargeCents' | 'code'>>) {
    const prev = await this.db.first<Row>('SELECT * FROM receipt_items WHERE id = ?', [id]);
    if (!prev) throw new Error('Linha não encontrada');
    const p = toReceiptItem(prev);
    const next = { ...p, ...patch };
    for (const f of Object.keys(patch) as (keyof typeof patch)[]) await this.logEdit('receipt_item', id, f, p[f], next[f]);
    const now = this.clock.now();
    // Após a revisão manual, os problemas de leitura deixam de valer; a matemática é reavaliada.
    const issues = next.quantityMilli == null || next.totalCents == null ? p.issues : [];
    await this.db.run(
      `UPDATE receipt_items SET description=?, code=?, quantity_milli=?, unit=?, unit_price_cents=?, total_cents=?, discount_cents=?, surcharge_cents=?, user_edited=1, confidence=1, issues_json=?, updated_at=? WHERE id=?`,
      [next.description, next.code, next.quantityMilli, next.unit, next.unitPriceCents, next.totalCents, next.discountCents, next.surchargeCents, json(issues), now, id],
    );
    await this.enqueue('receipt_items', id);
  }

  /** Confirma uma linha sinalizada sem alterar valores. */
  async confirmReceiptItem(id: string) {
    const now = this.clock.now();
    await this.db.run("UPDATE receipt_items SET user_edited = 1, confidence = 1, issues_json = '[]', updated_at = ? WHERE id = ? AND quantity_milli IS NOT NULL AND total_cents IS NOT NULL", [now, id]);
    await this.enqueue('receipt_items', id);
  }

  async addReceiptItem(receiptId: string, item: Omit<ReceiptItem, 'id'>): Promise<string> {
    const max = await this.db.first<{ m: number | null }>('SELECT MAX(position) AS m FROM receipt_items WHERE receipt_id = ?', [receiptId]);
    return this.insertReceiptItem(receiptId, { ...item, id: '' }, (max?.m ?? -1) + 1);
  }

  async removeReceiptItem(id: string) {
    const now = this.clock.now();
    await this.db.run('UPDATE receipt_items SET deleted_at = ?, updated_at = ? WHERE id = ?', [now, now, id]);
    await this.enqueue('receipt_items', id);
  }

  async setManualMatch(receiptItemId: string, cartItemId: string | null | 'none') {
    const now = this.clock.now();
    await this.db.run('UPDATE receipt_items SET manual_cart_item_id = ?, manual_unmatched = ?, updated_at = ? WHERE id = ?', [
      cartItemId === 'none' ? null : cartItemId,
      cartItemId === 'none' ? 1 : 0,
      now,
      receiptItemId,
    ]);
    await this.enqueue('receipt_items', receiptItemId);
  }

  async updateReceiptHeader(id: string, patch: Partial<{ storeName: string | null; totalCents: Cents | null; subtotalCents: Cents | null; discountCents: Cents | null; status: 'draft' | 'reviewed' }>) {
    const r = await this.db.first<Row>('SELECT * FROM receipts WHERE id = ?', [id]);
    if (!r) throw new Error('Cupom não encontrado');
    const map: Record<string, string> = { storeName: 'store_name', totalCents: 'total_cents', subtotalCents: 'subtotal_cents', discountCents: 'discount_cents', status: 'status' };
    const now = this.clock.now();
    for (const [k, v] of Object.entries(patch)) {
      const col = map[k];
      await this.logEdit('receipt', id, k, r[col], v);
      await this.db.run(`UPDATE receipts SET ${col} = ?, updated_at = ? WHERE id = ?`, [v as SqlValue, now, id]);
    }
    await this.enqueue('receipts', id);
  }

  /* ------------------------------- reports -------------------------- */

  async saveReport(purchaseId: string, receiptId: string, report: ReconciliationReport): Promise<string> {
    const now = this.clock.now();
    const existing = await this.db.first<{ id: string }>('SELECT id FROM reports WHERE receipt_id = ?', [receiptId]);
    const id = existing?.id ?? this.newId();
    const openCount = report.divergences.filter((d) => d.severity !== 'green' && (d.resolution === 'open' || d.resolution === 'flag_cashier')).length;
    await this.db.transaction(async () => {
      await this.db.run(
        `INSERT INTO reports (id, purchase_id, receipt_id, scenario, overall, complete, cart_total_cents, receipt_total_cents, difference_cents, items_checked, open_count, limitations_json, matches_json, ok_cart_json, ok_receipt_json, generated_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET scenario=excluded.scenario, overall=excluded.overall, complete=excluded.complete, cart_total_cents=excluded.cart_total_cents,
           receipt_total_cents=excluded.receipt_total_cents, difference_cents=excluded.difference_cents, items_checked=excluded.items_checked, open_count=excluded.open_count,
           limitations_json=excluded.limitations_json, matches_json=excluded.matches_json, ok_cart_json=excluded.ok_cart_json, ok_receipt_json=excluded.ok_receipt_json,
           generated_at=excluded.generated_at, updated_at=excluded.updated_at, deleted_at=NULL`,
        [id, purchaseId, receiptId, report.scenario, report.overall, report.complete ? 1 : 0, report.cartTotalCents, report.receiptTotalCents, report.differenceCents, report.itemsChecked, openCount, json(report.limitations), json(report.matches), json(report.okCartItemIds), json(report.okReceiptItemIds), report.generatedAt, now],
      );
      await this.enqueue('reports', id);
      // Divergências: mantém o id de quem tem a mesma chave; remove (lógico) as que deixaram de existir.
      const prev = await this.db.all<{ id: string; key: string }>('SELECT id, key FROM divergences WHERE report_id = ? AND deleted_at IS NULL', [id]);
      const prevByKey = new Map(prev.map((p) => [p.key, p.id]));
      const keep = new Set<string>();
      for (const d of report.divergences) {
        const did = prevByKey.get(d.key) ?? (await this.db.first<{ id: string }>('SELECT id FROM divergences WHERE report_id = ? AND key = ?', [id, d.key]))?.id ?? this.newId();
        keep.add(did);
        await this.db.run(
          `INSERT INTO divergences (id, report_id, key, kind, group_name, severity, title, explanation, cart_item_id, receipt_item_ids_json, potential_diff_cents, resolution, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT(id) DO UPDATE SET kind=excluded.kind, group_name=excluded.group_name, severity=excluded.severity, title=excluded.title, explanation=excluded.explanation,
             cart_item_id=excluded.cart_item_id, receipt_item_ids_json=excluded.receipt_item_ids_json, potential_diff_cents=excluded.potential_diff_cents, resolution=excluded.resolution,
             updated_at=excluded.updated_at, deleted_at=NULL`,
          [did, id, d.key, d.kind, d.group, d.severity, d.title, d.explanation, d.cartItemId, json(d.receiptItemIds), d.potentialDiffCents, d.resolution, now],
        );
        await this.enqueue('divergences', did);
      }
      for (const p of prev) {
        if (keep.has(p.id)) continue;
        await this.db.run('UPDATE divergences SET deleted_at = ?, updated_at = ? WHERE id = ?', [now, now, p.id]);
        await this.enqueue('divergences', p.id);
      }
    });
    return id;
  }

  async getReport(reportId: string): Promise<StoredReport | null> {
    const r = await this.db.first<Row>('SELECT * FROM reports WHERE id = ? AND deleted_at IS NULL', [reportId]);
    if (!r) return null;
    const divs = await this.db.all<Row>('SELECT * FROM divergences WHERE report_id = ? AND deleted_at IS NULL', [reportId]);
    return {
      id: reportId,
      purchaseId: r.purchase_id as string,
      receiptId: r.receipt_id as string,
      scenario: r.scenario as StoredReport['scenario'],
      overall: r.overall as Severity,
      complete: !!r.complete,
      cartTotalCents: (r.cart_total_cents as number) ?? null,
      receiptTotalCents: (r.receipt_total_cents as number) ?? null,
      differenceCents: (r.difference_cents as number) ?? null,
      itemsChecked: r.items_checked as number,
      limitations: parseJson(r.limitations_json, []),
      matches: parseJson(r.matches_json, []),
      okCartItemIds: parseJson(r.ok_cart_json, []),
      okReceiptItemIds: parseJson(r.ok_receipt_json, []),
      generatedAt: r.generated_at as string,
      divergences: divs.map((d) => ({
        id: d.id as string,
        key: d.key as string,
        kind: d.kind as Divergence['kind'],
        group: d.group_name as Divergence['group'],
        severity: d.severity as Severity,
        title: d.title as string,
        explanation: d.explanation as string,
        cartItemId: (d.cart_item_id as string) ?? null,
        receiptItemIds: parseJson(d.receipt_item_ids_json, []),
        potentialDiffCents: (d.potential_diff_cents as number) ?? null,
        resolution: d.resolution as Resolution,
      })),
    };
  }

  async getReportIdForReceipt(receiptId: string): Promise<string | null> {
    const r = await this.db.first<{ id: string }>('SELECT id FROM reports WHERE receipt_id = ? AND deleted_at IS NULL', [receiptId]);
    return r?.id ?? null;
  }

  async getResolutions(receiptId: string): Promise<Record<string, Resolution>> {
    const rows = await this.db.all<{ key: string; resolution: Resolution }>(
      `SELECT d.key, d.resolution FROM divergences d JOIN reports r ON r.id = d.report_id WHERE r.receipt_id = ? AND d.deleted_at IS NULL`,
      [receiptId],
    );
    return Object.fromEntries(rows.map((r) => [r.key, r.resolution]));
  }

  async setResolution(divergenceId: string, resolution: Resolution) {
    const d = await this.db.first<Row>('SELECT * FROM divergences WHERE id = ?', [divergenceId]);
    if (!d) return;
    await this.logEdit('divergence', divergenceId, 'resolution', d.resolution, resolution);
    const now = this.clock.now();
    await this.db.run('UPDATE divergences SET resolution = ?, updated_at = ? WHERE id = ?', [resolution, now, divergenceId]);
    await this.enqueue('divergences', divergenceId);
    // Recalcula a contagem de pendências e a cor geral do relatório
    const rows = await this.db.all<{ severity: Severity; resolution: Resolution }>(
      'SELECT severity, resolution FROM divergences WHERE report_id = ? AND deleted_at IS NULL',
      [d.report_id as string],
    );
    const open = rows.filter((x) => x.severity !== 'green' && (x.resolution === 'open' || x.resolution === 'flag_cashier'));
    const rep = await this.db.first<{ complete: number }>('SELECT complete FROM reports WHERE id = ?', [d.report_id as string]);
    const overall: Severity = open.some((x) => x.severity === 'red') ? 'red' : open.length || !rep?.complete ? 'yellow' : 'green';
    await this.db.run('UPDATE reports SET open_count = ?, overall = ?, updated_at = ? WHERE id = ?', [open.length, overall, now, d.report_id as string]);
    await this.enqueue('reports', d.report_id as string);
  }

  /* ---------------------------- preferências ------------------------- */

  async getSetting(key: string): Promise<string | null> {
    const r = await this.db.first<{ value: string }>('SELECT value FROM meta WHERE key = ?', [`pref_${key}`]);
    return r?.value ?? null;
  }

  async setSetting(key: string, value: string | null) {
    if (value == null) await this.db.run('DELETE FROM meta WHERE key = ?', [`pref_${key}`]);
    else await this.db.run('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', [`pref_${key}`, value]);
  }

  /* ------------------------------ sync ------------------------------ */

  async getRow(table: SyncedTable, id: string): Promise<Row | null> {
    return this.db.first<Row>(`SELECT * FROM ${table} WHERE id = ?`, [id]);
  }

  async pendingSyncCount(): Promise<number> {
    const r = await this.db.first<{ c: number }>('SELECT COUNT(DISTINCT table_name || row_id) AS c FROM sync_queue');
    return r?.c ?? 0;
  }

  /** Apaga todos os dados locais (usado em "Excluir meus dados" e ao sair da conta, se o usuário pedir). */
  async wipeAll() {
    await this.db.transaction(async () => {
      for (const t of ['divergences', 'reports', 'receipt_items', 'receipts', 'scan_events', 'price_history', 'cart_items', 'purchases', 'products', 'edit_log', 'sync_queue']) {
        await this.db.run(`DELETE FROM ${t}`);
      }
      await this.db.run("DELETE FROM meta WHERE key LIKE 'sync_%'");
    });
  }
}
