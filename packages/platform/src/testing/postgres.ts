import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import type { Database, Sql } from "../database/postgres/database.js";

function schemaFiles() {
  const directory = new URL("../../../../supabase/schemas/", import.meta.url);
  return readdirSync(directory)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => ({ name, sql: readFileSync(new URL(name, directory), "utf8") }));
}

export async function postgresFixture() {
  const pg = new PGlite();
  await pg.exec(
    "CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid primary key,banned_until timestamptz,deleted_at timestamptz,is_anonymous boolean);CREATE TABLE auth.identities(user_id uuid,provider text,provider_id text);",
  );
  try {
    for (const schema of schemaFiles()) await pg.exec(`BEGIN;\n${schema.sql}\nCOMMIT;`);
  } catch (error) {
    await pg.close();
    throw error;
  }
  const db: Database = {
    transaction: (work) =>
      pg.transaction(async (tx) => {
        await tx.exec("SET LOCAL ROLE line_app; SET LOCAL search_path=app_private,pg_catalog;");
        return work(tx as unknown as Sql);
      }),
  };
  return { pg, db };
}
