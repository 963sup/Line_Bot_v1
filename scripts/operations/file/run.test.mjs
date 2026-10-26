import assert from "node:assert/strict";
import test from "node:test";
import { runCli } from "../../core/runtime/cli-subprocess-test-helper.mjs";

const script = "scripts/operations/file/run.mjs";
const input = (operation) => ({
  operation,
  proof: "secret-proof",
  repositoryId: "repo",
  fileId: "file",
  runId: "extraction",
  command: {},
  processor: "plain-text",
});
function failure(operation, scenario, request = input(operation)) {
  const result = runCli(script, request, scenario);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(result.json.ok, false);
  assert.doesNotMatch(result.stderr, /TOP_SECRET|secret-proof/);
  return result.json;
}
test("File operator authenticates before dispatch and closes its database", () => {
  const result = runCli(script, input("read-file"), "expect-close");
  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  assert.equal(result.json.value.actor, "user-id");
  assert.equal(failure("read-file", "auth-invalid").code, "UNAUTHENTICATED");
  assert.equal(failure("result", "user-inactive").code, "FORBIDDEN");
  assert.equal(failure("read-file", "success", "not-json").code, "INVALID_INPUT");
  assert.equal(failure("unknown", "success").code, "INVALID_INPUT");
});
test("File operator distinguishes unknown mutations from read failures and requires explicit extraction configuration", () => {
  assert.equal(failure("result", "operation-error").code, "UNKNOWN_RESULT");
  assert.equal(failure("read-file", "operation-error").code, "UNAVAILABLE");
  assert.equal(failure("pending-uploads", "operation-error").code, "UNAVAILABLE");
  assert.equal(failure("result", "owner-typed:409:VERSION_CONFLICT").code, "VERSION_CONFLICT");
  assert.equal(
    failure("run", "success", { ...input("run"), processor: "unknown" }).code,
    "INVALID_INPUT",
  );
  assert.equal(
    failure("run", "success", { ...input("run"), processor: "unsupported" }).code,
    "INVALID_INPUT",
  );
  assert.equal(failure("upload", "success").code, "INVALID_INPUT");
  assert.equal(failure("download", "success").code, "INVALID_INPUT");
});
