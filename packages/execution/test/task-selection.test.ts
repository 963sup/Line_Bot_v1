import assert from "node:assert/strict";
import { test } from "node:test";
import { eligibleTasks, planTasks } from "../src/application/task-selection.js";

test("execution selection preserves exact Task and Work ancestry with measured tasks only", () => {
  const nodes = [
    { id: "work", parentId: null, kind: "WORK", plannedQuantity: null },
    { id: "task", parentId: "work", kind: "TASK", plannedQuantity: { measureId: "m", value: "2" } },
    { id: "unmeasured", parentId: "work", kind: "TASK", plannedQuantity: null },
    {
      id: "outside",
      parentId: null,
      kind: "TASK",
      plannedQuantity: { measureId: "missing", value: "1" },
    },
  ];
  const document = { nodes, measures: [{ id: "m", unit: "pcs" }] };
  assert.deepEqual(eligibleTasks(document, undefined), []);
  assert.deepEqual(eligibleTasks(document, { content: { node: { id: "work", kind: "WORK" } } }), [
    { ...nodes[1], measureUnit: "pcs" },
  ]);
  assert.deepEqual(
    eligibleTasks(document, { content: { node: { id: "outside", kind: "TASK" } } }),
    [nodes[3]],
  );
  assert.deepEqual(
    planTasks(document).map((node) => node.id),
    ["task", "unmeasured", "outside"],
  );
});
