import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import type { ResourceBasis } from "@line_bot_v1/resources/domain/resource-reference";
import { createContentPlans } from "../src/application/use-cases/plans.js";
import type { ContentPlanReads, ContentPlanTransactions } from "../src/contracts/output/plans.js";
import { ContentError } from "../src/domain/error.js";
import {
  type ContentPlanRevision,
  expandContractDocument,
  reviseContentPlan,
} from "../src/domain/plan.js";

const ids = {
  request: "11111111-1111-4111-8111-111111111111",
  revision: "22222222-2222-4222-8222-222222222222",
  subject: "33333333-3333-4333-8333-333333333333",
  resource: "44444444-4444-4444-8444-444444444444",
  resourceRevision: "55555555-5555-4555-8555-555555555555",
};

function stableUuid(seed: string): string {
  const bytes = createHash("sha256").update(seed).digest("hex").slice(0, 32).split("");
  bytes[12] = "5";
  bytes[16] = ((Number.parseInt(bytes[16] ?? "0", 16) & 3) | 8).toString(16);
  const hex = bytes.join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

test("whole Contract revision gets deterministic Content identities and complete row disposition", () => {
  const context = {
    id: ids.revision,
    repositoryId: "repo",
    actorUserId: "owner",
    at: 10,
    stableId: stableUuid,
  };
  const current = reviseContentPlan(
    null,
    0,
    "initialize",
    {
      schemaVersion: 1,
      measures: [],
      nodes: [],
      resourcePins: [],
    },
    context,
  );
  const expansion = {
    documentId: "66666666-6666-4666-8666-666666666666",
    revisionId: "77777777-7777-4777-8777-777777777777",
    sourceFileId: "88888888-8888-4888-8888-888888888888",
    sourceFileRevisionId: "99999999-9999-4999-8999-999999999999",
    sourceFileSha256: "a".repeat(64),
    title: "Purchase order",
    lines: Array.from({ length: 54 }, (_, index) => {
      const sourceRowId = `row-${index + 1}`;
      if (index >= 48)
        return {
          sourceRowId,
          description: null,
          quantity: null,
          unit: null,
          category: index % 2 ? "other" : "freight",
          uncertain: false,
        };
      return {
        sourceRowId,
        description: `Line ${index + 1}`,
        quantity: "2",
        unit: "PCS",
        category: index % 2 ? "service" : "material",
        uncertain: false,
      };
    }),
  } as const;
  const first = expandContractDocument(current, 1, expansion, {
    ...context,
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  });
  const replay = expandContractDocument(current, 1, expansion, {
    ...context,
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  });
  assert.deepEqual(first.document, replay.document);
  assert.equal(first.contractDocumentImport?.rows.length, 54);
  assert.equal(
    first.contractDocumentImport?.rows.filter((row) => row.disposition === "COMMERCIAL_ONLY")
      .length,
    6,
  );
  assert.equal(first.document.nodes.filter((node) => node.kind === "WORK").length, 48);
  assert.equal(first.document.nodes.filter((node) => node.kind === "TASK").length, 48);
});

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
        contractDocuments: {
          readConfirmed: async () => {
            throw new Error("Unexpected Contract read.");
          },
        },
        nextId: () => ids.revision,
        replay: async () =>
          options?.replay ? { requestId: ids.request, revision: options.replay } : null,
        plans: {
          load: async () => null,
          hasContractDocumentImport: async () => false,
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
