import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  classifyChangedFiles,
  detectFastScope,
  fastTaskArgs,
  selectValidationStages,
  shouldRunFast,
  validationGroups,
} from "./validate.mjs";

function git(directory, args) {
  execFileSync("git", args, { cwd: directory, stdio: "ignore" });
}

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
