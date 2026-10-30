import { DatabaseSync } from 'node:sqlite';
import type { SqlDriver, SqlValue } from '../src/data/sql';

/** Implementação de SqlDriver para testes, usando o SQLite embutido no Node. */
export class NodeSqliteDriver implements SqlDriver {
  readonly raw: DatabaseSync;
  constructor(path = ':memory:') {
    this.raw = new DatabaseSync(path);
  }
  async exec(sql: string) {
    this.raw.exec(sql);
  }
  async run(sql: string, params: SqlValue[] = []) {
    this.raw.prepare(sql).run(...params);
  }
  async all<T>(sql: string, params: SqlValue[] = []) {
    return this.raw.prepare(sql).all(...params) as T[];
  }
  async first<T>(sql: string, params: SqlValue[] = []) {
    return (this.raw.prepare(sql).get(...params) as T | undefined) ?? null;
  }
  private depth = 0;
  async transaction(fn: () => Promise<void>) {
    const sp = `sp${this.depth++}`;
    this.raw.exec(`SAVEPOINT ${sp}`);
    try {
      await fn();
      this.raw.exec(`RELEASE ${sp}`);
    } catch (e) {
      this.raw.exec(`ROLLBACK TO ${sp}; RELEASE ${sp}`);
      throw e;
    } finally {
      this.depth--;
    }
  }
  close() {
    this.raw.close();
  }
}
