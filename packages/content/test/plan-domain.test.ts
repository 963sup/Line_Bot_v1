import assert from "node:assert/strict";
import test from "node:test";
import { parseContentPlanCommand } from "../src/application/commands/plans.js";
import { ContentError } from "../src/domain/error.js";
import {
  type ContentPlanDocument,
  normalizeContentPlanDocument,
  reviseContentPlan,
} from "../src/domain/plan.js";
import {
  isQuantityUnit,
  normalizeQuantity,
  normalizeQuantityUnit,
} from "../src/domain/quantity.js";

const ids = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
  "44444444-4444-4444-8444-444444444444",
  "55555555-5555-4555-8555-555555555555",
  "66666666-6666-4666-8666-666666666666",
  "77777777-7777-4777-8777-777777777777",
  "88888888-8888-4888-8888-888888888888",
  "99999999-9999-4999-8999-999999999999",
] as const;

function document(): ContentPlanDocument {
  return {
    schemaVersion: 1,
    measures: [{ id: ids[5], name: "Length", subject: "Installed length", unit: "m" }],
    nodes: [
      {
        id: ids[0],
        parentId: null,
        position: 0,
        kind: "SUBJECT",
        title: "25P1",
        body: "",
        plannedQuantity: null,
      },
      {
        id: ids[1],
        parentId: ids[0],
        position: 0,
        kind: "OBJECT",
        title: "Network",
        body: "",
        plannedQuantity: null,
      },
      {
        id: ids[2],
        parentId: ids[1],
        position: 0,
        kind: "SUBOBJECT",
        title: "Backbone",
        body: "",
        plannedQuantity: null,
      },
      {
        id: ids[3],
        parentId: ids[2],
        position: 2,
        kind: "WORK",
        title: " Main fiber construction ",
        body: "plan",
        plannedQuantity: { measureId: ids[5], value: "10.000" },
      },
      {
        id: ids[4],
        parentId: ids[3],
        position: 0,
        kind: "TASK",
        title: "Splicing",
        body: "execute",
        plannedQuantity: { measureId: ids[5], value: "2.500" },
      },
    ],
    resourcePins: [],
  };
}

test("Content document enforces the exact hierarchy and normalizes plan values", () => {
  const normalized = normalizeContentPlanDocument(document(), null);
  assert.equal(normalized.nodes[3]?.title, "Main fiber construction");
  assert.equal(normalized.nodes[3]?.position, 0);
  assert.equal(normalized.nodes[3]?.plannedQuantity?.value, "10");
  assert.equal(normalized.nodes[4]?.plannedQuantity?.value, "2.5");

  const secondSubject = {
    ...document(),
    nodes: [
      ...document().nodes,
      {
        id: ids[8],
        parentId: null,
        position: 1,
        kind: "SUBJECT" as const,
        title: "Second subject",
        body: "",
        plannedQuantity: null,
      },
    ],
  };
  assert.equal(normalizeContentPlanDocument(secondSubject, null).nodes.length, 6);

  const invalidDocuments: ContentPlanDocument[] = [
    {
      ...document(),
      nodes: document().nodes.map((node, index) =>
        index === 1 ? { ...node, parentId: null } : node,
      ),
    },
    {
      ...document(),
      nodes: document().nodes.map((node, index) =>
        index === 4 ? { ...node, parentId: ids[2] } : node,
      ),
    },
    {
      ...document(),
      nodes: document().nodes.map((node, index) =>
        index === 3 ? { ...node, kind: "TASK" } : node,
      ),
    },
  ];
  for (const invalidDocument of invalidDocuments) {
    assert.throws(
      () => normalizeContentPlanDocument(invalidDocument, null),
      (error) => error instanceof ContentError && error.code === "INVALID_INPUT",
    );
  }
});

test("Content resource pins have one canonical order independent of input order", () => {
  const value = document();
  const normalized = normalizeContentPlanDocument(
    {
      ...value,
      resourcePins: [
        {
          nodeId: ids[4],
          resourceId: ids[7],
          resourceRevisionId: ids[8],
          kind: "EQUIPMENT",
        },
        {
          nodeId: ids[3],
          resourceId: ids[6],
          resourceRevisionId: ids[7],
          kind: "LOCATION",
        },
      ],
    },
    null,
  );
  assert.deepEqual(
    normalized.resourcePins.map(({ nodeId, resourceId }) => ({ nodeId, resourceId })),
    [
      { nodeId: ids[3], resourceId: ids[6] },
      { nodeId: ids[4], resourceId: ids[7] },
    ],
  );
});

