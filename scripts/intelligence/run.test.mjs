import assert from "node:assert/strict";
import test from "node:test";
import { runCli } from "../runtime/cli-subprocess-test-helper.mjs";

const script = "scripts/intelligence/run.mjs";
const environment = { GEMINI_API_KEY: "TOP_SECRET_KEY", GEMINI_MODEL: "test-model" };
const command = {
  action: "save",
  repositoryId: "repo-1",
  documentId: "11111111-1111-4111-8111-111111111111",
  requestId: "22222222-2222-4222-8222-222222222222",
  expectedVersion: 0,
  expectedLineCount: 54,
  source: {
    fileId: "33333333-3333-4333-8333-333333333333",
    fileRevisionId: "44444444-4444-4444-8444-444444444444",
    fileSha256: "a".repeat(64),
  },
};

function request(operation, value = command) {
  return { operation, proof: "secret-proof", command: value };
}

function failure(scenario, input) {
  const result = runCli(script, input, scenario, environment);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(result.json.ok, false);
  assert.equal(
    result.json.error,
    "Intelligence operation failed; credentials, source bytes and provider payload are not logged.",
  );
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, /TOP_SECRET|secret-proof|TOP_SECRET_KEY/);
  return result.json;
}

test("intake accepts only save and returns the target receipt", () => {
  const saved = runCli(script, request("intake"), "success", environment);
  assert.equal(saved.status, 0);
  assert.equal(saved.json.value.actor, "user-id");
  assert.equal(saved.json.value.documentId, command.documentId);
  assert.deepEqual(failure("success", request("intake", { ...command, action: "confirm" })), {
    ok: false,
    error:
      "Intelligence operation failed; credentials, source bytes and provider payload are not logged.",
    status: 400,
    code: "INVALID_INPUT",
  });
});

test("receipt remains actor-authorized and File authorization remains visible", () => {
  const receipt = runCli(script, request("receipt"), "success", environment);
  assert.equal(receipt.status, 0);
  assert.equal(receipt.json.value.operation, "receipt");
  assert.equal(receipt.json.value.actor, "user-id");
  assert.deepEqual(failure("file-forbidden", request("intake")), {
    ok: false,
    error:
      "Intelligence operation failed; credentials, source bytes and provider payload are not logged.",
    status: 403,
    code: "FORBIDDEN",
  });
});

test("unknown target outcome and technical attempt failures retain their precise recovery status", () => {
  assert.equal(failure("target-unknown", request("intake")).code, "UNKNOWN_RESULT");
  assert.deepEqual(failure("attempt-conflict", request("intake")), {
    ok: false,
    error:
      "Intelligence operation failed; credentials, source bytes and provider payload are not logged.",
    status: 409,
    code: "REQUEST_ID_REUSED",
  });
  assert.equal(failure("provider-error", request("intake")).code, "UNAVAILABLE");
});
