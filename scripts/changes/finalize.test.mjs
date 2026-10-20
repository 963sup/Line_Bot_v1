import assert from "node:assert/strict";
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
