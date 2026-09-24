import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { executeSql } from "./postgres.mjs";
import { declaredSchemaSql } from "./schema-source.mjs";

const root = new URL("../../", import.meta.url);
const cli = createRequire(import.meta.url).resolve("supabase/dist/supabase.js");

export function localSchemaCommands() {
  return [["start"], ["db", "reset", "--local", "--no-seed"], ["status", "--output", "json"]];
}

function run(args, { capture = false } = {}) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: fileURLToPath(root),
    encoding: capture ? "utf8" : undefined,
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = capture ? `${result.stderr || result.stdout}`.trim() : "";
    throw new Error(`supabase ${args.join(" ")} failed${detail ? `: ${detail}` : ""}`);
  }
  return capture ? result.stdout : "";
}

function localDatabaseUrl() {
  const status = JSON.parse(run(["status", "--output", "json"], { capture: true }));
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
    "Rebuilding the LOCAL development database from supabase/schemas; local data is removed.",
  );
  run(["start"]);
  run(["db", "reset", "--local", "--no-seed"]);
  await executeSql(localDatabaseUrl(), readFileSync(sqlPath, "utf8"), { remote: false });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
