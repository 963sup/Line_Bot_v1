import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseWbsTransferCancellation,
  parseWbsTransferOperation,
  reconcileWbsTransferCancellation,
} from "../src/application/transfer-recovery.js";

const expected = {
  actorUserId: "actor",
  repositoryId: "repository",
  sourceVersion: 2,
  sourceHeadRevisionId: "33333333-3333-4333-8333-333333333333",
};
const operation = {
  ...expected,
  createCommand: {
    action: "create-project",
    requestId: "11111111-1111-4111-8111-111111111111",
    ownerAccountId: "actor",
    ownerKind: "USER",
    expectedVersion: 0,
    title: "Alpha WBS",
    public: false,
    repositoryId: "repository",
    teamId: null,
  },
  transferCommand: {
    transferId: "22222222-2222-4222-8222-222222222222",
    requestId: "44444444-4444-4444-8444-444444444444",
    repositoryId: "repository",
    projectId: "project",
    sourceVersion: 2,
    sourceHeadRevisionId: "33333333-3333-4333-8333-333333333333",
  },
  accepted: null,
};

test("WBS transfer recovery keeps the original Project and transfer identities", () => {
  const parsed = parseWbsTransferOperation(operation, expected);
  assert.equal(parsed.createCommand.requestId, operation.createCommand.requestId);
  assert.deepEqual(parsed.transferCommand, operation.transferCommand);
});

test("WBS transfer recovery rejects actor, repository, source and destination drift", () => {
  assert.throws(() => parseWbsTransferOperation(operation, { ...expected, actorUserId: "other" }));
  assert.throws(() => parseWbsTransferOperation({ ...operation, repositoryId: "other" }, expected));
  assert.throws(() => parseWbsTransferOperation(operation, { ...expected, sourceVersion: 3 }));
  assert.throws(
    () =>
      parseWbsTransferOperation(operation, {
        ...expected,
        sourceHeadRevisionId: "55555555-5555-4555-8555-555555555555",
      }),
    { message: "WBS 移轉重試來源已變更。" },
  );
  assert.throws(() =>
    parseWbsTransferOperation(
      {
        ...operation,
        createCommand: { ...operation.createCommand, public: true },
      },
      expected,
    ),
  );
});

test("accepted durable transfer preserves its immutable source snapshot after source drift", () => {
  const accepted = {
    id: operation.transferCommand.transferId,
    repositoryId: expected.repositoryId,
    projectId: operation.transferCommand.projectId,
    actorUserId: expected.actorUserId,
    requestId: operation.transferCommand.requestId,
    state: "REQUESTED",
    sourceVersion: expected.sourceVersion,
    sourceHeadRevisionId: expected.sourceHeadRevisionId,
    revisionCount: expected.sourceVersion,
    commandCount: expected.sourceVersion,
    sourceHash: "hash",
    requestedAt: 1,
    activatedAt: null,
    releaseSha: null,
    cancelledAt: null,
    cancelRequestId: null,
  } as const;
  const parsed = parseWbsTransferOperation(
    { ...operation, accepted },
    { ...expected, sourceVersion: 3, sourceHeadRevisionId: "55555555-5555-4555-8555-555555555555" },
  );
  assert.equal(parsed.sourceVersion, 2);
  assert.deepEqual(parsed.accepted, accepted);
  for (const mismatch of [
    { id: "66666666-6666-4666-8666-666666666666" },
    { requestId: "66666666-6666-4666-8666-666666666666" },
    { sourceVersion: 3 },
    { sourceHeadRevisionId: "55555555-5555-4555-8555-555555555555" },
  ]) {
    assert.throws(
      () =>
        parseWbsTransferOperation(
          { ...operation, accepted: { ...accepted, ...mismatch } },
          expected,
        ),
      { message: "WBS 移轉回執不一致。" },
    );
  }
});

test("WBS transfer cancellation recovery preserves the exact request identity", () => {
  const value = {
    actorUserId: "actor",
    repositoryId: "repository",
    command: {
      transferId: "22222222-2222-4222-8222-222222222222",
      repositoryId: "repository",
      requestId: "55555555-5555-4555-8555-555555555555",
    },
  };
  assert.deepEqual(
    parseWbsTransferCancellation(value, { actorUserId: "actor", repositoryId: "repository" }),
    value,
  );
  assert.throws(() =>
    parseWbsTransferCancellation(value, { actorUserId: "other", repositoryId: "repository" }),
  );
  assert.throws(() => parseWbsTransferCancellation({ ...value, repositoryId: "other" }, expected), {
    message: "WBS 移轉撤回重試範圍不正確。",
  });
  assert.throws(
    () =>
      parseWbsTransferCancellation(
        { ...value, command: { ...value.command, repositoryId: "other" } },
        expected,
      ),
    { message: "WBS 移轉撤回重試範圍不正確。" },
  );
});

test("stored cancellation is reused only for the same durable requested transfer", () => {
  const cancellation = parseWbsTransferCancellation(
    {
      actorUserId: "actor",
      repositoryId: "repository",
      command: {
        transferId: "22222222-2222-4222-8222-222222222222",
        repositoryId: "repository",
        requestId: "55555555-5555-4555-8555-555555555555",
      },
    },
    { actorUserId: "actor", repositoryId: "repository" },
  );
  const durable = {
    id: cancellation.command.transferId,
    repositoryId: "repository",
    projectId: "project",
    actorUserId: "actor",
    requestId: "44444444-4444-4444-8444-444444444444",
    state: "REQUESTED",
    sourceVersion: 2,
    sourceHeadRevisionId: expected.sourceHeadRevisionId,
    revisionCount: 2,
    commandCount: 2,
    sourceHash: "hash",
    requestedAt: 1,
    activatedAt: null,
    releaseSha: null,
    cancelledAt: null,
    cancelRequestId: null,
  } as const;
  assert.equal(reconcileWbsTransferCancellation(cancellation, durable), cancellation);
  assert.equal(
    reconcileWbsTransferCancellation(cancellation, {
      ...durable,
      id: "66666666-6666-4666-8666-666666666666",
    }),
    null,
  );
  assert.equal(
    reconcileWbsTransferCancellation(cancellation, { ...durable, state: "ACTIVE" }),
    null,
  );
  assert.equal(reconcileWbsTransferCancellation(cancellation, null), cancellation);
});
