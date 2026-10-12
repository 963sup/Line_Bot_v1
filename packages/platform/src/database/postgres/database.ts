import { Pool, type PoolClient } from "pg";
import { supabaseCa } from "./ca.js";
import { normalizePostgresConnectionUrl } from "./connection.js";

export type SqlRow = Record<string, unknown>;
export type SqlResult<Row extends object = SqlRow> = {
  rows: Row[];
  rowCount?: number | null;
};

export interface Sql {
  query<Row extends object>(
    text: string,
    values: unknown[] | undefined,
    decodeRow: (row: SqlRow) => Row,
  ): Promise<SqlResult<Row>>;
  query(text: string, values?: unknown[]): Promise<SqlResult>;
}

/** Both PostgreSQL runtimes cross the same unknown-row boundary before owner decoding. */
export function createSql(execute: (text: string, values?: unknown[]) => Promise<SqlResult>): Sql {
  function query<Row extends object>(
    text: string,
    values: unknown[] | undefined,
    decodeRow: (row: SqlRow) => Row,
  ): Promise<SqlResult<Row>>;
  function query(text: string, values?: unknown[]): Promise<SqlResult>;
  async function query(
    text: string,
    values?: unknown[],
    decodeRow?: (row: SqlRow) => object,
  ): Promise<SqlResult<object>> {
    const result = await execute(text, values);
    return decodeRow ? { ...result, rows: result.rows.map(decodeRow) } : result;
  }
  return { query };
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
      const sql = createSql(async (text, values) => {
        const result = await client.query<SqlRow>(text, values);
        return { rows: result.rows, rowCount: result.rowCount };
      });
      const value = await work(sql);
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
