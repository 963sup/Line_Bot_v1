import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { createSql, type Database, type SqlRow } from "../database/postgres/database.js";

function schemaFiles() {
  const directory = new URL("../../../../supabase/schemas/", import.meta.url);
  return readdirSync(directory)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => ({ name, sql: readFileSync(new URL(name, directory), "utf8") }));
}

export async function postgresFixture() {
  // Node 24 can double-free WASM import wrappers during code GC (nodejs/node#66366).
  // Fail before allocating PGlite rather than intermittently aborting the whole runner.
  if (!process.execArgv.includes("--no-wasm-code-gc"))
    throw new Error("PGlite requires --no-wasm-code-gc; use the owning package test command.");
  const pg = new PGlite();
  await pg.exec(
    "CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid primary key,banned_until timestamptz,deleted_at timestamptz,is_anonymous boolean);CREATE TABLE auth.identities(user_id uuid,provider text,provider_id text);",
  );
  try {
    for (const schema of schemaFiles()) await pg.exec(`BEGIN;\n${schema.sql}\nCOMMIT;`);
    await pg.exec("SET search_path=app_private,pg_catalog;");
  } catch (error) {
    await pg.close();
    throw error;
  }
  const db: Database = {
    transaction: (work) =>
      pg.transaction(async (tx) => {
        await tx.exec("SET LOCAL ROLE line_app; SET LOCAL search_path=app_private,pg_catalog;");
        return work(
          createSql(async (text, values) => {
            const result = await tx.query<SqlRow>(text, values);
            return { rows: result.rows, rowCount: result.affectedRows ?? null };
          }),
        );
      }),
  };
  const sql = createSql(async (text, values) => {
    const result = await pg.query<SqlRow>(text, values);
    return { rows: result.rows, rowCount: result.affectedRows ?? null };
  });
  return { pg, db, sql };
}
