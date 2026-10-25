import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runBoundedCommand, writeBoundedDiagnostic } from "../runtime/bounded-output.mjs";
import {
  classifyChangedFiles,
  describeFastPlan,
  detectFastScope,
  fastTaskArgs,
  selectValidationStages,
  selectFastValidationGroups,
  shouldRunFast,
  validationGroups,
} from "./validate.mjs";

test("bounded command output preserves full logs and limits diagnostics", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "line-bot-bounded-output-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const result = runBoundedCommand(
    process.execPath,
    ["-e", "for(let i=0;i<300;i++) console.error(`line-${i}`); process.exit(7)"],
    { cwd: directory, label: "fixture", outputDirectory: directory },
  );
  assert.equal(result.status, 7);
  assert.match(readFileSync(result.logPath, "utf8"), /line-0/);
  assert.doesNotMatch(result.diagnostic, /^line-0$/m);
  assert.match(result.diagnostic, /line-299/);
  assert.ok(result.diagnostic.split(/\r?\n/).length <= 121);
});

test("successful bounded command keeps child output out of diagnostics", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "line-bot-bounded-success-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const result = runBoundedCommand(process.execPath, ["-e", "console.log('full evidence')"], {
    cwd: directory,
    label: "success",
    outputDirectory: directory,
  });
  assert.equal(result.status, 0);
  assert.equal(result.diagnostic, "");
  assert.match(readFileSync(result.logPath, "utf8"), /full evidence/);
});

test("in-process diagnostics preserve the full report and bound stderr excerpt", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "line-bot-bounded-report-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const report = writeBoundedDiagnostic(
    directory,
    "tooling-violations",
    Array.from({ length: 300 }, (_, index) => `violation-${index}`).join("\n"),
  );
  assert.match(readFileSync(report.logPath, "utf8"), /violation-0/);
  assert.doesNotMatch(report.diagnostic, /^violation-0$/m);
  assert.match(report.diagnostic, /violation-299/);
  assert.ok(report.diagnostic.split(/\r?\n/).length <= 121);
});

function git(directory, args) {
  execFileSync("git", args, { cwd: directory, stdio: "ignore" });
}

test("local and CI validation bound aggregate test workers without changing scope or CI semantics", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "line-bot-validation-command-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const preload = join(directory, "capture.mjs");
  writeFileSync(
    preload,
    `
    import childProcess from 'node:child_process';
    import { syncBuiltinESMExports } from 'node:module';
    childProcess.spawnSync = (file, args, options) => {
      if (file === 'git') return { status: 0, stdout: args[0] === 'ls-files' ? '' : 'scripts/tooling/validate.mjs\\0' };
      console.log('CAPTURE:' + JSON.stringify({ args, ci: options.env.CI ?? null }));
      return { status: 0 };
    };
    syncBuiltinESMExports();
  `,
  );
  for (const ci of ["true", "false", undefined]) {
    for (const [mode, selection] of [
      [["--group", "typecheck-test"], []],
      [[], []],
      [["--fast"], ["--affected"]],
      [["--fast", "--filter=@line_bot_v1/team"], ["--filter=@line_bot_v1/team"]],
    ]) {
      const env = { ...process.env, npm_execpath: "fixture-pnpm.js" };
      if (ci === undefined) delete env.CI;
      else env.CI = ci;
      const output = execFileSync(
        process.execPath,
        [
          "--import",
          pathToFileURL(preload).href,
          fileURLToPath(new URL("./validate.mjs", import.meta.url)),
          ...mode,
        ],
        {
          encoding: "utf8",
          env,
        },
      );
      const calls = output
        .split("\n")
        .filter((line) => line.startsWith("CAPTURE:"))
        .map((line) => JSON.parse(line.slice("CAPTURE:".length)))
        .filter((call) => call.args[1] === "run" && call.args[2] === "typecheck");
      assert.equal(calls.length, 1);
      assert.deepEqual(calls[0].args.slice(1, 4), ["run", "typecheck", "test"]);
      assert.deepEqual(calls[0].args.slice(4), ["--concurrency=2", ...selection]);
      assert.equal(calls[0].ci, ci ?? null);
    }
  }
});

