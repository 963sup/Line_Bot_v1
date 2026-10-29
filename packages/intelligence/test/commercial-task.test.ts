import assert from "node:assert/strict";
import { test } from "node:test";
import {
  commercialTaskCommand,
  commercialTaskCommandId,
} from "../src/application/commands/commercial-task.js";
import { parseCommercialIntakeStatusIdentity } from "../src/contracts/output/commercial-intake.js";

const taskId = "12345678-1234-4123-8123-123456789abc";

test("commercial task identities preserve the released namespace and bind start, read and resume", () => {
  const source = { fileId: "file", fileRevisionId: "revision", sha256: "digest" };
  const start = commercialTaskCommand({ taskId, operation: "start", repositoryId: "repo", source });
  assert.deepEqual(start, {
    operation: "start",
    commandId: "6d627a66-33ec-5fb3-bedd-6d8c76f1a3c7",
    repositoryId: "repo",
    source,
    target: {
      documentId: "4767c434-8d0d-5663-af42-65a280b5efa3",
      draftCommandId: "2ee32115-60c5-5e1f-a319-0dfc0e5e5e1a",
      expectedDocumentVersion: 0,
    },
  });
  assert.equal(commercialTaskCommandId(taskId.toUpperCase()), start.commandId);
  assert.deepEqual(
    commercialTaskCommand({
      taskId: taskId.toUpperCase(),
      operation: "resume",
      repositoryId: "repo",
    }),
    { operation: "resume", repositoryId: "repo", commandId: start.commandId },
  );
  assert.notEqual(commercialTaskCommandId("22345678-1234-4123-8123-123456789abc"), start.commandId);
});

test("commercial task rejects malformed identity and unsupported intent without generating replacement commands", () => {
  for (const input of [null, [], "task", { taskId: "bad", operation: "start" }]) {
    assert.throws(() => commercialTaskCommand(input));
  }
  assert.throws(
    () => commercialTaskCommand({ taskId, operation: "cancel" }),
    /operation is invalid/,
  );
  assert.throws(() => commercialTaskCommandId(` ${taskId}`), /ID is invalid/);
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
