import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createOutputDirectory, runBoundedCommand } from "../../core/runtime/bounded-output.mjs";

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../../../", import.meta.url));
const turbo = require.resolve("turbo/bin/turbo");
const biome = fileURLToPath(
  new URL("../../../node_modules/@biomejs/biome/bin/biome", import.meta.url),
);

const fastTasks = new Set([
  "lockfile",
  "tooling:check",
  "tooling:test",
  "docs:test",
  "docs:check",
  "lint",
  "schema:check",
  "schema:remote:test",
  "github:test",
  "change:test",
  "attendance:scheduler:test",
  "architecture:test",
  "architecture",
  "deadcode",
  "typecheck",
  "test:unit",
  "test:database",
  "build",
]);

export const validationGroups = Object.freeze({
  preflight: ["lockfile"],
  tooling: ["tooling:check", "tooling:test", "github:test"],
  docs: ["docs:test", "docs:check"],
  lint: ["lint"],
  architecture: ["architecture:test", "architecture"],
  schema: ["schema:remote:test", "schema:check"],
  deadcode: ["deadcode"],
  typecheck: ["typecheck"],
  "test-unit": ["test:unit"],
  "test-database": ["test:database", "change:test", "attendance:scheduler:test"],
  build: ["build"],
});

export function selectValidationStages(stages, group) {
  const assigned = Object.values(validationGroups).flat();
  const tasks = stages.map(([task]) => task);
  if (
    new Set(assigned).size !== assigned.length ||
    assigned.length !== tasks.length ||
    tasks.some((task) => !assigned.includes(task))
  ) {
    throw new Error("Every validation stage must belong to exactly one CI group.");
  }
  if (!group) return stages;
  if (!Object.hasOwn(validationGroups, group))
    throw new Error(`Unknown validation group: ${group}`);
  return stages.filter(([task]) => validationGroups[group].includes(task));
}

function gitChangedFiles(args, directory = root) {
  const result = spawnSync("git", args, {
    cwd: directory,
    encoding: "utf8",
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1" },
  });
  if (result.error || result.status !== 0) return null;
  return result.stdout.split("\0").filter(Boolean);
}

