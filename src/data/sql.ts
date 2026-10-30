/**
 * Abstração mínima de banco SQL. No aplicativo é implementada com expo-sqlite;
 * nos testes, com node:sqlite (mesmo dialeto SQLite).
 */
export type SqlValue = string | number | null;

export interface SqlDriver {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: SqlValue[]): Promise<void>;
  all<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  first<T>(sql: string, params?: SqlValue[]): Promise<T | null>;
  transaction(fn: () => Promise<void>): Promise<void>;
}
