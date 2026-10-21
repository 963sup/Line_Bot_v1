import assert from "node:assert/strict";
import { test } from "node:test";
import { runCli } from "../runtime/cli-subprocess-test-helper.mjs";

const script = "scripts/execution/run.mjs";
const request = (operation) => ({ operation, proof: "secret-proof", command: {}, query: {} });
const legacyError = "Execution operation failed; no credential or provider payload is logged.";

function failure(operation, scenario) {
  const result = runCli(script, request(operation), scenario);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(result.json.error, legacyError);
  assert.doesNotMatch(result.stderr, /TOP_SECRET|secret-proof/);
  return result.json;
}

test("execution CLI preserves success output and owner error codes", () => {
  assert.deepEqual(runCli(script, request("read")).json, {
    ok: true,
    value: { owner: "execution", operation: "read", actor: "user-id", input: {}, calls: 1 },
  });
  for (const operation of ["read", "execute", "dependencies", "replace-dependencies"]) {
    for (const [status, code] of [
      [400, "INVALID_INPUT"],
      [403, "FORBIDDEN"],
      [404, "NOT_FOUND"],
      [409, "CONFLICT"],
      [503, "UNAVAILABLE"],
    ]) {
      const unknownResult =
        (operation === "execute" || operation === "replace-dependencies") && code === "UNAVAILABLE";
      assert.deepEqual(failure(operation, `owner-typed:${status}:${code}`), {
        ok: false,
        error: legacyError,
        status,
        code: unknownResult ? "UNKNOWN_RESULT" : code,
      });
    }
  }
});

test("execution CLI distinguishes unavailable reads from unknown mutation results", () => {
  assert.equal(failure("read", "operation-error").code, "UNAVAILABLE");
  assert.equal(failure("execute", "operation-error").code, "UNKNOWN_RESULT");
  assert.equal(failure("execute", "owner-unavailable").code, "UNKNOWN_RESULT");
  assert.equal(failure("read", "fake-error").code, "UNAVAILABLE");
  assert.equal(failure("replace-dependencies", "operation-error").code, "UNKNOWN_RESULT");
  assert.equal(failure("replace-dependencies", "factory-error").code, "UNAVAILABLE");
  assert.equal(failure("dependencies", "operation-error").code, "UNAVAILABLE");
});

test("execution CLI dispatches Task dependency reads and writes once", () => {
  for (const operation of ["dependencies", "replace-dependencies"]) {
    assert.deepEqual(runCli(script, request(operation)).json, {
      ok: true,
      value: {
        owner: "execution",
        operation: operation === "dependencies" ? "read" : "execute",
        actor: "user-id",
        input: {},
        calls: 1,
      },
    });
  }
});

test("execution CLI classifies input, identity, qualification and cleanup safely", () => {
  assert.equal(failure("unknown", "success").code, "INVALID_INPUT");
  assert.equal(failure("read", "auth-invalid").code, "UNAUTHENTICATED");
  assert.equal(failure("read", "auth-unavailable").code, "UNAVAILABLE");
  assert.equal(failure("read", "user-missing").code, "FORBIDDEN");
  const cleanup = runCli(script, request("read"), "cleanup-error");
  assert.equal(cleanup.status, 0);
  assert.equal(cleanup.stderr, "");
});
