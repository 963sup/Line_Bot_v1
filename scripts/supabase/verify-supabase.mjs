import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { supabaseCa } from "../../packages/platform/dist/database/postgres/ca.js";
import { PostgresDatabase } from "../../packages/platform/dist/database/postgres/database.js";
import { loadRootEnv } from "../runtime/load-env.mjs";
import { declaredSchemaSql } from "./schema-source.mjs";

function declaredTableNames() {
  const names = [
    ...declaredSchemaSql().matchAll(
      /create\s+table\s+(?:if\s+not\s+exists\s+)?app_private\."?([A-Za-z0-9_]+)"?/gi,
    ),
  ].map((match) => match[1]);
  const unique = [...new Set(names)].sort();
  assert.ok(unique.length > 0, "No app_private tables found in declarative schemas.");
  return unique;
}

loadRootEnv();
const require = createRequire(new URL("../../packages/platform/package.json", import.meta.url)),
  { Client } = require("pg");
const client = new Client({
    connectionString: process.env.POSTGRES_URL,
    ssl: { rejectUnauthorized: true, ca: supabaseCa },
  }),
  db = new PostgresDatabase();
try {
  await client.connect();
  const providerRole = (
    await client.query(
      "SELECT current_user AS name, pg_has_role(current_user,'line_app','MEMBER') AS line_app_member",
    )
  ).rows[0];
  assert.equal(providerRole.line_app_member, true);

  await assert.rejects(
    db.transaction((sql) => sql.query("CREATE TABLE app_private.forbidden_test(id int)")),
    { code: "42501" },
  );
  await assert.rejects(
    db.transaction((sql) => sql.query("SELECT email FROM auth.users")),
    { code: "42501" },
  );

  const expectedTables = declaredTableNames();
  const result = await db.transaction(async (sql) => {
    assert.equal((await sql.query("SELECT current_user AS name")).rows[0].name, "line_app");
    const tables = (
      await sql.query(
        "SELECT tablename,rowsecurity FROM pg_tables WHERE schemaname='app_private' ORDER BY tablename",
      )
    ).rows;
    assert.deepEqual(
      tables.map((table) => table.tablename),
      expectedTables,
    );
    assert.ok(tables.every((table) => table.rowsecurity));
    const counts = {};
    for (const { tablename } of tables)
      counts[tablename] = Number(
        (await sql.query(`SELECT COUNT(*) n FROM app_private.${tablename}`)).rows[0].n,
      );
    return { counts, rlsTables: tables.length };
  });

  const usersApi = await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL + "/rest/v1/users", {
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY },
  });
  assert.ok([401, 403, 404].includes(usersApi.status));
  const auth = await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL + "/auth/v1/settings", {
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY },
  });
  assert.equal(auth.status, 200);
  const settings = await auth.json();
  console.log(
    JSON.stringify({
      providerConnection: providerRole.name,
      runtimeRole: "line_app-per-transaction",
      ddlDenied: true,
      authEmailDenied: true,
      rlsTables: result.rlsTables,
      publicDataApiDenied: true,
      googleEnabled: settings.external?.google === true,
      counts: result.counts,
    }),
  );
} catch (e) {
  console.error("Supabase verification failed:", e.code || e.name);
  process.exitCode = 1;
} finally {
  await client.end();
  await db.close();
}
