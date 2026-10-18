import assert from "node:assert/strict";
import test from "node:test";
import { createObjects } from "../src/application/use-cases/objects.js";
import type { ObjectCommandReceipt, ObjectTypeDto } from "../src/contracts/dto/objects.js";
import type {
  ObjectReads,
  ObjectTransaction,
  ObjectTransactions,
} from "../src/contracts/output/objects.js";
import { ObjectError } from "../src/domain/error.js";
import type { ObjectRevision } from "../src/domain/object.js";

const ids = {
  request: "00000000-0000-4000-8000-000000000001",
  type: "00000000-0000-4000-8000-000000000002",
  object: "00000000-0000-4000-8000-000000000003",
  revision: "00000000-0000-4000-8000-000000000004",
};

const reads: ObjectReads = {
  async listTypes() {
    return { items: [], next: null };
  },
  async listObjects() {
    return { items: [], next: null };
  },
  async readObject() {
    throw new ObjectError(404, "missing", "NOT_FOUND");
  },
  async history() {
    return { items: [], next: null };
  },
  async listRelationships() {
    return { items: [], next: null };
  },
  async relationshipHistory() {
    return { items: [], next: null };
  },
  async compareObjectRevisions() {
    return [];
  },
};

function type(enabled: boolean): ObjectTypeDto {
  return {
    id: ids.type,
    repositoryId: "repo",
    name: "Document",
    description: "",
    enabled,
    version: 1,
    createdAt: 1,
    updatedAt: 1,
  };
}

function transactions(options: {
  permissions: readonly string[];
  archived?: boolean;
  replay?: ObjectCommandReceipt | null;
  objectType?: ObjectTypeDto | null;
  currentObject?: ObjectRevision | null;
  savedObjects?: ObjectRevision[];
}): ObjectTransactions {
  return {
    async transact(_userId, _evidence, operation) {
      const tx: ObjectTransaction = {
        scope: {
          repositoryId: "repo",
          permissions: options.permissions,
          archived: options.archived ?? false,
        },
        nextId: () => ids.revision,
        replay: async () => options.replay ?? null,
        loadType: async () => options.objectType ?? null,
        saveType: async () => {},
        loadObject: async () => options.currentObject ?? null,
        loadObjectRevision: async () => null,
        saveObject: async (value) => {
          options.savedObjects?.push(value);
        },
        lockObjects: async () => [],
        loadRelationship: async () => null,
        saveRelationship: async () => {},
        record: async () => {},
      };
      return operation(tx);
    },
  };
}

test("current Type authorization is checked before exact replay", async () => {
  const replay: ObjectCommandReceipt = { requestId: ids.request, kind: "type", result: type(true) };
  const app = createObjects({
    reads,
    transactions: transactions({ permissions: ["write"], replay }),
    now: () => 2,
  });
  await assert.rejects(
    app.executeType("user", {
      action: "create",
      repositoryId: "repo",
      requestId: ids.request,
      expectedVersion: 0,
      typeId: ids.type,
      name: "Document",
      description: "",
    }),
    (error) => error instanceof ObjectError && error.code === "FORBIDDEN",
  );
});

test("authorized exact replay is readable after Repository archive", async () => {
  const replay: ObjectCommandReceipt = { requestId: ids.request, kind: "type", result: type(true) };
  const app = createObjects({
    reads,
    transactions: transactions({ permissions: ["admin"], archived: true, replay }),
    now: () => 2,
  });
  assert.deepEqual(
    await app.executeType("user", {
      action: "create",
      repositoryId: "repo",
      requestId: ids.request,
      expectedVersion: 0,
      typeId: ids.type,
      name: "Document",
      description: "",
    }),
    replay,
  );
});

test("disabled Type cannot receive a new Object", async () => {
  const app = createObjects({
    reads,
    transactions: transactions({ permissions: ["write"], objectType: type(false) }),
    now: () => 2,
  });
  await assert.rejects(
    app.executeObject("user", {
      action: "create",
      repositoryId: "repo",
      requestId: ids.request,
      expectedVersion: 0,
      objectId: ids.object,
      typeId: ids.type,
      name: "Spec",
      content: "",
    }),
    (error) => error instanceof ObjectError && error.code === "LIFECYCLE_CONFLICT",
  );
});

test("every new Object revision snapshots the current Type label even when Type is disabled", async () => {
  const savedObjects: ObjectRevision[] = [];
  const currentObject: ObjectRevision = {
    id: ids.revision,
    objectId: ids.object,
    repositoryId: "repo",
    version: 1,
    parentRevisionId: null,
    actorUserId: "user",
    at: 1,
    action: "create",
    typeId: ids.type,
    typeName: "Old label",
    name: "Spec",
    content: "v1",
    archived: false,
  };
  const renamedDisabledType = { ...type(false), name: "Current label", version: 3 };
  const app = createObjects({
    reads,
    transactions: transactions({
      permissions: ["write"],
      objectType: renamedDisabledType,
      currentObject,
      savedObjects,
    }),
    now: () => 2,
  });
  const result = await app.executeObject("user", {
    action: "edit",
    repositoryId: "repo",
    requestId: ids.request,
    expectedVersion: 1,
    objectId: ids.object,
    name: "Spec",
    content: "v2",
  });
  if (!("typeName" in result.result)) throw new Error("Object revision result expected");
  assert.equal(result.result.typeName, "Current label");
  assert.equal(savedObjects[0]?.typeName, "Current label");
});
