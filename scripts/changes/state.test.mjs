import assert from "node:assert/strict";
import test from "node:test";
import { evaluatePreflight, parseAheadBehind } from "./state.mjs";

test("parseAheadBehind maps origin/main left count to behind and branch right count to ahead", () => {
  assert.deepEqual(parseAheadBehind("2\t5"), { behind: 2, ahead: 5 });
  assert.deepEqual(parseAheadBehind("invalid"), { behind: null, ahead: null });
});

test("evaluatePreflight accepts a clean up-to-date feature branch", () => {
  assert.deepEqual(
    evaluatePreflight({
      branch: "feat/example",
      upstream: "origin/feat/example",
      originMain: "a".repeat(40),
      behind: 0,
      clean: true,
      conflicts: [],
    }),
    [],
  );
});

test("evaluatePreflight reports merge blockers without changing state", () => {
  const issues = evaluatePreflight({
    branch: "main",
    upstream: null,
    originMain: "a".repeat(40),
    behind: 2,
    clean: false,
    conflicts: ["package.json"],
  });
  assert.deepEqual(
    issues.map((issue) => issue.code),
    ["main-branch", "missing-upstream", "behind-main", "dirty-worktree", "conflicts"],
  );
});
