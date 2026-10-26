import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { finalizeChange, validateCommandSurface } from "./finalize.mjs";

const ready = {
  branch: "feat/fixture",
  head: "a".repeat(40),
  originMain: "b".repeat(40),
  upstream: "origin/feat/fixture",
  behind: 0,
  clean: true,
  conflicts: [],
};

test("finalize succeeds only for the same ready branch, head and base", () => {
  let reads = 0;
  let validated = 0;
  const result = finalizeChange({
    collectState: () => {
      reads++;
      return { ...ready };
    },
    validate: () => {
      validated++;
    },
  });
  assert.equal(reads, 2);
  assert.equal(validated, 1);
  assert.deepEqual(result, {
    ok: true,
    branch: ready.branch,
    head: ready.head,
    originMain: ready.originMain,
    validated: "pnpm validate",
    unchangedHead: true,
  });
});

test("finalize rejects revision, branch, base or upstream changes even when both states are ready", () => {
  for (const key of ["branch", "head", "originMain", "upstream"]) {
    let reads = 0;
    assert.throws(
      () =>
        finalizeChange({
          collectState: () => (reads++ === 0 ? { ...ready } : { ...ready, [key]: "changed" }),
          validate: () => {},
        }),
      new RegExp(`${key} changed during validation`),
    );
  }
});

test("invalid before state prevents validation and invalid after state cannot succeed", () => {
  for (const invalid of [{ clean: false }, { behind: 1 }, { conflicts: ["conflict.txt"] }]) {
    let calls = 0;
    assert.throws(() =>
      finalizeChange({
        collectState: () => ({ ...ready, ...invalid }),
        validate: () => {
          calls++;
        },
      }),
    );
    assert.equal(calls, 0);
    let reads = 0;
    assert.throws(() =>
      finalizeChange({
        collectState: () => (reads++ === 0 ? { ...ready } : { ...ready, ...invalid }),
        validate: () => {},
      }),
    );
  }
});

test("failed canonical validation propagates without a successful after read", () => {
  let reads = 0;
  assert.throws(
    () =>
      finalizeChange({
        collectState: () => {
          reads++;
          return { ...ready };
        },
        validate: () => {
          throw new Error("fixture validation failed");
        },
      }),
    /fixture validation failed/,
  );
  assert.equal(reads, 1);
});

test("failed finalize validation preserves full evidence and bounds diagnostic output", (t) => {
  const cwd = mkdtempSync(join(tmpdir(), "line-bot-finalize-evidence-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const outputDirectory = join(cwd, "artifacts");
  mkdirSync(outputDirectory);
  const npmExecPath = join(cwd, "fixture-pnpm.mjs");
  writeFileSync(
    npmExecPath,
    [
      'if (process.argv[2] !== "validate") process.exit(9);',
      'console.error("ERROR: first actionable validation failure");',
      'for (let i = 0; i < 200; i++) console.error("noise-" + i + ":" + "x".repeat(120));',
      "process.exit(7);",
    ].join("\n"),
  );

  assert.throws(
    () => validateCommandSurface({ npmExecPath, cwd, outputDirectory }),
    (error) => {
      assert.match(error.message, /pnpm validate failed with status 7/);
      assert.match(error.message, /first actionable validation failure/);
      assert.match(error.message, /Full output: /);
      assert.ok(Buffer.byteLength(error.message) < 9 * 1024);
      return true;
    },
  );
  const log = readFileSync(join(outputDirectory, "validate.log"), "utf8");
  assert.match(log, /first actionable validation failure/);
  assert.match(log, /noise-199/);
});

test("successful finalize validation writes full output without emitting it", (t) => {
  const cwd = mkdtempSync(join(tmpdir(), "line-bot-finalize-success-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const outputDirectory = join(cwd, "artifacts");
  mkdirSync(outputDirectory);
  const npmExecPath = join(cwd, "fixture-pnpm.mjs");
  writeFileSync(npmExecPath, 'console.log("x".repeat(16 * 1024));');
  assert.equal(validateCommandSurface({ npmExecPath, cwd, outputDirectory }), undefined);
  assert.equal(
    readFileSync(join(outputDirectory, "validate.log"), "utf8").trim().length,
    16 * 1024,
  );
});

test("validation uses the pinned pnpm entrypoint and rejects subprocess failure", () => {
  assert.throws(() => validateCommandSurface({ npmExecPath: "" }), /pinned pnpm/);
  let call;
  validateCommandSurface({
    npmExecPath: "fixture-pnpm.cjs",
    spawn: (...args) => {
      call = args;
      return { status: 0 };
    },
  });
  assert.deepEqual(call.slice(0, 2), [process.execPath, ["fixture-pnpm.cjs", "validate"]]);
  assert.throws(
    () => validateCommandSurface({ npmExecPath: "fixture-pnpm.cjs", spawn: () => ({ status: 1 }) }),
    /failed with status 1/,
  );
});
