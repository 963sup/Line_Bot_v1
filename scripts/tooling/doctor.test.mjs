import assert from "node:assert/strict";
import test from "node:test";
import { evaluateDoctor, parseEnvKeys } from "./doctor.mjs";

test("parseEnvKeys returns canonical variable names without values", () => {
  assert.deepEqual(parseEnvKeys("# comment\nFOO=\n BAR = value\nFOO=again\ninvalid-line"), [
    "BAR",
    "FOO",
  ]);
});

test("evaluateDoctor succeeds only when required local toolchain matches", () => {
  assert.equal(
    evaluateDoctor({
      expectedNode: "24.19.0",
      actualNode: "24.19.0",
      expectedPnpm: "11.19.0",
      actualPnpm: "11.19.0",
      gitVersion: "git version 2.50.0",
      dependencies: { turbo: true, typescript: true },
    }).ok,
    true,
  );

  const failed = evaluateDoctor({
    expectedNode: "24.19.0",
    actualNode: "24.18.0",
    expectedPnpm: "11.19.0",
    actualPnpm: null,
    gitVersion: null,
    dependencies: { turbo: false },
  });
  assert.equal(failed.ok, false);
  assert.deepEqual(
    failed.checks.filter((check) => !check.ok).map((check) => check.id),
    ["node", "pnpm", "git", "dependency:turbo"],
  );
});
