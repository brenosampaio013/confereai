/**
 * Sincronização local → nuvem (Supabase) e nuvem → local.
 *
 * - Todas as linhas têm UUID gerado no aparelho, então reenviar é idempotente (upsert por id):
 *   uma queda de conexão no meio do envio nunca cria itens duplicados.
 * - A fila só é limpa depois que o servidor confirma o envio.
 * - Conflitos: vence a versão com `updated_at` mais recente (no servidor, um gatilho
 *   ignora atualizações mais antigas que a versão armazenada).
 * - Exclusões são lógicas (`deleted_at`) para que se propaguem entre aparelhos.
 */
import { SYNCED_TABLES, SyncedTable } from './schema';
import type { SqlDriver, SqlValue } from './sql';

export interface RemoteAdapter {
  upsert(table: SyncedTable, rows: Record<string, unknown>[]): Promise<void>;
  /** Linhas alteradas no servidor depois de `since` (ISO), do usuário autenticado. */
  pullSince(table: SyncedTable, since: string | null): Promise<Record<string, unknown>[]>;
}

export interface SyncResult {
  pushed: number;
  pulled: number;
  failed: number;
  skipped?: 'offline' | 'not_authenticated' | 'busy';
  error?: string;
}

/** Colunas que existem apenas no aparelho e não são enviadas. */
const LOCAL_ONLY: Partial<Record<SyncedTable, string[]>> = {
  products: ['image_uri'],
  price_history: ['shared_at'],
};

const BOOL_COLUMNS: Partial<Record<SyncedTable, string[]>> = {
  receipt_items: ['user_edited', 'manual_unmatched'],
  reports: ['complete'],
  price_history: ['promo'],
};

const JSON_COLUMNS: Partial<Record<SyncedTable, string[]>> = {
  receipts: ['warnings_json', 'unparsed_json'],
  receipt_items: ['issues_json', 'raw_lines_json'],
  reports: ['limitations_json', 'matches_json', 'ok_cart_json', 'ok_receipt_json'],
  divergences: ['receipt_item_ids_json'],
};

export function toRemoteRow(table: SyncedTable, row: Record<string, SqlValue>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const skip = new Set(LOCAL_ONLY[table] ?? []);
  const bools = new Set(BOOL_COLUMNS[table] ?? []);
  const jsons = new Set(JSON_COLUMNS[table] ?? []);
  for (const [k, v] of Object.entries(row)) {
    if (skip.has(k)) continue;
    if (bools.has(k)) out[k] = !!v;
    else if (jsons.has(k)) out[k.replace(/_json$/, '')] = typeof v === 'string' ? safeParse(v) : [];
    else out[k] = v;
  }
  return out;
}

export function fromRemoteRow(table: SyncedTable, row: Record<string, unknown>): Record<string, SqlValue> {
  const out: Record<string, SqlValue> = {};
  const bools = new Set(BOOL_COLUMNS[table] ?? []);
  const jsons = new Set((JSON_COLUMNS[table] ?? []).map((c) => c.replace(/_json$/, '')));
  for (const [k, v] of Object.entries(row)) {
    if (k === 'user_id') continue;
    if (bools.has(k)) out[k] = v ? 1 : 0;
    else if (jsons.has(k)) out[`${k}_json`] = JSON.stringify(v ?? []);
    // O Postgres devolve "…+00:00" com microssegundos; o aparelho guarda ISO "…Z".
    // Normalizar mantém a comparação de versões (texto) correta. issued_at não tem fuso.
    else if (k.endsWith('_at') && k !== 'issued_at' && typeof v === 'string' && !Number.isNaN(Date.parse(v))) out[k] = new Date(v).toISOString();
    else out[k] = (v as SqlValue) ?? null;
  }
  return out;
}

function safeParse(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return [];
  }
}

export class SyncService {
  private running = false;

  constructor(
    private readonly db: SqlDriver,
    private readonly remote: RemoteAdapter,
    private readonly env: { isOnline: () => Promise<boolean>; isAuthenticated: () => Promise<boolean> },
  ) {}

  async sync(): Promise<SyncResult> {
    if (this.running) return { pushed: 0, pulled: 0, failed: 0, skipped: 'busy' };
    if (!(await this.env.isOnline())) return { pushed: 0, pulled: 0, failed: 0, skipped: 'offline' };
    if (!(await this.env.isAuthenticated())) return { pushed: 0, pulled: 0, failed: 0, skipped: 'not_authenticated' };
    this.running = true;
    try {
      const push = await this.push();
      const pulled = push.failed === 0 ? await this.pull() : 0;
      return { ...push, pulled };
    } finally {
      this.running = false;
    }
  }

