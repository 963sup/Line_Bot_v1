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
