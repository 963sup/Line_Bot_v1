import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import {
  confirmsObjectReceipt,
  type PendingObjectCommand,
  parsePendingObjectCommand,
} from "../src/modules/object/object-pending";

test("Object pending command remains actor, Repository and target scoped", () => {
  const objectId = randomUUID();
  const command = {
    action: "edit",
    repositoryId: "repo",
    objectId,
    requestId: randomUUID(),
    expectedVersion: 4,
    name: "Requirement",
    content: "Current",
  };
  const stored = { actorUserId: "user", family: "objects", command };
  assert.deepEqual(parsePendingObjectCommand(stored, "user", "repo", objectId), stored);
  assert.equal(parsePendingObjectCommand(stored, "other", "repo", objectId), null);
  assert.equal(parsePendingObjectCommand(stored, "user", "other", objectId), null);
  assert.equal(parsePendingObjectCommand(stored, "user", "repo", randomUUID()), null);
});

test("Object receipt must acknowledge exact family, scope, target and next version", () => {
  const objectId = randomUUID();
  const pending: PendingObjectCommand = {
    actorUserId: "user",
    family: "objects",
    command: {
      action: "archive",
      repositoryId: "repo",
      objectId,
      requestId: randomUUID(),
      expectedVersion: 7,
    },
  };
  const receipt = {
    requestId: pending.command.requestId,
    kind: "object",
    result: {
      repositoryId: "repo",
      objectId,
      version: 8,
      action: "archive",
      actorUserId: "user",
    },
  };
  assert.equal(confirmsObjectReceipt(receipt, pending), true);
  assert.equal(confirmsObjectReceipt({ ...receipt, kind: "type" }, pending), false);
  assert.equal(
    confirmsObjectReceipt(
      { ...receipt, result: { ...receipt.result, action: "unarchive" } },
      pending,
    ),
    false,
  );
  assert.equal(
    confirmsObjectReceipt(
      { ...receipt, result: { ...receipt.result, actorUserId: "other" } },
      pending,
    ),
    false,
  );
  assert.equal(
    confirmsObjectReceipt(
      { ...receipt, result: { ...receipt.result, repositoryId: "other" } },
      pending,
    ),
    false,
  );
  assert.equal(
    confirmsObjectReceipt(
      { ...receipt, result: { ...receipt.result, objectId: randomUUID() } },
      pending,
    ),
    false,
  );
  assert.equal(
    confirmsObjectReceipt({ ...receipt, result: { ...receipt.result, version: 7 } }, pending),
    false,
  );
});

test("Object Type receipt maps command typeId to committed DTO id", () => {
  const typeId = randomUUID();
  const pending: PendingObjectCommand = {
    actorUserId: "admin",
    family: "types",
    command: {
      action: "create",
      repositoryId: "repo",
      typeId,
      requestId: randomUUID(),
      expectedVersion: 0,
    },
  };
  assert.equal(
    confirmsObjectReceipt(
      {
        requestId: pending.command.requestId,
        kind: "type",
        result: { id: typeId, repositoryId: "repo", version: 1 },
      },
      pending,
    ),
    true,
  );
});

test("atomic engineering retry remains actor/repository bound and acknowledges every changed version", () => {
  const objectId = randomUUID();
  const pending: PendingObjectCommand = {
    actorUserId: "user",
    family: "objects",
    command: {
      action: "set-quantities",
      repositoryId: "repo",
      requestId: randomUUID(),
      expectedVersion: 0,
      observed: { objects: [], relationships: [] },
      changes: [{ objectId, expectedVersion: 4, quantity: null }],
    },
  };
  assert.deepEqual(parsePendingObjectCommand(pending, "user", "repo", objectId), pending);
  assert.equal(parsePendingObjectCommand(pending, "other", "repo", objectId), null);
  const receipt = {
    requestId: pending.command.requestId,
    kind: "engineering",
    result: {
      repositoryId: "repo",
      objects: [
        { objectId, repositoryId: "repo", actorUserId: "user", version: 5, action: "set-quantity" },
      ],
      relationships: [],
      measure: null,
    },
  };
  assert.equal(confirmsObjectReceipt(receipt, pending), true);
  assert.equal(confirmsObjectReceipt({ ...receipt, requestId: randomUUID() }, pending), false);
  assert.equal(
    confirmsObjectReceipt({ ...receipt, result: { ...receipt.result, objects: [] } }, pending),
    false,
  );
  assert.equal(
    confirmsObjectReceipt(
      {
        ...receipt,
        result: { ...receipt.result, objects: [{ ...receipt.result.objects[0], version: 4 }] },
      },
      pending,
    ),
    false,
  );
  assert.equal(
    confirmsObjectReceipt(
      {
        ...receipt,
        result: {
          ...receipt.result,
          objects: [{ ...receipt.result.objects[0], actorUserId: "other" }],
        },
      },
      pending,
    ),
    false,
  );
});

test("creating a child acknowledges its immutable endpoint identity and parent", () => {
  const objectId = randomUUID(),
    parentObjectId = randomUUID(),
    relationshipId = randomUUID();
  const pending: PendingObjectCommand = {
    actorUserId: "user",
    family: "objects",
    command: {
      action: "create-child",
      repositoryId: "repo",
      requestId: randomUUID(),
      expectedVersion: 0,
      objectId,
      parentObjectId,
      relationshipId,
      kind: "ALLOCATES",
    },
  };
  const receipt = {
    requestId: pending.command.requestId,
    kind: "engineering",
    result: {
      repositoryId: "repo",
      objects: [
        { objectId, repositoryId: "repo", actorUserId: "user", action: "create", version: 1 },
      ],
      relationships: [
        {
          relationshipId,
          repositoryId: "repo",
          actorUserId: "user",
          action: "create",
          version: 1,
          sourceObjectId: parentObjectId,
          targetObjectId: objectId,
          kind: "ALLOCATES",
          active: true,
        },
      ],
      measure: null,
    },
  };
  assert.equal(confirmsObjectReceipt(receipt, pending), true);
  assert.equal(
    confirmsObjectReceipt(
      {
        ...receipt,
        result: {
          ...receipt.result,
          relationships: [{ ...receipt.result.relationships[0], sourceObjectId: randomUUID() }],
        },
      },
      pending,
    ),
    false,
  );
});