  async push(): Promise<{ pushed: number; failed: number; error?: string }> {
    const queue = await this.db.all<{ seq: number; table_name: SyncedTable; row_id: string }>(
      'SELECT seq, table_name, row_id FROM sync_queue ORDER BY seq',
    );
    if (!queue.length) return { pushed: 0, failed: 0 };
    const maxSeq = queue[queue.length - 1].seq;
    let pushed = 0;
    let failed = 0;
    let error: string | undefined;
    // Respeita a ordem das tabelas (pais antes de filhos) por causa das chaves estrangeiras.
    for (const table of SYNCED_TABLES) {
      const ids = Array.from(new Set(queue.filter((q) => q.table_name === table).map((q) => q.row_id)));
      if (!ids.length) continue;
      const rows: Record<string, unknown>[] = [];
      for (const id of ids) {
        const row = await this.db.first<Record<string, SqlValue>>(`SELECT * FROM ${table} WHERE id = ?`, [id]);
        if (row) rows.push(toRemoteRow(table, row));
      }
      try {
        for (let i = 0; i < rows.length; i += 200) await this.remote.upsert(table, rows.slice(i, i + 200));
        // Remove da fila somente o que foi confirmado e enfileirado até o início deste envio.
        const placeholders = ids.map(() => '?').join(',');
        await this.db.run(`DELETE FROM sync_queue WHERE table_name = ? AND row_id IN (${placeholders}) AND seq <= ?`, [table, ...ids, maxSeq]);
        pushed += ids.length;
      } catch (e) {
        failed += ids.length;
        error = e instanceof Error ? e.message : String(e);
        const placeholders = ids.map(() => '?').join(',');
        await this.db.run(
          `UPDATE sync_queue SET attempts = attempts + 1, last_error = ? WHERE table_name = ? AND row_id IN (${placeholders})`,
          [error, table, ...ids],
        );
        // Filhos dependem dos pais: interrompe para tentar de novo depois.
        break;
      }
    }
    if (!failed) await this.db.run("INSERT OR REPLACE INTO meta (key, value) VALUES ('sync_last_push', ?)", [new Date().toISOString()]);
    return { pushed, failed, error };
  }

  async pull(): Promise<number> {
    let count = 0;
    for (const table of SYNCED_TABLES) {
      const key = `sync_last_pull_${table}`;
      const since = (await this.db.first<{ value: string }>('SELECT value FROM meta WHERE key = ?', [key]))?.value ?? null;
      const rows = await this.remote.pullSince(table, since);
      let maxUpdated = since;
      for (const remoteRow of rows) {
        const row = fromRemoteRow(table, remoteRow);
        const id = row.id as string;
        const local = await this.db.first<{ updated_at: string }>(`SELECT updated_at FROM ${table} WHERE id = ?`, [id]);
        const pendingLocal = await this.db.first<{ seq: number }>('SELECT seq FROM sync_queue WHERE table_name = ? AND row_id = ? LIMIT 1', [table, id]);
        const remoteUpdated = String(row.updated_at);
        if (!maxUpdated || remoteUpdated > maxUpdated) maxUpdated = remoteUpdated;
        // Versão local mais nova (ou ainda não enviada e não mais antiga) prevalece.
        if (local && (local.updated_at > remoteUpdated || (pendingLocal && local.updated_at >= remoteUpdated))) continue;
        try {
          await this.upsertLocal(table, row);
        } catch (e) {
          // Mesmo código de barras cadastrado em dois aparelhos com ids diferentes: mantém o
          // cadastro local com o código e o remoto sem ele (para preservar as referências).
          if (table === 'products' && row.barcode != null) await this.upsertLocal(table, { ...row, barcode: null });
          else throw e;
        }
        count++;
      }
      if (maxUpdated && maxUpdated !== since) {
        await this.db.run('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', [key, maxUpdated]);
      }
    }
    return count;
  }

  private async upsertLocal(table: SyncedTable, row: Record<string, SqlValue>) {
    const cols = await this.columnsOf(table);
    const entries = Object.entries(row).filter(([k]) => cols.has(k));
    const names = entries.map(([k]) => k);
    await this.db.run(
      `INSERT INTO ${table} (${names.join(',')}) VALUES (${names.map(() => '?').join(',')})
       ON CONFLICT(id) DO UPDATE SET ${names.filter((n) => n !== 'id').map((n) => `${n}=excluded.${n}`).join(',')}`,
      entries.map(([, v]) => v),
    );
  }

  private columnCache = new Map<string, Set<string>>();
  private async columnsOf(table: string): Promise<Set<string>> {
    const cached = this.columnCache.get(table);
    if (cached) return cached;
    const rows = await this.db.all<{ name: string }>(`PRAGMA table_info(${table})`);
    const set = new Set(rows.map((r) => r.name));
    this.columnCache.set(table, set);
    return set;
  }
}
