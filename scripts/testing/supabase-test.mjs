import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createOutputDirectory, runBoundedCommand } from "../core/runtime/bounded-output.mjs";

const require = createRequire(import.meta.url);
const supabaseCli = require.resolve("supabase/dist/supabase.js");
const supabaseHome = mkdtempSync(join(tmpdir(), "line-bot-supabase-"));
const childEnvironment = { ...process.env, SUPABASE_HOME: supabaseHome };
const commandTimeoutSeconds = "900";
const primaryImage = "supabase/postgres:17.6.1.165";

const outputDirectory = createOutputDirectory(process.cwd(), "supabase-test-");

function run(command, args, label, env = childEnvironment) {
  const cached =
    spawnSync("docker", ["image", "inspect", primaryImage], {
      stdio: "ignore",
    }).status === 0;
  if (label === "supabase-schema-local")
    console.log(`Supabase primary image cache: ${cached ? "hit" : "miss; pulling once"}`);
  const result = runBoundedCommand("timeout", [commandTimeoutSeconds, command, ...args], {
    cwd: process.cwd(),
    env,
    label,
    outputDirectory,
  });
  if (result.error || result.status !== 0) {
    console.error(`Supabase test command failed: ${label}`);
    if (result.diagnostic) console.error(result.diagnostic);
    console.error(`Full output: ${result.logPath}`);
    process.exit(result.status ?? 1);
  }
  return result;
}

function captureSupabase(args, label) {
  const result = run(process.execPath, [supabaseCli, ...args], label);
  return readFileSync(result.logPath, "utf8");
}

let cleaned = false;
function cleanup() {
  if (cleaned) return;
  cleaned = true;
  runBoundedCommand(process.execPath, [supabaseCli, "stop", "--no-backup"], {
    cwd: process.cwd(),
    env: childEnvironment,
    label: "supabase-stop",
    outputDirectory,
  });
  rmSync(supabaseHome, { recursive: true, force: true });
}

process.once("exit", cleanup);
process.once("SIGINT", () => process.exit(130));
process.once("SIGTERM", () => process.exit(143));

try {
  run("pnpm", ["schema:local"], "supabase-schema-local");
  const status = JSON.parse(captureSupabase(["status", "--output", "json"], "supabase-status"));
  if (typeof status.DB_URL !== "string" || !status.DB_URL)
    throw new Error("Supabase local DB_URL is unavailable.");

  run("pnpm", ["validate", "--fast", "--group", "test-database"], "supabase-test-database", {
    ...childEnvironment,
    CAPABILITY_TEST_DATABASE_URL: status.DB_URL,
    WBS_TEST_DATABASE_URL: status.DB_URL,
  });
} finally {
  cleanup();
}
