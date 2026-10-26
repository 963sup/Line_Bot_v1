import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runSupabaseCli } from "./cli-adapter.mjs";
import { executeSql } from "./postgres.mjs";
import { declaredSchemaSql } from "./schema-source.mjs";

const root = new URL("../../", import.meta.url);

export const localDatabaseCommands = {
  start: ["db", "start"],
  reset: ["db", "reset", "--local", "--no-seed"],
  status: ["status", "--output", "json"],
};

export function localSchemaCommands() {
  return Object.values(localDatabaseCommands);
}

const run = (args, options) => runSupabaseCli(args, { ...options, cwd: fileURLToPath(root) });

function localDatabaseUrl() {
  const status = JSON.parse(run(localDatabaseCommands.status, { capture: true }));
  if (typeof status.DB_URL !== "string") throw new Error("Supabase local DB_URL is unavailable.");
  return status.DB_URL;
}

async function main() {
  if (process.argv.length !== 2)
    throw new Error("schema:local does not accept remote targets or additional arguments.");

  const artifactDirectory = new URL(".artifacts/supabase-schema/", root);
  const sqlPath = new URL("desired.sql", artifactDirectory);
  mkdirSync(artifactDirectory, { recursive: true });
  writeFileSync(
    sqlPath,
    `BEGIN;\nDROP SCHEMA IF EXISTS app_private CASCADE;\n${declaredSchemaSql()}\nCOMMIT;\n`,
  );

  console.log(
    "Rebuilding the LOCAL development database from packages/integration-supabase/src/schemas; local data is removed.",
  );
  run(localDatabaseCommands.start);
  run(localDatabaseCommands.reset);
  await executeSql(localDatabaseUrl(), readFileSync(sqlPath, "utf8"), { remote: false });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
