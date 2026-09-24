import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../../", import.meta.url));
const turbo = require.resolve("turbo/bin/turbo");
const biome = fileURLToPath(
  new URL("../../node_modules/@biomejs/biome/bin/biome", import.meta.url),
);

const fastTasks = new Set([
  "lockfile",
  "tooling:check",
  "docs:check",
  "lint",
  "schema:check",
  "schema:remote:test",
  "architecture:test",
  "architecture",
  "deadcode",
  "typecheck+test",
]);

function lines(value) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function gitChangedFiles(args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.error || result.status !== 0) return null;
  return lines(result.stdout);
}

export function classifyChangedFiles(files) {
  const changed = [...new Set(files)];
  const isDoc = (file) =>
    file.endsWith(".md") || (file.startsWith("docs/") && file.endsWith(".txt"));
  const isSchemaSource = (file) =>
    file.startsWith("supabase/schemas/") || file === "supabase/config.toml";
  const isToolingMetadata = (file) =>
    file === "AGENTS.md" ||
    file.endsWith("/AGENTS.md") ||
    file.startsWith(".github/") ||
    file.startsWith(".codex/") ||
    file.startsWith(".agents/") ||
    file.startsWith(".vscode/") ||
    file === "knip.jsonc" ||
    file === "skills-lock.json";
  const toolingAffected = changed.some(
    (file) =>
      isToolingMetadata(file) ||
      file.startsWith("scripts/tooling/") ||
      file.startsWith("scripts/architecture/") ||
      file.startsWith("architecture/") ||
      file === ".dependency-cruiser.mjs" ||
      [
        "package.json",
        "pnpm-workspace.yaml",
        "pnpm-lock.yaml",
        "turbo.json",
        "biome.json",
        "knip.jsonc",
      ].includes(file),
  );
  const docsAffected = changed.some((file) => isDoc(file) || file.startsWith("scripts/docs/"));
  const schemaAffected = changed.some(
    (file) =>
      isSchemaSource(file) ||
      file.startsWith("scripts/supabase/") ||
      file === "packages/platform/src/testing/postgres.ts" ||
      file === "packages/platform/test/schema-contract.schema.ts" ||
      ["package.json", "pnpm-workspace.yaml", "pnpm-lock.yaml", "turbo.json"].includes(file),
  );
  const codeAffected = changed.some(
    (file) => !isDoc(file) && !isSchemaSource(file) && !isToolingMetadata(file),
  );
  return { codeAffected, docsAffected, schemaAffected, toolingAffected };
}

function detectFastScope() {
  if (process.env.GITHUB_BASE_REF) {
    const changed = gitChangedFiles([
      "diff",
      "--name-only",
      "--diff-filter=ACMRD",
      `origin/${process.env.GITHUB_BASE_REF}...HEAD`,
    ]);
    if (changed?.length) return classifyChangedFiles(changed);
    return changed ? classifyChangedFiles([]) : null;
  }

  const working = gitChangedFiles(["diff", "--name-only", "--diff-filter=ACMRD", "HEAD"]);
  const staged = gitChangedFiles(["diff", "--cached", "--name-only", "--diff-filter=ACMRD"]);
  if (working === null || staged === null) return null;
  const changed = [...new Set([...working, ...staged])];
  return changed.length ? classifyChangedFiles(changed) : null;
}

export function shouldRunFast(task, scope) {
  if (!fastTasks.has(task)) return false;
  if (task === "lockfile") return true;
  if (!scope) return true;
  if (task === "tooling:check") return scope.toolingAffected;
  if (task === "docs:check") return scope.docsAffected;
  if (task === "schema:check" || task === "schema:remote:test") return scope.schemaAffected;
  if (task === "architecture:test") return scope.toolingAffected && scope.codeAffected;
  if (task === "architecture") return scope.toolingAffected || scope.schemaAffected;
  if (task === "deadcode") return scope.codeAffected || scope.toolingAffected;
  if (task === "typecheck+test") return scope.codeAffected || scope.schemaAffected;
  return scope.codeAffected;
}

export function fastTaskArgs(task, command, scope, selection, explicitFilters = false) {
  if (task !== "typecheck+test") return command;
  if (scope?.schemaAffected && !explicitFilters) return command;
  return [...command, ...selection];
}

function main() {
  const fast = process.argv[2] === "--fast";
  const filters = process.argv.slice(fast ? 3 : 2);
  if (filters.length && (!fast || filters.some((arg) => !/^--filter=.+/.test(arg)))) {
    console.error("Usage: validate.mjs [--fast [--filter=<Turbo selector> ...]]");
    process.exit(1);
  }
  const selection = filters.length ? filters : ["--affected"];
  const scope = fast ? detectFastScope() : null;
  const pnpmExecPath = process.env.npm_execpath;
  if (!pnpmExecPath) {
    console.error("Validation must run through the pinned pnpm command surface.");
    process.exit(1);
  }

  // pnpm owns manifest/lockfile semantics. Frozen + lockfile-only keeps this preflight read-only.
  // Sequential stages avoid Next.js type generation racing with its build.
  const stages = [
    [
      "lockfile",
      [pnpmExecPath, "install", "--lockfile-only", "--frozen-lockfile", "--ignore-scripts"],
    ],
    ["tooling:check", ["scripts/tooling/check-tooling.mjs"]],
    ["docs:check", ["scripts/docs/check-docs.mjs"]],
    ["lint", [biome, "check", "."]],
    [
      "architecture:test",
      [
        "--test",
        "scripts/architecture/check-architecture.test.mjs",
        "scripts/architecture/check-convergence-guardrails.test.mjs",
        "scripts/architecture/check-semantic-benchmark.test.mjs",
        "scripts/architecture/check-semantic-architecture.test.mjs",
        "scripts/architecture/check-data-topology.test.mjs",
        "scripts/architecture/check-data-access.test.mjs",
      ],
    ],
    ["patch:apply:test", ["--test", "scripts/changes/patch-apply.test.mjs"]],
    [
      "schema:remote:test",
      ["--test", "scripts/supabase/postgres.test.mjs", "scripts/supabase/remote.test.mjs"],
    ],
    ["schema:check", [turbo, "run", "schema:check"]],
    ["architecture", ["scripts/architecture/check-all.mjs"]],
    ["deadcode", ["node_modules/knip/bin/knip.js"]],
    ["typecheck+test", [turbo, "run", "typecheck", "test"]],
    ["build", [turbo, "run", "build"]],
  ];

  for (const [task, command] of stages) {
    if (fast && !shouldRunFast(task, scope)) continue;
    const args = fast ? fastTaskArgs(task, command, scope, selection, filters.length > 0) : command;
    const started = performance.now();
    console.log(`Validating: ${task}`);
    const result = spawnSync(process.execPath, args, {
      cwd: root,
      stdio: "inherit",
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", TURBO_TELEMETRY_DISABLED: "1" },
    });
    if (result.error) {
      console.error(`Unable to run ${task}: ${result.error.message}`);
      process.exit(1);
    }
    if (result.status !== 0) process.exit(result.status ?? 1);
    console.log(`Validated ${task} in ${((performance.now() - started) / 1000).toFixed(3)}s`);
  }
}

if (import.meta.main) main();