export function classifyChangedFiles(files) {
  const changed = [...new Set(files)];
  const isDoc = (file) =>
    file.endsWith(".md") || (file.startsWith("docs/") && file.endsWith(".txt"));
  const isSchemaSource = (file) =>
    file.startsWith("packages/integration-supabase/src/schemas/") ||
    file === "packages/integration-supabase/src/config.toml";
  const isDatabaseOwnerSource = (file) =>
    file.startsWith("packages/") &&
    (file.includes("/src/postgres/") ||
      file.includes("/src/adapters/outbound/persistence/") ||
      file.includes("/src/composition/bootstrap/"));
  const isToolingMetadata = (file) =>
    file === "AGENTS.md" ||
    file.endsWith("/AGENTS.md") ||
    file.startsWith(".github/") ||
    file.startsWith(".codex/") ||
    file.startsWith(".agents/") ||
    file.startsWith(".vscode/") ||
    file === ".node-version";
  const isToolingSource = (file) =>
    isToolingMetadata(file) ||
    file.startsWith(".github/") ||
    file.startsWith("scripts/governance/tooling/") ||
    file.startsWith("scripts/governance/docs/") ||
    file.startsWith("scripts/analysis/code/") ||
    file.startsWith("scripts/core/runtime/") ||
    file.startsWith("scripts/operations/") ||
    file.startsWith("scripts/providers/") ||
    file.startsWith("scripts/architecture/") ||
    file.startsWith("architecture/") ||
    [".dependency-cruiser.mjs", "biome.json", "knip.jsonc", "turbo.json"].includes(file);
  const toolingAffected = changed.some(
    (file) =>
      isToolingSource(file) ||
      file.startsWith("scripts/governance/tooling/") ||
      file.startsWith("scripts/analysis/code/") ||
      file.startsWith("scripts/core/runtime/") ||
      file.startsWith("scripts/operations/contract/") ||
      file.startsWith("scripts/operations/file/") ||
      file.startsWith("scripts/operations/intelligence/") ||
      file.startsWith("scripts/operations/execution/") ||
      file.startsWith("scripts/architecture/") ||
      file.startsWith("scripts/providers/vercel/") ||
      file.startsWith("scripts/providers/github/") ||
      file.startsWith("scripts/operations/wbs/") ||
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
  const docsAffected = changed.some(
    (file) => isDoc(file) || file.startsWith("scripts/governance/docs/"),
  );
  const schemaAffected = changed.some(
    (file) =>
      isSchemaSource(file) ||
      isDatabaseOwnerSource(file) ||
      file.startsWith("scripts/providers/supabase/") ||
      file === "packages/platform/src/testing/postgres.ts" ||
      file === "packages/platform/test/schema-contract.schema.ts" ||
      ["package.json", "pnpm-workspace.yaml", "pnpm-lock.yaml", "turbo.json"].includes(file),
  );
  const codeAffected = changed.some(
    (file) => !isDoc(file) && !isSchemaSource(file) && !isToolingSource(file),
  );
  return { codeAffected, docsAffected, schemaAffected, toolingAffected };
}

export function detectFastScope(options = {}) {
  const {
    directory = root,
    baseRef = process.env.GITHUB_BASE_REF,
    baseSha = process.env.VALIDATION_BASE_SHA,
  } = options;
  const comparisonBase =
    Object.hasOwn(options, "baseRef") && baseRef === null && !Object.hasOwn(options, "baseSha")
      ? null
      : baseSha || (baseRef ? `origin/${baseRef}` : null);
  if (comparisonBase) {
    const changed = gitChangedFiles(
      ["diff", "--name-only", "-z", "--diff-filter=ACMRD", `${comparisonBase}...HEAD`],
      directory,
    );
    if (changed?.length) return classifyChangedFiles(changed);
    return changed ? classifyChangedFiles([]) : null;
  }

  const working = gitChangedFiles(
    ["diff", "--name-only", "-z", "--diff-filter=ACMRD", "HEAD"],
    directory,
  );
  const staged = gitChangedFiles(
    ["diff", "--cached", "--name-only", "-z", "--diff-filter=ACMRD"],
    directory,
  );
  const untracked = gitChangedFiles(
    ["ls-files", "--others", "--exclude-standard", "-z"],
    directory,
  );
  if (working === null || staged === null || untracked === null) return null;
  const changed = [...new Set([...working, ...staged, ...untracked])];
  if (!changed.length) return null;
  const scope = classifyChangedFiles(changed);
  return untracked.length ? { ...scope, hasUntrackedFiles: true } : scope;
}

export function shouldRunFast(task, scope) {
  if (!fastTasks.has(task)) return false;
  if (task === "lockfile") return true;
  if (!scope) return true;
  if (task === "tooling:check" || task === "tooling:test") return scope.toolingAffected;
  if (task === "change:test") return scope.codeAffected || scope.toolingAffected;
  if (task === "docs:test" || task === "docs:check") return scope.docsAffected;
  if (task === "lint") return scope.codeAffected || scope.toolingAffected;
  if (task === "schema:check" || task === "schema:remote:test") return scope.schemaAffected;
  if (task === "github:test") return scope.toolingAffected;
  if (task === "attendance:scheduler:test") return scope.codeAffected || scope.toolingAffected;
  if (task === "architecture:test") return scope.toolingAffected;
  if (task === "architecture")
    return scope.codeAffected || scope.toolingAffected || scope.schemaAffected;
  if (task === "deadcode") return scope.codeAffected || scope.toolingAffected;
  if (task === "typecheck" || task === "test:unit" || task === "test:database")
    return scope.codeAffected || scope.schemaAffected;
  if (task === "build") return scope.codeAffected || scope.schemaAffected;
  return scope.codeAffected;
}

export function fastTaskArgs(task, command, scope, selection, explicitFilters = false) {
  if (!new Set(["typecheck", "test:unit", "test:database", "build"]).has(task)) return command;
  if ((scope?.schemaAffected || scope?.hasUntrackedFiles) && !explicitFilters) return command;
  if ((task === "test:unit" || task === "test:database") && command.length > 4) {
    return [...command.slice(0, 4), ...selection];
  }
  return [...command, ...selection];
}

export function selectedValidationGroups(scope) {
  return Object.entries(validationGroups)
    .filter(([, tasks]) => tasks.some((task) => shouldRunFast(task, scope)))
    .map(([group]) => group);
}

export function describeFastPlan(stages, scope, selection, explicitFilters = false) {
  return {
    scope: scope ?? "unknown or clean tree; all fast gates selected",
    stages: stages.map(([task, command]) => {
      const run = shouldRunFast(task, scope);
      const args = fastTaskArgs(task, command, scope, selection, explicitFilters);
      return {
        task,
        run,
        reason: !fastTasks.has(task)
          ? "full validation only"
          : task === "lockfile"
            ? "always verify lockfile consistency"
            : !scope
              ? "conservative fallback"
              : run
                ? "selected by changed-file responsibility"
                : "outside changed-file responsibility",
        ...((task === "typecheck" ||
          task === "test:unit" ||
          task === "test:database" ||
          task === "build") &&
        run
          ? {
              selection: args === command ? "all workspaces" : selection,
              selectionReason: explicitFilters
                ? "explicit filters; caller must cover all consumers"
                : scope?.schemaAffected
                  ? "shared schema inputs"
                  : scope?.hasUntrackedFiles
                    ? "untracked files require conservative workspace coverage"
                    : "Turbo affected packages and consumers",
            }
          : {}),
      };
    }),
  };
}

function main() {
  const args = process.argv.slice(2);
  const fast = args.includes("--fast");
  const plan = args.includes("--plan");
  const groupIndex = args.indexOf("--group");
  const group = groupIndex < 0 ? null : args[groupIndex + 1];
  const filters = args.filter((arg) => /^--filter=.+/.test(arg));
  const known = new Set(["--fast", "--plan", "--group", ...(group ? [group] : []), ...filters]);
  const unknown = args.filter((arg) => !known.has(arg));
  if (
    (groupIndex >= 0 && (!group || groupIndex === args.length - 1)) ||
    (plan && !fast) ||
    unknown.length ||
    (filters.length && (!fast || plan || group)) ||
    (!fast && !group && args.length)
  ) {
    console.error(
      "Usage: validate.mjs [--fast [--plan] [--group <name>] [--filter=<Turbo selector> ...]]",
    );
    process.exit(1);
  }
  if (plan && group) {
    console.error("Usage: validate.mjs --fast --plan");
    process.exit(1);
  }
  if (group && !Object.hasOwn(validationGroups, group)) {
    console.error(`Unknown validation group: ${group}`);
    process.exit(1);
  }
  const selection = filters.length ? filters : ["--affected"];
  const scope = fast ? detectFastScope() : null;
  if (plan) {
    console.log(JSON.stringify(selectedValidationGroups(scope)));
    return;
  }
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
    ["tooling:check", ["scripts/governance/tooling/check-tooling.mjs"]],
    [
      "tooling:test",
      [
        "--test",
        "scripts/governance/tooling/doctor.test.mjs",
        "scripts/operations/wbs/transfer.test.mjs",
        "scripts/analysis/code/*.test.mjs",
        "scripts/core/runtime/validation-command.test.mjs",
        "scripts/core/runtime/internal-input.test.mjs",
        "scripts/operations/contract/*.test.mjs",
        "scripts/operations/file/*.test.mjs",
        "scripts/operations/intelligence/*.test.mjs",
        "scripts/operations/execution/*.test.mjs",
      ],
    ],
    ["docs:test", ["--test", "scripts/governance/docs/check-docs.test.mjs"]],
    ["docs:check", ["scripts/governance/docs/check-docs.mjs"]],
    ["lint", [biome, "check", "."]],
    ["architecture:test", ["--test", "scripts/architecture/*.test.mjs"]],
    [
      "change:test",
      [
        "--test",
        "scripts/changes/patch-apply.test.mjs",
        "scripts/changes/state.test.mjs",
        "scripts/changes/finalize.test.mjs",
      ],
    ],
    [
      "github:test",
      [
        "--test",
        "scripts/providers/github/current-main.test.mjs",
        "scripts/providers/github/api.test.mjs",
        "scripts/providers/github/release-plan.test.mjs",
        "scripts/providers/github/validation-result.test.mjs",
        "scripts/operations/project/imports.test.mjs",
      ],
    ],
    ["schema:remote:test", ["--test", "scripts/providers/supabase/*.test.mjs"]],
    ["attendance:scheduler:test", ["--test", "scripts/operations/attendance/scheduler.test.mjs"]],
    ["schema:check", [turbo, "run", "schema:check"]],
    ["architecture", ["scripts/architecture/check-all.mjs"]],
    ["deadcode", ["node_modules/knip/bin/knip.js"]],
    ["typecheck", [turbo, "run", "typecheck", "--concurrency=4"]],
    [
      "test:unit",
      [
        turbo,
        "run",
        "test",
        "--concurrency=2",
        "--filter=@line_bot_v1/assistant",
        "--filter=@line_bot_v1/audit",
        "--filter=@line_bot_v1/explore",
        "--filter=@line_bot_v1/google-workspace",
        "--filter=@line_bot_v1/insights",
        "--filter=@line_bot_v1/integration-vercel",
        "--filter=@line_bot_v1/line",
        "--filter=@line_bot_v1/payroll",
      ],
    ],
    [
      "test:database",
      [
        turbo,
        "run",
        "test",
        "--concurrency=2",
        ...[
          "account",
          "actions",
          "attendance",
          "content",
          "contract",
          "daily-check-in",
          "discussion",
          "enterprise",
          "execution",
          "expense",
          "file",
          "identity-access",
          "intelligence",
          "issue",
          "namespace",
          "notifications",
          "numbering",
          "organization",
          "partners",
          "platform",
          "project",
          "repository",
          "resources",
          "team",
          "wbs",
          "wiki",
          "web",
        ].map((name) => `--filter=@line_bot_v1/${name}`),
      ],
    ],
    ["build", [turbo, "run", "build"]],
  ];

  const selectedStages = selectValidationStages(stages, group);
  if (fast) {
    const plan = describeFastPlan(selectedStages, scope, selection, filters.length > 0);
    const selected = plan.stages.filter((stage) => stage.run).map((stage) => stage.task);
    console.log(
      `Fast validation selected ${selected.length}/${plan.stages.length}: ${selected.join(", ")}`,
    );
  }
  const outputDirectory = createOutputDirectory(root);
  let completed = 0;
  for (const [task, command] of selectedStages) {
    if (fast && !shouldRunFast(task, scope)) continue;
    const args = fast ? fastTaskArgs(task, command, scope, selection, filters.length > 0) : command;
    const started = performance.now();
    console.log(`Validating: ${task}`);
    const result = runBoundedCommand(process.execPath, args, {
      cwd: root,
      env: {
        ...process.env,
        ...(process.env.VALIDATION_BASE_SHA
          ? { TURBO_SCM_BASE: process.env.VALIDATION_BASE_SHA }
          : {}),
        REPOSITORY_VALIDATION_OUTPUT_DIR: outputDirectory,
        NEXT_TELEMETRY_DISABLED: "1",
        TURBO_TELEMETRY_DISABLED: "1",
      },
      label: task,
      outputDirectory,
      spawn: spawnSync,
    });
    if (result.error) {
      console.error(`Unable to run ${task}: ${result.error.message}`);
      if (result.diagnostic) console.error(result.diagnostic);
      console.error(`Full output: ${result.logPath}`);
      process.exit(1);
    }
    if (result.status !== 0) {
      console.error(`Validation failed: ${task} (status ${result.status ?? "unknown"})`);
      if (result.diagnostic) console.error(result.diagnostic);
      console.error(`Full output: ${result.logPath}`);
      process.exit(result.status ?? 1);
    }
    completed++;
    console.log(`Validated ${task} in ${((performance.now() - started) / 1000).toFixed(3)}s`);
  }
  console.log(`Validation passed: ${completed} stage(s). Full output: ${outputDirectory}`);
}

if (import.meta.main) main();
