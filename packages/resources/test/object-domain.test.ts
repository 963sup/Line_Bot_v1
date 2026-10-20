import assert from "node:assert/strict";
import test from "node:test";
import {
  parseObjectCommand,
  parseObjectRelationshipCommand,
  parseObjectTypeCommand,
} from "../src/application/commands.js";
import { ObjectError } from "../src/domain/error.js";
import { type ObjectRevision, reviseObject } from "../src/domain/object.js";
import { reviseObjectType } from "../src/domain/object-type.js";
import { reviseRelationship } from "../src/domain/relationship.js";

const repositoryId = "repo-1";
const userId = "user-1";
const ids = {
  request: "00000000-0000-4000-8000-000000000001",
  type: "00000000-0000-4000-8000-000000000002",
  object: "00000000-0000-4000-8000-000000000003",
  revision: "00000000-0000-4000-8000-000000000004",
  other: "00000000-0000-4000-8000-000000000005",
  relationship: "00000000-0000-4000-8000-000000000006",
};

test("command parsers normalize identities and reject unknown fields", () => {
  assert.equal(
    parseObjectTypeCommand({
      action: "create",
      repositoryId,
      requestId: ids.request.toUpperCase(),
      expectedVersion: 0,
      typeId: ids.type,
      name: "Equipment",
      description: "",
    }).requestId,
    ids.request,
  );
  assert.equal(
    parseObjectCommand({
      action: "create",
      repositoryId,
      requestId: ids.request,
      expectedVersion: 0,
      objectId: ids.object,
      typeId: ids.type,
      name: "AHU A",
      content: "spec",
    }).action,
    "create",
  );
  assert.equal(
    parseObjectRelationshipCommand({
      action: "create",
      repositoryId,
      requestId: ids.request,
      expectedVersion: 0,
      relationshipId: ids.relationship,
      sourceObjectId: ids.object,
      targetObjectId: ids.other,
      name: "installed-in",
    }).action,
    "create",
  );
  assert.throws(
    () =>
      parseObjectCommand({
        action: "archive",
        repositoryId,
        requestId: ids.request,
        expectedVersion: 1,
        objectId: ids.object,
        extra: true,
      }),
    (error) => error instanceof ObjectError && error.code === "INVALID_INPUT",
  );
});

test("Object Type update preserves disabled state and enabling is explicit", () => {
  const created = reviseObjectType(
    null,
    { action: "create", name: " Equipment ", description: "" },
    {
      id: ids.type,
      repositoryId,
      expectedVersion: 0,
      at: 1,
    },
  );
  const disabled = reviseObjectType(
    created,
    { action: "disable" },
    {
      id: ids.type,
      repositoryId,
      expectedVersion: 1,
      at: 2,
    },
  );
  const renamed = reviseObjectType(
    disabled,
    { action: "update", name: "Asset", description: "physical" },
    {
      id: ids.type,
      repositoryId,
      expectedVersion: 2,
      at: 3,
    },
  );
  assert.equal(renamed.enabled, false);
  assert.equal(
    reviseObjectType(
      renamed,
      { action: "enable" },
      {
        id: ids.type,
        repositoryId,
        expectedVersion: 3,
        at: 4,
      },
    ).enabled,
    true,
  );
});

function createObject(): ObjectRevision {
  return reviseObject(
    null,
    { action: "create", typeId: ids.type, name: " AHU A ", content: "v1" },
    {
      id: ids.revision,
      objectId: ids.object,
      repositoryId,
      actorUserId: userId,
      expectedVersion: 0,
      at: 1,
      typeName: "Equipment",
    },
  );
}

test("shared Content values preserve Object normalization, error wording and conflict precedence", () => {
  const context = {
    id: ids.revision,
    objectId: ids.object,
    repositoryId,
    actorUserId: userId,
    expectedVersion: 0,
    at: 1,
    typeName: "Equipment",
  };
  const body = "  original\r\nplain text  ";
  const created = reviseObject(
    null,
    { action: "create", typeId: ids.type, name: "  AHU A  ", content: body },
    context,
  );
  assert.equal(created.name, "AHU A");
  assert.equal(created.content, body);

  for (const [name, content, message] of [
    [" ", "x".repeat(262_145), "Object 名稱需為 1 到 200 字。"],
    ["AHU A", "x".repeat(262_145), "Object 內容不可超過 262144 字。"],
  ] as const) {
    assert.throws(
      () =>
        reviseObject(
          created,
          { action: "edit", name, content },
          { ...context, expectedVersion: 1 },
        ),
      (error) =>
        error instanceof ObjectError &&
        error.status === 400 &&
        error.code === "INVALID_INPUT" &&
        error.message === message,
    );
  }
  assert.throws(
    () => reviseObject(created, { action: "edit", name: " ", content: body }, context),
    (error) => error instanceof ObjectError && error.code === "VERSION_CONFLICT",
  );
});