test("fast plan explains skips and conservative workspace selection without changing execution", () => {
  const stages = [
    ["lockfile", ["install"]],
    ["docs:check", ["docs"]],
    ["typecheck+test", ["turbo", "run", "typecheck", "test"]],
    ["build", ["build"]],
  ];
  for (const scope of [
    null,
    classifyChangedFiles(["README.md"]),
    classifyChangedFiles(["supabase/schemas/600_repositories.sql"]),
    { ...classifyChangedFiles(["packages/account/src/new.ts"]), hasUntrackedFiles: true },
  ]) {
    const plan = describeFastPlan(stages, scope, ["--affected"]);
    for (const stage of plan.stages) {
      assert.equal(stage.run, shouldRunFast(stage.task, scope));
      assert.ok(stage.reason);
    }
    const product = plan.stages.find((stage) => stage.task === "typecheck+test");
    if (scope?.schemaAffected || scope?.hasUntrackedFiles) {
      assert.equal(product.selection, "all workspaces");
    }
    assert.equal(plan.stages.find((stage) => stage.task === "build").run, false);
  }
  const schema = classifyChangedFiles(["supabase/schemas/600_repositories.sql"]);
  const filtered = describeFastPlan(stages, schema, ["--filter=@line_bot_v1/account"], true);
  assert.deepEqual(filtered.stages[2].selection, ["--filter=@line_bot_v1/account"]);
  assert.match(filtered.stages[2].selectionReason, /caller must cover all consumers/);
});

test("fast validation groups use changed-owner scope and conservatively cover an unknown scope", () => {
  const stages = [
    ["lockfile", ["install"]],
    ["docs:check", ["docs"]],
    ["architecture", ["architecture"]],
    ["deadcode", ["deadcode"]],
    ["typecheck+test", ["typecheck"]],
  ];
  assert.deepEqual(
    selectFastValidationGroups(stages, classifyChangedFiles(["docs/owners/account.md"])),
    ["tooling", "docs"],
  );
  assert.deepEqual(selectFastValidationGroups(stages, null), Object.keys(validationGroups));
});

function gitFixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "line-bot-fast-scope-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  git(directory, ["init", "--quiet"]);
  git(directory, ["config", "user.name", "Validation Fixture"]);
  git(directory, ["config", "user.email", "validation@example.invalid"]);
  mkdirSync(join(directory, "packages"), { recursive: true });
  writeFileSync(join(directory, ".gitignore"), "ignored.ts\n");
  writeFileSync(join(directory, "README.md"), "before\n");
  for (const name of ["staged.ts", "unstaged.ts", "deleted.ts", "rename.ts"]) {
    writeFileSync(join(directory, "packages", name), "export const value = 1;\n");
  }
  git(directory, ["add", ".gitignore", "README.md", "packages"]);
  git(directory, ["commit", "--quiet", "-m", "fixture baseline"]);
  return directory;
}

test("lockfile consistency gate cannot be skipped by fast scope", () => {
  for (const scope of [
    null,
    classifyChangedFiles([]),
    classifyChangedFiles(["docs/reference/engineering/development-workflow.md"]),
  ])
    assert.equal(shouldRunFast("lockfile", scope), true);
});

test("documentation-only changes run only documentation-owned fast gates", () => {
  const scope = classifyChangedFiles([
    "docs/reference/engineering/development-workflow.md",
    "README.md",
  ]);
  assert.deepEqual(scope, {
    codeAffected: false,
    docsAffected: true,
    schemaAffected: false,
    toolingAffected: false,
  });
  for (const task of ["docs:test", "docs:check"]) assert.equal(shouldRunFast(task, scope), true);
  assert.equal(shouldRunFast("tooling:check", scope), false);
});

