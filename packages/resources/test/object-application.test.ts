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
  async listTree() {
    return {
      parent: null,
      nodes: { items: [], next: null },
      observed: { objects: [], relationships: [] },
    };
  },
  async engineeringGraph() {
    return { objects: [], edges: [], measures: [] };
  },
  async listMeasures() {
    return { items: [], next: null };
  },
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
        engineeringGraph: async () => ({ objects: [], edges: [], measures: [] }),
        saveMeasure: async () => {},
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

test("engineering measure creation rechecks ADMIN before replay and preserves archive replay order", async () => {
  const command = {
    action: "create-measure",
    repositoryId: "repo",
    requestId: ids.request,
    expectedVersion: 0,
    measureId: ids.type,
    name: "光纖",
    subject: "路徑長度",
    unit: "m",
  };
  const replay: ObjectCommandReceipt = {
    requestId: ids.request,
    kind: "engineering",
    result: {
      repositoryId: "repo",
      objects: [],
      relationships: [],
      measure: {
        id: ids.type,
        repositoryId: "repo",
        name: "光纖",
        subject: "路徑長度",
        unit: "m",
        createdAt: 1,
      },
    },
  };
  const unauthorized = createObjects({
    reads,
    transactions: transactions({ permissions: ["write"], replay }),
    now: () => 2,
  });
  await assert.rejects(
    unauthorized.executeEngineering("user", command),
    (error) => error instanceof ObjectError && error.code === "FORBIDDEN",
  );
  const archived = createObjects({
    reads,
    transactions: transactions({ permissions: ["admin"], archived: true, replay }),
    now: () => 2,
  });
  assert.deepEqual(await archived.executeEngineering("user", command), replay);
  const fresh = createObjects({
    reads,
    transactions: transactions({ permissions: ["admin"], archived: true }),
    now: () => 2,
  });
  await assert.rejects(
    fresh.executeEngineering("user", command),
    (error) => error instanceof ObjectError && error.code === "LIFECYCLE_CONFLICT",
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

test("a persisted receipt from another command family fails closed", async () => {
  const app = createObjects({
    reads,
    transactions: transactions({
      permissions: ["admin"],
      replay: { requestId: ids.request, kind: "type", result: type(true) },
    }),
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
      name: "A",
      content: "",
    }),
    (error) => error instanceof ObjectError && error.code === "UNAVAILABLE",
  );
});

test("a small engineering root publishes a bounded snapshot in a large Repository", async () => {
  const root = {
    objectId: ids.object,
    revisionId: ids.revision,
    version: 1,
    name: "root",
    typeId: ids.type,
    typeName: "Document",
    archived: false,
    quantity: null,
  };
  const graph = {
    objects: [
      root,
      ...Array.from({ length: 10001 }, (_, index) => ({
        ...root,
        objectId: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      })),
    ],
    edges: [],
    measures: [],
  };
  const app = createObjects({
    reads: { ...reads, engineeringGraph: async () => graph },
    transactions: transactions({ permissions: ["admin"] }),
    now: () => 2,
  });
  const result = await app.structure("user", { repositoryId: "repo", rootId: root.objectId });
  assert.deepEqual(result.observed, {
    objects: [{ objectId: root.objectId, version: 1 }],
    relationships: [],
  });
  assert.ok(JSON.stringify(result.observed).length < 1000);
  const supported = {
    ...graph,
    edges: graph.objects
      .filter((object) => object.objectId !== root.objectId)
      .map((object) => ({
        relationshipId: object.objectId,
        version: 1,
        sourceObjectId: root.objectId,
        targetObjectId: object.objectId,
        kind: "INCLUDES" as const,
      })),
  };
  const supportedApp = createObjects({
    reads: { ...reads, engineeringGraph: async () => supported },
    transactions: transactions({ permissions: ["admin"] }),
    now: () => 2,
  });
  const firstPage = await supportedApp.structure("user", {
    repositoryId: "repo",
    rootId: root.objectId,
  });
  assert.equal(firstPage.nodes.items.length, 50);
  assert.equal(firstPage.observed.relationships.length, 50);
  assert.equal(firstPage.observed.objects.length, 51);
  assert.ok(JSON.stringify(firstPage.observed).length < 524288);
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