test("Object has stable identity, immutable revision chain and archive gate", () => {
  const created = createObject();
  const edited = reviseObject(
    created,
    { action: "edit", name: "AHU A", content: "v2" },
    {
      id: ids.other,
      objectId: ids.object,
      repositoryId,
      actorUserId: userId,
      expectedVersion: 1,
      at: 2,
      typeName: created.typeName,
    },
  );
  assert.equal(edited.objectId, created.objectId);
  assert.equal(edited.parentRevisionId, created.id);
  assert.equal(edited.version, 2);
  const archived = reviseObject(
    edited,
    { action: "archive" },
    {
      id: "00000000-0000-4000-8000-000000000007",
      objectId: ids.object,
      repositoryId,
      actorUserId: userId,
      expectedVersion: 2,
      at: 3,
      typeName: edited.typeName,
    },
  );
  assert.throws(
    () =>
      reviseObject(
        archived,
        { action: "edit", name: "AHU A", content: "v3" },
        {
          id: "00000000-0000-4000-8000-000000000008",
          objectId: ids.object,
          repositoryId,
          actorUserId: userId,
          expectedVersion: 3,
          at: 4,
          typeName: archived.typeName,
        },
      ),
    (error) => error instanceof ObjectError && error.code === "OBJECT_ARCHIVED",
  );
});

test("restore creates a new revision and validates source ownership", () => {
  const created = createObject();
  const edited = reviseObject(
    created,
    { action: "edit", name: "AHU B", content: "v2" },
    {
      id: ids.other,
      objectId: ids.object,
      repositoryId,
      actorUserId: userId,
      expectedVersion: 1,
      at: 2,
      typeName: created.typeName,
    },
  );
  const restored = reviseObject(
    edited,
    { action: "restore", revisionId: created.id },
    {
      id: "00000000-0000-4000-8000-000000000009",
      objectId: ids.object,
      repositoryId,
      actorUserId: userId,
      expectedVersion: 2,
      at: 3,
      typeName: created.typeName,
    },
    created,
  );
  assert.equal(restored.name, created.name);
  assert.equal(restored.content, created.content);
  assert.equal(restored.version, 3);
});

test("directed relationship permits cycles but rejects self edges and duplicate no-op rename", () => {
  const first = reviseRelationship(
    null,
    {
      action: "create",
      sourceObjectId: ids.object,
      targetObjectId: ids.other,
      name: "contains",
    },
    {
      id: ids.revision,
      relationshipId: ids.relationship,
      repositoryId,
      actorUserId: userId,
      expectedVersion: 0,
      at: 1,
    },
  );
  const reverse = reviseRelationship(
    null,
    {
      action: "create",
      sourceObjectId: ids.other,
      targetObjectId: ids.object,
      name: "contains",
    },
    {
      id: "00000000-0000-4000-8000-000000000010",
      relationshipId: "00000000-0000-4000-8000-000000000011",
      repositoryId,
      actorUserId: userId,
      expectedVersion: 0,
      at: 2,
    },
  );
  assert.equal(reverse.active, true);
  assert.throws(
    () =>
      reviseRelationship(
        first,
        { action: "rename", name: "contains" },
        {
          id: ids.other,
          relationshipId: ids.relationship,
          repositoryId,
          actorUserId: userId,
          expectedVersion: 1,
          at: 3,
        },
      ),
    (error) => error instanceof ObjectError && error.code === "LIFECYCLE_CONFLICT",
  );
  assert.throws(
    () =>
      reviseRelationship(
        null,
        {
          action: "create",
          sourceObjectId: ids.object,
          targetObjectId: ids.object,
          name: "contains",
        },
        {
          id: ids.other,
          relationshipId: ids.relationship,
          repositoryId,
          actorUserId: userId,
          expectedVersion: 0,
          at: 1,
        },
      ),
    ObjectError,
  );
});
