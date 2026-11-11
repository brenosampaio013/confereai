import type { SqlDriver } from './sql';

/**
 * Migrações do banco local (SQLite no aparelho). Cada entrada é aplicada uma única vez,
 * em ordem, e registrada em `meta.schema_version`.
 */
export const LOCAL_MIGRATIONS: string[] = [
  `
  CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY NOT NULL, value TEXT);

  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY NOT NULL,
    barcode TEXT,
    name TEXT NOT NULL,
    brand TEXT,
    category TEXT,
    package_amount INTEGER,
    package_unit TEXT CHECK (package_unit IN ('g','ml','un')),
    sale_unit TEXT NOT NULL DEFAULT 'un' CHECK (sale_unit IN ('un','kg','l')),
    image_uri TEXT,
    source TEXT NOT NULL DEFAULT 'user',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );
  CREATE UNIQUE INDEX IF NOT EXISTS products_barcode_uq ON products(barcode) WHERE barcode IS NOT NULL AND deleted_at IS NULL;

  CREATE TABLE IF NOT EXISTS purchases (
    id TEXT PRIMARY KEY NOT NULL,
    store_name TEXT,
    store_cnpj TEXT,
    status TEXT NOT NULL CHECK (status IN ('active','checked','closed')),
    mode TEXT NOT NULL DEFAULT 'cart' CHECK (mode IN ('cart','receipt_only')),
    started_at TEXT NOT NULL,
    closed_at TEXT,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );
  CREATE INDEX IF NOT EXISTS purchases_status_idx ON purchases(status, started_at);

  CREATE TABLE IF NOT EXISTS cart_items (
    id TEXT PRIMARY KEY NOT NULL,
    purchase_id TEXT NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
    product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
    barcode TEXT,
    name TEXT NOT NULL,
    brand TEXT,
    package_label TEXT,
    sale_unit TEXT NOT NULL CHECK (sale_unit IN ('un','kg','l')),
    quantity_milli INTEGER NOT NULL CHECK (quantity_milli > 0),
    unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
    discount_cents INTEGER NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
    price_source TEXT NOT NULL,
    promo_note TEXT,
    added_via TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );
  CREATE INDEX IF NOT EXISTS cart_items_purchase_idx ON cart_items(purchase_id);

  CREATE TABLE IF NOT EXISTS receipts (
    id TEXT PRIMARY KEY NOT NULL,
    purchase_id TEXT NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
    store_name TEXT,
    cnpj TEXT,
    issued_at TEXT,
    access_key TEXT,
    qr_url TEXT,
    qr_total_cents INTEGER,
    item_count INTEGER,
    subtotal_cents INTEGER,
    discount_cents INTEGER,
    surcharge_cents INTEGER,
    total_cents INTEGER,
    unassigned_discount_cents INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','reviewed')),
    ocr_provider TEXT,
    warnings_json TEXT NOT NULL DEFAULT '[]',
    unparsed_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );
  CREATE INDEX IF NOT EXISTS receipts_purchase_idx ON receipts(purchase_id);

  CREATE TABLE IF NOT EXISTS receipt_items (
    id TEXT PRIMARY KEY NOT NULL,
    receipt_id TEXT NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    seq INTEGER,
    code TEXT,
    description TEXT NOT NULL,
    quantity_milli INTEGER,
    unit TEXT NOT NULL CHECK (unit IN ('un','kg','l')),
    raw_unit TEXT,
    unit_price_cents INTEGER,
    total_cents INTEGER,
    discount_cents INTEGER NOT NULL DEFAULT 0,
    surcharge_cents INTEGER NOT NULL DEFAULT 0,
    confidence REAL NOT NULL,
    issues_json TEXT NOT NULL DEFAULT '[]',
    source_part INTEGER NOT NULL DEFAULT 0,
    raw_lines_json TEXT NOT NULL DEFAULT '[]',
    user_edited INTEGER NOT NULL DEFAULT 0,
    manual_cart_item_id TEXT,
    manual_unmatched INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );
  CREATE INDEX IF NOT EXISTS receipt_items_receipt_idx ON receipt_items(receipt_id, position);

  CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY NOT NULL,
    purchase_id TEXT NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
    receipt_id TEXT NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
    scenario TEXT NOT NULL,
    overall TEXT NOT NULL CHECK (overall IN ('green','yellow','red')),
    complete INTEGER NOT NULL,
    cart_total_cents INTEGER,
    receipt_total_cents INTEGER,
    difference_cents INTEGER,
    items_checked INTEGER NOT NULL,
    open_count INTEGER NOT NULL,
    limitations_json TEXT NOT NULL DEFAULT '[]',
    matches_json TEXT NOT NULL DEFAULT '[]',
    ok_cart_json TEXT NOT NULL DEFAULT '[]',
    ok_receipt_json TEXT NOT NULL DEFAULT '[]',
    generated_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );
  CREATE UNIQUE INDEX IF NOT EXISTS reports_receipt_uq ON reports(receipt_id);

  CREATE TABLE IF NOT EXISTS divergences (
    id TEXT PRIMARY KEY NOT NULL,
    report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    kind TEXT NOT NULL,
    group_name TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('green','yellow','red')),
    title TEXT NOT NULL,
    explanation TEXT NOT NULL,
    cart_item_id TEXT,
    receipt_item_ids_json TEXT NOT NULL DEFAULT '[]',
    potential_diff_cents INTEGER,
    resolution TEXT NOT NULL DEFAULT 'open' CHECK (resolution IN ('open','confirmed_ok','flag_cashier','dismissed')),
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );
  CREATE UNIQUE INDEX IF NOT EXISTS divergences_report_key_uq ON divergences(report_id, key);

  CREATE TABLE IF NOT EXISTS price_history (
    id TEXT PRIMARY KEY NOT NULL,
    product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    purchase_id TEXT REFERENCES purchases(id) ON DELETE SET NULL,
    cart_item_id TEXT,
    store_name TEXT,
    sale_unit TEXT NOT NULL,
    unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
    source TEXT NOT NULL,
    promo INTEGER NOT NULL DEFAULT 0,
    recorded_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );
  CREATE INDEX IF NOT EXISTS price_history_product_idx ON price_history(product_id, recorded_at);
  CREATE UNIQUE INDEX IF NOT EXISTS price_history_item_uq ON price_history(cart_item_id) WHERE cart_item_id IS NOT NULL;

  CREATE TABLE IF NOT EXISTS scan_events (
    id TEXT PRIMARY KEY NOT NULL,
    purchase_id TEXT REFERENCES purchases(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    barcode TEXT,
    cart_item_id TEXT,
    detail TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );
  CREATE INDEX IF NOT EXISTS scan_events_purchase_idx ON scan_events(purchase_id, created_at);

  CREATE TABLE IF NOT EXISTS edit_log (
    id TEXT PRIMARY KEY NOT NULL,
    entity TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    field TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );
  CREATE INDEX IF NOT EXISTS edit_log_entity_idx ON edit_log(entity, entity_id);

  CREATE TABLE IF NOT EXISTS sync_queue (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    table_name TEXT NOT NULL,
    row_id TEXT NOT NULL,
    enqueued_at TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT
  );
  CREATE INDEX IF NOT EXISTS sync_queue_row_idx ON sync_queue(table_name, row_id);
  `,
  // 2 — orçamento da compra, unidade do supermercado, preço normal × promocional e base de preços
  `
  ALTER TABLE purchases ADD COLUMN budget_cents INTEGER;
  ALTER TABLE purchases ADD COLUMN store_location_id TEXT;
  ALTER TABLE cart_items ADD COLUMN regular_price_cents INTEGER;
  ALTER TABLE price_history ADD COLUMN store_location_id TEXT;
  ALTER TABLE price_history ADD COLUMN regular_price_cents INTEGER;
  ALTER TABLE price_history ADD COLUMN shared_at TEXT;
  CREATE INDEX IF NOT EXISTS price_history_unshared_idx ON price_history(shared_at) WHERE shared_at IS NULL;
  `,
];

export async function migrate(db: SqlDriver): Promise<void> {
  await db.exec('PRAGMA foreign_keys = ON;');
  await db.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY NOT NULL, value TEXT);');
  const row = await db.first<{ value: string }>("SELECT value FROM meta WHERE key = 'schema_version'");
  let version = row ? Number(row.value) : 0;
  while (version < LOCAL_MIGRATIONS.length) {
    const sql = LOCAL_MIGRATIONS[version];
    await db.transaction(async () => {
      await db.exec(sql);
      await db.run("INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?)", [String(version + 1)]);
    });
    version += 1;
  }
}

/** Tabelas sincronizadas com o Supabase (mesmos nomes no servidor). */
export const SYNCED_TABLES = [
  'products',
  'purchases',
  'cart_items',
  'receipts',
  'receipt_items',
  'reports',
  'divergences',
  'price_history',
  'scan_events',
  'edit_log',
] as const;
export type SyncedTable = (typeof SYNCED_TABLES)[number];
