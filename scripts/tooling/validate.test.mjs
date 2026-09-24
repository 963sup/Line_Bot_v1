import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyChangedFiles, fastTaskArgs, shouldRunFast } from "./validate.mjs";

test("lockfile consistency gate cannot be skipped by fast scope", () => {
  for (const scope of [
    null,
    classifyChangedFiles([]),
    classifyChangedFiles(["docs/060-engineering/README.md"]),
  ])
    assert.equal(shouldRunFast("lockfile", scope), true);
});

test("documentation-only changes run only documentation-owned fast gates", () => {
  assert.deepEqual(classifyChangedFiles(["docs/060-engineering/README.md", "README.md"]), {
    codeAffected: false,
    docsAffected: true,
    schemaAffected: false,
    toolingAffected: false,
  });
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
    fastTaskArgs("typecheck+test", command, mixed, ["--filter=@line-work/repository"], true),
    [...command, "--filter=@line-work/repository"],
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
  for (const file of [".github/workflows/validate.yml", ".vscode/settings.json"])
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