test("source operations trigger their tooling tests in fast validation and keep all CI groups", () => {
  for (const path of [
    "scripts/code/cli.mjs",
    "scripts/runtime/internal-input.mjs",
    "scripts/contract/run.mjs",
    "scripts/file/run.mjs",
    "scripts/execution/run.mjs",
  ]) {
    const scope = classifyChangedFiles([path]);
    assert.equal(scope.toolingAffected, true, path);
    assert.equal(shouldRunFast("tooling:check", scope), true, path);
    assert.equal(shouldRunFast("tooling:test", scope), true, path);
    assert.equal(shouldRunFast("change:test", scope), true, path);
  }
  assert.equal(Object.keys(validationGroups).length, 8);
});

test("local fast scope includes non-ignored untracked files and ignores excluded files", (t) => {
  const directory = gitFixture(t);

  writeFileSync(join(directory, "README.md"), "after\n");
  writeFileSync(join(directory, "ignored.ts"), "export {}\n");
  assert.deepEqual(detectFastScope({ directory, baseRef: null }), {
    codeAffected: false,
    docsAffected: true,
    schemaAffected: false,
    toolingAffected: false,
  });

  const sourceDirectory = join(directory, "packages", "folder with spaces");
  mkdirSync(sourceDirectory, { recursive: true });
  writeFileSync(join(sourceDirectory, "新增功能.ts"), "export {}\n");
  const scope = detectFastScope({ directory, baseRef: null });
  assert.deepEqual(scope, {
    codeAffected: true,
    docsAffected: true,
    schemaAffected: false,
    toolingAffected: false,
    hasUntrackedFiles: true,
  });
  assert.equal(shouldRunFast("typecheck+test", scope), true);
  assert.equal(shouldRunFast("deadcode", scope), true);
  assert.deepEqual(
    fastTaskArgs("typecheck+test", ["turbo", "run", "typecheck", "test"], scope, ["--affected"]),
    ["turbo", "run", "typecheck", "test"],
  );
});

test("local fast scope includes staged edits, unstaged edits, deletions, and renames", (t) => {
  const directory = gitFixture(t);

  writeFileSync(join(directory, "packages", "staged.ts"), "export const value = 2;\n");
  git(directory, ["add", "packages/staged.ts"]);
  assert.equal(detectFastScope({ directory, baseRef: null })?.codeAffected, true);
  git(directory, ["commit", "--quiet", "-m", "staged source"]);

  writeFileSync(join(directory, "packages", "unstaged.ts"), "export const value = 2;\n");
  assert.equal(detectFastScope({ directory, baseRef: null })?.codeAffected, true);
  git(directory, ["add", "packages/unstaged.ts"]);
  git(directory, ["commit", "--quiet", "-m", "unstaged source"]);

  rmSync(join(directory, "packages", "deleted.ts"));
  assert.equal(detectFastScope({ directory, baseRef: null })?.codeAffected, true);
  git(directory, ["add", "-u", "--", "packages/deleted.ts"]);
  git(directory, ["commit", "--quiet", "-m", "deleted source"]);

  git(directory, ["mv", "packages/rename.ts", "packages/renamed.ts"]);
  assert.equal(detectFastScope({ directory, baseRef: null })?.codeAffected, true);
});

test("untracked declarative schemas select schema validation and the full workspace", (t) => {
  const directory = gitFixture(t);
  const schemaDirectory = join(directory, "supabase", "schemas");
  mkdirSync(schemaDirectory, { recursive: true });
  writeFileSync(join(schemaDirectory, "99_fixture.sql"), "select 1;\n");

  const scope = detectFastScope({ directory, baseRef: null });
  assert.equal(scope?.schemaAffected, true);
  assert.equal(scope?.hasUntrackedFiles, true);
  assert.deepEqual(
    fastTaskArgs("typecheck+test", ["turbo", "run", "typecheck", "test"], scope, ["--affected"]),
    ["turbo", "run", "typecheck", "test"],
  );
});

test("fast scope detection falls back to all stages when Git inventory fails", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "line-bot-no-git-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const scope = detectFastScope({ directory, baseRef: null });
  assert.equal(scope, null);
  assert.equal(shouldRunFast("typecheck+test", scope), true);
});

