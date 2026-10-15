import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { setTimeout } from "node:timers/promises";
import { Pool } from "pg";
import { createSql, type Database, type SqlRow } from "../database/postgres/database.js";

/** Isolated disposable database; accepts loopback servers only. No production credentials. */
export async function postgresSessions(databaseUrl: string) {
  const url = new URL(databaseUrl);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    throw new Error("Only a loopback test database is allowed.");
  const admin = new Pool({ connectionString: url.href, max: 1 });
  const name = `capability_test_${randomUUID().replaceAll("-", "")}`;
  await admin.query(`CREATE DATABASE ${name}`);
  url.pathname = `/${name}`;
  const pool = new Pool({ connectionString: url.href, max: 8 });
  const close = async () => {
    await pool.end();
    try {
      await admin.query(`DROP DATABASE ${name}`);
    } finally {
      await admin.end();
    }
  };
  try {
    // Role names are cluster-global. All capability/WBS fixtures coordinate on
    // their common administrative database while building an isolated schema.
    const bootstrap = await admin.connect();
    try {
      await bootstrap.query("SELECT pg_advisory_lock(71020261014::bigint)");
      await pool.query(
        "DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF; IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF; END $$; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid primary key,banned_until timestamptz,deleted_at timestamptz,is_anonymous boolean); CREATE TABLE auth.identities(user_id uuid,provider text,provider_id text)",
      );
      const directory = new URL("../../../../supabase/schemas/", import.meta.url);
      for (const file of readdirSync(directory)
        .filter((f) => f.endsWith(".sql"))
        .sort())
        await pool.query(`BEGIN;${readFileSync(new URL(file, directory), "utf8")}COMMIT;`);
    } finally {
      await bootstrap.query("SELECT pg_advisory_unlock(71020261014::bigint)").catch(() => {});
      bootstrap.release();
    }
  } catch (error) {
    await close();
    throw error;
  }
  const db: Database = {
    async transaction(work) {
      const client = await pool.connect();
      try {
        await client.query(
          "BEGIN;SET LOCAL ROLE line_app;SET LOCAL search_path=app_private,pg_catalog;SET LOCAL statement_timeout='10s'",
        );
        const result = await work(
          createSql(async (text, values) => {
            const query = await client.query<SqlRow>(text, values);
            return { rows: query.rows, rowCount: query.rowCount };
          }),
        );
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
  /** Observe real lock waiters; polling never decides when a transaction may proceed. */
  async function waitForBlocked(blockerPid: number, count = 1) {
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      const { rows } = await pool.query<{ pid: number; wait_event: string }>(
        `SELECT pid,wait_event FROM pg_stat_activity
         WHERE datname=current_database() AND wait_event_type='Lock'
           AND $1=ANY(pg_blocking_pids(pid)) ORDER BY pid`,
        [blockerPid],
      );
      if (rows.length === count) return rows;
      await setTimeout(20);
    }
    throw new Error(`Expected ${count} sessions blocked by backend ${blockerPid}`);
  }
  return { pool, db, close, waitForBlocked };
}
