import assert from "node:assert/strict";
import test from "node:test";
import type { ResourceBasis } from "@line_bot_v1/resources/domain/resource-reference";
import { createContentPlans } from "../src/application/use-cases/plans.js";
import type { ContentPlanReads, ContentPlanTransactions } from "../src/contracts/output/plans.js";
import { ContentError } from "../src/domain/error.js";
import type { ContentPlanRevision } from "../src/domain/plan.js";

const ids = {
  request: "11111111-1111-4111-8111-111111111111",
  revision: "22222222-2222-4222-8222-222222222222",
  subject: "33333333-3333-4333-8333-333333333333",
  resource: "44444444-4444-4444-8444-444444444444",
  resourceRevision: "55555555-5555-4555-8555-555555555555",
};

const command = {
  action: "initialize",
  repositoryId: "repo",
  requestId: ids.request,
  expectedVersion: 0,
  document: {
    schemaVersion: 1,
    measures: [],
    nodes: [
      {
        id: ids.subject,
        parentId: null,
        position: 0,
        kind: "SUBJECT",
        title: " 25P1 ",
        body: "",
        plannedQuantity: null,
      },
    ],
    resourcePins: [
      {
        nodeId: ids.subject,
        resourceId: ids.resource,
        resourceRevisionId: ids.resourceRevision,
        kind: "LOCATION",
      },
    ],
  },
} as const;

function harness(options?: {
  permissions?: readonly string[];
  archived?: boolean;
  replay?: ContentPlanRevision;
}) {
  const saved: ContentPlanRevision[] = [];
  let resourceCalls = 0;
  const basis: ResourceBasis = {
    resourceId: ids.resource,
    resourceRevisionId: ids.resourceRevision,
    resourceVersion: 1,
    kind: "LOCATION",
    name: "Site",
  };
  const savedRevision = () => {
    const revision = saved[0];
    if (!revision) throw new Error("Expected a saved Content revision.");
    return revision;
  };
  const reads: ContentPlanReads = {
    read: async () => savedRevision(),
    history: async () => ({ revisions: saved, next: null }),
  };
  const transactions: ContentPlanTransactions = {
    transact: async (_userId, _scope, _evidence, operation) =>
      operation({
        scope: {
          repositoryId: "repo",
          permissions: options?.permissions ?? ["write"],
          archived: options?.archived ?? false,
        },
        resources: {
          verifyPinned: async () => {
            resourceCalls += 1;
            return [basis];
          },
        },
        savedFileResults: {
          verifySaved: async () => ({
            repositoryId: "repo",
            fileId: ids.subject,
            fileRevisionId: ids.revision,
            fileSha256: "0".repeat(64),
            runId: ids.request,
            processingRevisionId: ids.revision,
            observationId: "o1",
            uncertain: false,
          }),
        },
        nextId: () => ids.revision,
        replay: async () =>
          options?.replay ? { requestId: ids.request, revision: options.replay } : null,
        plans: {
          load: async () => null,
          save: async (revision) => {
            saved.push(revision);
          },
        },
        record: async () => {},
      }),
  };
  return {
    app: createContentPlans({ reads, transactions, now: () => 10 }),
    saved,
    resourceCalls: () => resourceCalls,
  };
}

test("Content application authorizes before replay and archive before new write", async () => {
  const denied = harness({ permissions: [] });
  await assert.rejects(
    denied.app.execute("owner", command),
    (error) => error instanceof ContentError && error.code === "FORBIDDEN",
  );
  assert.equal(denied.resourceCalls(), 0);
  const archived = harness({ archived: true });
  await assert.rejects(
    archived.app.execute("owner", command),
    (error) => error instanceof ContentError && error.code === "LIFECYCLE_CONFLICT",
  );
  assert.equal(archived.resourceCalls(), 0);
});

test("Content application qualifies new pins and returns detached DTO", async () => {
  const state = harness();
  const receipt = await state.app.execute("owner", command);
  assert.equal(receipt.revision.document.nodes[0]?.title, "25P1");
  assert.equal(state.resourceCalls(), 1);
  assert.notStrictEqual(receipt.revision.document, state.saved[0]?.document);
  Reflect.set(receipt.revision.document.nodes[0] ?? {}, "title", "changed");
  assert.equal(state.saved[0]?.document.nodes[0]?.title, "25P1");
});

test("Authorized exact replay bypasses archive and Resource requalification", async () => {
  const seed = harness();
  await seed.app.execute("owner", command);
  const internal = seed.saved[0];
  assert.ok(internal);
  const replay = harness({ archived: true, replay: internal });
  assert.equal((await replay.app.execute("owner", command)).revision.revisionId, ids.revision);
  assert.equal(replay.resourceCalls(), 0);
});
