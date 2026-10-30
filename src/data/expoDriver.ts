import * as SQLite from 'expo-sqlite';
import type { SqlDriver, SqlValue } from './sql';

/** Implementação de SqlDriver com expo-sqlite (banco local no aparelho). */
export class ExpoSqliteDriver implements SqlDriver {
  private depth = 0;
  private constructor(private readonly db: SQLite.SQLiteDatabase) {}

  static async open(name = 'confere-ai.db') {
    const db = await SQLite.openDatabaseAsync(name);
    await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    return new ExpoSqliteDriver(db);
  }

  async exec(sql: string) {
    await this.db.execAsync(sql);
  }
  async run(sql: string, params: SqlValue[] = []) {
    await this.db.runAsync(sql, params);
  }
  async all<T>(sql: string, params: SqlValue[] = []) {
    return this.db.getAllAsync<T>(sql, params);
  }
  async first<T>(sql: string, params: SqlValue[] = []) {
    return (await this.db.getFirstAsync<T>(sql, params)) ?? null;
  }
  async transaction(fn: () => Promise<void>) {
    const sp = `sp${this.depth++}`;
    await this.db.execAsync(`SAVEPOINT ${sp}`);
    try {
      await fn();
      await this.db.execAsync(`RELEASE ${sp}`);
    } catch (e) {
      await this.db.execAsync(`ROLLBACK TO ${sp}; RELEASE ${sp}`);
      throw e;
    } finally {
      this.depth--;
    }
  }
}