test("schema-only changes run schema, remote-contract, architecture and product test gates", () => {
  const scope = classifyChangedFiles(["supabase/schemas/42_expenses.sql"]);
  assert.deepEqual(scope, {
    codeAffected: false,
    docsAffected: false,
    schemaAffected: true,
    toolingAffected: false,
  });
  assert.equal(shouldRunFast("schema:check", scope), true);
  assert.equal(shouldRunFast("schema:remote:test", scope), true);
  assert.equal(shouldRunFast("architecture", scope), true);
  assert.equal(shouldRunFast("typecheck+test", scope), true);
  assert.equal(shouldRunFast("deadcode", scope), false);
});

test("schema scope expands typecheck and tests to the full workspace by default", () => {
  const command = ["turbo", "run", "typecheck", "test"];
  const selection = ["--affected"];
  const schemaOnly = classifyChangedFiles(["supabase/schemas/600_repositories.sql"]);
  const mixed = classifyChangedFiles([
    "supabase/schemas/600_repositories.sql",
    "scripts/architecture/semantic-core.mjs",
  ]);

  assert.deepEqual(fastTaskArgs("typecheck+test", command, schemaOnly, selection), command);
  assert.deepEqual(fastTaskArgs("typecheck+test", command, mixed, selection), command);
  assert.deepEqual(
    fastTaskArgs("typecheck+test", command, mixed, ["--filter=@line_bot_v1/repository"], true),
    [...command, "--filter=@line_bot_v1/repository"],
  );
});

test("tooling metadata stays separate while root build metadata expands conservatively", () => {
  for (const file of ["AGENTS.md", "packages/AGENTS.md", "apps/web/src/modules/AGENTS.md"])
    assert.deepEqual(classifyChangedFiles([file]), {
      codeAffected: false,
      docsAffected: true,
      schemaAffected: false,
      toolingAffected: true,
    });
  for (const file of [".github/workflows/validate.yml", ".vscode/settings.json", ".node-version"])
    assert.deepEqual(classifyChangedFiles([file]), {
      codeAffected: false,
      docsAffected: false,
      schemaAffected: false,
      toolingAffected: true,
    });
  assert.deepEqual(classifyChangedFiles(["turbo.json"]), {
    codeAffected: true,
    docsAffected: false,
    schemaAffected: true,
    toolingAffected: true,
  });
});

test("GitHub operation changes run owner-local GitHub tests and tooling boundary checks", () => {
  const scope = classifyChangedFiles(["scripts/github/release-plan.mjs"]);
  assert.deepEqual(scope, {
    codeAffected: true,
    docsAffected: false,
    schemaAffected: false,
    toolingAffected: true,
  });
  assert.equal(shouldRunFast("github:test", scope), true);
  assert.equal(shouldRunFast("tooling:check", scope), true);
});

test("Attendance scheduler changes run the owner-local scheduler tests", () => {
  const scope = classifyChangedFiles(["scripts/attendance/scheduler.mjs"]);
  assert.equal(scope.codeAffected, true);
  assert.equal(shouldRunFast("attendance:scheduler:test", scope), true);
});

test("Vercel production adapter changes run the tooling-owned deployment tests", () => {
  const scope = classifyChangedFiles(["scripts/vercel/deploy-production.mjs"]);
  assert.deepEqual(scope, {
    codeAffected: true,
    docsAffected: false,
    schemaAffected: false,
    toolingAffected: true,
  });
  assert.equal(shouldRunFast("tooling:check", scope), true);
});

