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
  private pool: Pool;
  constructor(url = process.env.POSTGRES_URL ?? "") {
    this.pool = new Pool({
      connectionString: normalizePostgresConnectionUrl(url),
      max: 3,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 8_000,
      ssl: { rejectUnauthorized: true, ca: supabaseCa },
    });
    this.pool.on("error", () => {}); // Never emit connection strings or SDK error payloads.
  }
  async transaction<T>(work: (sql: Sql) => Promise<T>): Promise<T> {
    const client: PoolClient = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE line_app");
      await client.query("SET LOCAL search_path = app_private, pg_catalog");
      await client.query("SET LOCAL statement_timeout = '10s'");
      const value = await work(client);
      await client.query("COMMIT");
      return value;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }
  async close() {
    await this.pool.end();
  }
}
let database: Database | undefined;
export function businessDatabase() {
  return (database ??= new PostgresDatabase());
}
