import assert from "node:assert/strict";
import { test } from "node:test";
import { runCli } from "../runtime/cli-subprocess-test-helper.mjs";

const script = "scripts/contract/run.mjs";
const request = (operation) => ({ operation, proof: "secret-proof", command: {}, query: {} });
const legacyError = "Contract operation failed; no credential or provider payload is logged.";

function failure(operation, scenario, input = request(operation)) {
  const result = runCli(script, input, scenario);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(result.json.ok, false);
  assert.equal(result.json.error, legacyError);
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, /TOP_SECRET|secret-proof/);
  return result.json;
}

test("contract CLI preserves success output and contains cleanup failure", () => {
  const command = { requestId: "00000000-0000-4000-8000-000000000001", action: "create" };
  const result = runCli(script, { ...request("execute"), command }, "expect-close");
  assert.equal(result.status, 0);
  assert.deepEqual(result.json, {
    ok: true,
    value: {
      owner: "contract",
      operation: "execute",
      actor: "user-id",
      input: command,
      calls: 1,
    },
  });
  assert.equal(result.stderr, "");

  const cleanup = runCli(script, request("read"), "cleanup-error");
  assert.equal(cleanup.status, 0);
  assert.equal(cleanup.stderr, "");
});

test("contract CLI classifies input and identity failures before dispatch", () => {
  assert.deepEqual(failure("read", "success", "not-json"), {
    ok: false,
    error: legacyError,
    status: 400,
    code: "INVALID_INPUT",
  });
  assert.equal(failure("unknown", "success").code, "INVALID_INPUT");
  assert.equal(failure("read", "success", "").code, "INVALID_INPUT");
  assert.equal(failure("read", "success", { operation: "read" }).code, "UNAUTHENTICATED");
  assert.deepEqual(failure("read", "auth-invalid"), {
    ok: false,
    error: legacyError,
    status: 401,
    code: "UNAUTHENTICATED",
  });
  assert.equal(failure("read", "auth-unavailable").code, "UNAVAILABLE");
  assert.equal(failure("read", "user-missing").code, "FORBIDDEN");
  assert.equal(failure("read", "user-inactive").code, "FORBIDDEN");
});

test("contract CLI uses strict owner errors and distinguishes unknown mutation results", () => {
  for (const [status, code] of [
    [400, "INVALID_INPUT"],
    [403, "FORBIDDEN"],
    [404, "NOT_FOUND"],
    [409, "VERSION_CONFLICT"],
    [409, "LIFECYCLE_CONFLICT"],
    [409, "REQUEST_ID_REUSED"],
    [409, "SOURCE_INVALID"],
    [503, "UNAVAILABLE"],
  ]) {
    assert.deepEqual(failure("read", `owner-typed:${status}:${code}`), {
      ok: false,
      error: legacyError,
      status,
      code,
    });
  }
  assert.equal(failure("read", "fake-error").code, "UNAVAILABLE");
  assert.equal(failure("read", "operation-error").code, "UNAVAILABLE");
  assert.equal(failure("execute", "operation-error").code, "UNKNOWN_RESULT");
  assert.equal(failure("execute", "owner-unavailable").code, "UNKNOWN_RESULT");
  assert.equal(failure("execute", "owner-typed:409:VERSION_CONFLICT").code, "VERSION_CONFLICT");
  assert.equal(failure("read", "db-constructor").code, "UNAVAILABLE");
  assert.equal(failure("read", "factory-error").code, "UNAVAILABLE");
});