test("WBS operator changes run its canonical tooling test stage in full and fast validation", (t) => {
  const scope = classifyChangedFiles(["scripts/wbs/transfer.mjs"]);
  assert.deepEqual(scope, {
    codeAffected: true,
    docsAffected: false,
    schemaAffected: false,
    toolingAffected: true,
  });
  assert.equal(shouldRunFast("tooling:test", scope), true);

  const directory = mkdtempSync(join(tmpdir(), "line-bot-wbs-validation-command-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const preload = join(directory, "capture.mjs");
  writeFileSync(
    preload,
    `
    import childProcess from 'node:child_process';
    import { syncBuiltinESMExports } from 'node:module';
    childProcess.spawnSync = (_file, args) => {
      console.log(JSON.stringify(args));
      return { status: 0 };
    };
    syncBuiltinESMExports();
  `,
  );
  const output = execFileSync(
    process.execPath,
    [
      "--import",
      pathToFileURL(preload).href,
      fileURLToPath(new URL("./validate.mjs", import.meta.url)),
      "--group",
      "tooling",
    ],
    {
      encoding: "utf8",
      env: { ...process.env, npm_execpath: "fixture-pnpm.js" },
    },
  );
  const calls = output
    .split("\n")
    .filter((line) => line.startsWith("["))
    .map((line) => JSON.parse(line));
  const toolingTests = calls.filter((call) => call.includes("scripts/wbs/transfer.test.mjs"));
  assert.equal(toolingTests.length, 1);
  assert.deepEqual(toolingTests[0], [
    "--test",
    "scripts/tooling/doctor.test.mjs",
    "scripts/wbs/transfer.test.mjs",
    "scripts/code/*.test.mjs",
    "scripts/runtime/validation-command.test.mjs",
    "scripts/runtime/internal-input.test.mjs",
    "scripts/contract/*.test.mjs",
    "scripts/file/*.test.mjs",
    "scripts/execution/*.test.mjs",
  ]);
});

test("architecture tooling changes also run tooling validation", () => {
  for (const file of [
    "scripts/architecture/check-architecture.mjs",
    "architecture/implementation-topology.json",
    ".dependency-cruiser.mjs",
  ])
    assert.deepEqual(classifyChangedFiles([file]), {
      codeAffected: true,
      docsAffected: false,
      schemaAffected: false,
      toolingAffected: true,
    });
});

test("mixed product and documentation changes run product and docs gates", () => {
  assert.deepEqual(
    classifyChangedFiles(["packages/expense/src/domain/expense.ts", "docs/README.md"]),
    {
      codeAffected: true,
      docsAffected: true,
      schemaAffected: false,
      toolingAffected: false,
    },
  );
});

test("source-only changes always run the architecture gate", () => {
  for (const file of [
    "apps/web/src/modules/account/login-panel.tsx",
    "packages/account/src/domain.ts",
  ]) {
    const scope = classifyChangedFiles([file]);
    assert.equal(scope.toolingAffected, false);
    assert.equal(scope.schemaAffected, false);
    assert.equal(shouldRunFast("architecture", scope), true);
  }
  assert.equal(shouldRunFast("architecture", classifyChangedFiles(["docs/README.md"])), false);
});

test("Knip configuration changes run formatting and reachability checks", () => {
  const scope = classifyChangedFiles(["knip.jsonc"]);
  assert.equal(shouldRunFast("lint", scope), true);
  assert.equal(shouldRunFast("deadcode", scope), true);
  assert.equal(shouldRunFast("tooling:check", scope), true);
});

test("CI groups partition validation and reject unknown or unassigned stages", () => {
  const stages = Object.values(validationGroups)
    .flat()
    .map((task) => [task, [task]]);
  assert.deepEqual(selectValidationStages(stages), stages);
  const selected = Object.keys(validationGroups).flatMap((group) =>
    selectValidationStages(stages, group),
  );
  assert.equal(new Set(selected.map(([task]) => task)).size, stages.length);
  assert.equal(selected.length, stages.length);
  assert.throws(() => selectValidationStages(stages, "typo"), /Unknown validation group/);
  assert.throws(() => selectValidationStages([...stages, ["new-check", []]]), /exactly one/);
  assert.throws(() => selectValidationStages(stages.slice(1)), /exactly one/);
  assert.deepEqual(
    selectValidationStages(stages, "build").map(([task]) => task),
    ["build"],
  );
  assert.deepEqual(
    selectValidationStages(stages, "typecheck-test").map(([task]) => task),
    ["typecheck+test"],
  );
});