test("Content measures are immutable and planned quantity precision is exact", () => {
  const current = normalizeContentPlanDocument(document(), null);
  const corrected = document();
  const existingMeasure = corrected.measures[0];
  assert.ok(existingMeasure);
  const correctedDocument = {
    ...corrected,
    measures: [{ ...existingMeasure, name: "Changed" }],
  };
  assert.throws(
    () => normalizeContentPlanDocument(correctedDocument, current),
    (error) => error instanceof ContentError && error.code === "INVALID_INPUT",
  );
  assert.equal(normalizeQuantity("1.230", "m"), "1.23");
  assert.throws(() => normalizeQuantity("1.0001", "m"), ContentError);
  assert.throws(() => normalizeQuantity("1.0", "pcs"), ContentError);
  assert.throws(() => normalizeQuantity("0001", "m"), ContentError);
  assert.equal(normalizeQuantity("999999999999999.999", "m"), "999999999999999.999");
});

test("Content revisions require expected version and publish detached complete documents", () => {
  const first = reviseContentPlan(null, 0, "initialize", document(), {
    id: ids[6],
    repositoryId: "repo",
    actorUserId: "owner",
    at: 1,
  });
  const second = reviseContentPlan(first, 1, "replace", first.document, {
    id: ids[7],
    repositoryId: "repo",
    actorUserId: "owner",
    at: 2,
  });
  assert.equal(second.version, 2);
  assert.equal(second.parentRevisionId, first.id);
  assert.notStrictEqual(second.document.nodes, first.document.nodes);
  const changedKind = {
    ...first.document,
    nodes: first.document.nodes.map((node) =>
      node.id === ids[3] ? { ...node, kind: "TASK" as const } : node,
    ),
  };
  assert.throws(
    () =>
      reviseContentPlan(first, 1, "replace", changedKind, {
        id: ids[8],
        repositoryId: "repo",
        actorUserId: "owner",
        at: 3,
      }),
    (error) => error instanceof ContentError && error.code === "INVALID_INPUT",
  );
  assert.throws(
    () =>
      reviseContentPlan(first, 0, "replace", document(), {
        id: ids[8],
        repositoryId: "repo",
        actorUserId: "owner",
        at: 3,
      }),
    (error) => error instanceof ContentError && error.code === "VERSION_CONFLICT",
  );
});

test("user-defined Content units are bounded immutable labels, without conversions", () => {
  const original = document();
  const input = {
    ...original,
    measures: original.measures.map((measure) => ({ ...measure, unit: "  SET  " })),
  };
  const normalized = normalizeContentPlanDocument(input, null);
  assert.equal(normalized.measures[0]?.unit, "SET");
  assert.equal(normalized.nodes[4]?.plannedQuantity?.value, "2.5");
  assert.equal(normalizeQuantityUnit(" 平方公尺（m²） "), "平方公尺（m²）");
  assert.equal(isQuantityUnit("SET"), true);
  assert.equal(isQuantityUnit(" SET "), false);
  assert.equal(isQuantityUnit("SET\nBOX"), false);
  assert.equal(normalizeQuantity("1.250", "SET"), "1.25");
  assert.equal(normalizeQuantity("1.0", "m"), "1");
  assert.throws(() => normalizeQuantity("1.0", "pcs"), ContentError);
  for (const bad of ["", "  ", "a".repeat(33), "SET\nBOX", "\u202eSET"]) {
    assert.throws(
      () =>
        normalizeContentPlanDocument(
          { ...original, measures: original.measures.map((m) => ({ ...m, unit: bad })) },
          null,
        ),
      (error) => error instanceof ContentError && error.code === "INVALID_INPUT",
    );
  }
  assert.throws(
    () =>
      normalizeContentPlanDocument(
        { ...original, measures: original.measures.map((m) => ({ ...m, unit: "盒" })) },
        normalized,
      ),
    (error) => error instanceof ContentError && error.code === "INVALID_INPUT",
  );
});

test("Content command normalizes units before exact replay fingerprints", () => {
  const parsed = parseContentPlanCommand({
    action: "initialize",
    repositoryId: "repo",
    requestId: ids[6],
    expectedVersion: 0,
    document: {
      ...document(),
      measures: document().measures.map((measure) => ({ ...measure, unit: "  組  " })),
    },
  });
  assert.equal(parsed.document.measures[0]?.unit, "組");
  assert.throws(
    () =>
      parseContentPlanCommand({
        ...parsed,
        document: {
          ...parsed.document,
          measures: parsed.document.measures.map((measure) => ({
            ...measure,
            unit: "invalid\tunit",
          })),
        },
      }),
    (error) => error instanceof ContentError && error.code === "INVALID_INPUT",
  );
});
