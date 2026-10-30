import assert from "node:assert/strict";
import { test } from "node:test";
import { commercialTaskIdentity } from "../src/application/commands/commercial-task.js";
import { parseCommercialIntakeStatusIdentity } from "../src/contracts/output/commercial-intake.js";

const taskId = "12345678-1234-4123-8123-123456789abc";

test("commercial task identities preserve the released namespace and bind start, read and resume", () => {
  const identity = commercialTaskIdentity(taskId);
  assert.deepEqual(identity, {
    commandId: "6d627a66-33ec-5fb3-bedd-6d8c76f1a3c7",
    documentId: "4767c434-8d0d-5663-af42-65a280b5efa3",
    draftCommandId: "2ee32115-60c5-5e1f-a319-0dfc0e5e5e1a",
  });
  assert.deepEqual(commercialTaskIdentity(taskId.toUpperCase()), identity);
  assert.notDeepEqual(commercialTaskIdentity("22345678-1234-4123-8123-123456789abc"), identity);
});

test("commercial task rejects malformed identity without generating replacement commands", () => {
  for (const input of [null, [], "task", { taskId: "bad", operation: "start" }]) {
    assert.throws(() => commercialTaskIdentity(input));
  }
  assert.throws(() => commercialTaskIdentity(` ${taskId}`), /ID is invalid/);
});

test("commercial task status binds browser task identity and requires a valid document locator", () => {
  const { documentId } = commercialTaskIdentity(taskId);
  const status = { state: "RESULT_READY", taskId, documentId };
  assert.equal(parseCommercialIntakeStatusIdentity(status, { taskId }), "RESULT_READY");
  for (const changed of [
    { ...status, taskId: "other" },
    { ...status, documentId: "invalid" },
    { ...status, state: "CONFIRMED" },
  ]) {
    assert.throws(() => parseCommercialIntakeStatusIdentity(changed, { taskId }));
  }
});

test("commercial status identity stays bound to the requested command and document", () => {
  const expected = { commandId: "command", documentId: "document" };
  assert.equal(
    parseCommercialIntakeStatusIdentity(
      { state: "OUTCOME_UNKNOWN", commandId: "command", documentId: "document" },
      expected,
    ),
    "OUTCOME_UNKNOWN",
  );
  assert.throws(() =>
    parseCommercialIntakeStatusIdentity(
      { state: "DRAFT_SAVED", commandId: "other", documentId: "document" },
      expected,
    ),
  );
});
