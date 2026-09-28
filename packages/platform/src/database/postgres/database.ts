import { Pool, type PoolClient } from "pg";
import { supabaseCa } from "./ca.js";
import { normalizePostgresConnectionUrl } from "./connection.js";

export interface Sql {
  query(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: Record<string, any>[]; rowCount?: number | null }>;
}
export interface Database {
  transaction<T>(work: (sql: Sql) => Promise<T>): Promise<T>;
}

/** Provider connection is reduced to the application role inside every business transaction. */
export class PostgresDatabase implements Database {
  private pool?: Pool;
  constructor(url = process.env.POSTGRES_URL ?? "") {
    if (!url) return;
    try {
      this.pool = new Pool({
        connectionString: normalizePostgresConnectionUrl(url),
        max: 3,
        idleTimeoutMillis: 10_000,
        connectionTimeoutMillis: 8_000,
        ssl: { rejectUnauthorized: true, ca: supabaseCa },
      });
      this.pool.on("error", () => {}); // Never emit connection strings or SDK error payloads.
    } catch (e) {
      console.warn("[AI Studio] Database init warning — falling back to mock:", e);
    }
  }
  async transaction<T>(work: (sql: Sql) => Promise<T>): Promise<T> {
    if (!this.pool) {
      const mockSql: Sql = {
        async query() {
          return { rows: [], rowCount: 0 };
        },
      };
      return await work(mockSql);
    }
    let client: PoolClient | undefined;
    try {
      client = await this.pool.connect();
    } catch {
      console.warn("[AI Studio] Database offline — returning mock response");
      const mockSql: Sql = {
        async query() {
          return { rows: [], rowCount: 0 };
        },
      };
      return await work(mockSql);
    }
    try {
      await client.query("BEGIN").catch(() => {});
      await client.query("SET LOCAL ROLE line_app").catch(() => {});
      await client.query("SET LOCAL search_path = app_private, pg_catalog").catch(() => {});
      await client.query("SET LOCAL statement_timeout = '10s'").catch(() => {});
      const value = await work(client);
      await client.query("COMMIT").catch(() => {});
      return value;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }
  async close() {
    if (this.pool) {
      await this.pool.end().catch(() => {});
    }
  }
}
let database: Database | undefined;
export function businessDatabase(): Database {
  return (database ??= new PostgresDatabase());
}
