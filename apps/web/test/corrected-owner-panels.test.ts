import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  assertCurrentRequest,
  eligibleParentNodes,
  StaleRequestError,
} from "../src/modules/content/content-panel";
import {
  eligibleTasks,
  isCurrentIntent,
  planTasks,
} from "../src/modules/execution/executions-panel";

test("a rejected request from a cleared session cannot restore pending or error state", async () => {
  let rejectRequest: ((reason: Error) => void) | undefined;
  const delayed = new Promise<void>((_resolve, reject) => {
    rejectRequest = reject;
  });
  let generation = 0;
  let pending: object | null = null;
  let visibleError = "";
  const operation = (async () => {
    const ticket = generation;
    try {
      await delayed;
      assertCurrentRequest(ticket, generation);
    } catch (cause) {
      try {
        assertCurrentRequest(ticket, generation);
      } catch (stale) {
        if (stale instanceof StaleRequestError) return;
        throw stale;
      }
      pending = { requestId: "old-request" };
      visibleError = cause instanceof Error ? cause.message : "unknown";
    }
  })();
  generation++;
  rejectRequest?.(new TypeError("network failed"));
  await operation;
  assert.equal(pending, null);
  assert.equal(visibleError, "");
});

test("Content exposes only the immediate legal parent kind", () => {
  const nodes = [
    {
      id: "s",
      parentId: null,
      position: 0,
      kind: "SUBJECT",
      title: "S",
      body: "",
      plannedQuantity: null,
    },
    {
      id: "o",
      parentId: "s",
      position: 0,
      kind: "OBJECT",
      title: "O",
      body: "",
      plannedQuantity: null,
    },
    {
      id: "w",
      parentId: "o",
      position: 0,
      kind: "WORK",
      title: "W",
      body: "",
      plannedQuantity: null,
    },
  ] as const;
  assert.deepEqual(eligibleParentNodes([...nodes], "SUBJECT"), []);
  assert.deepEqual(
    eligibleParentNodes([...nodes], "OBJECT").map((node) => node.id),
    ["s"],
  );
  assert.deepEqual(
    eligibleParentNodes([...nodes], "SUBOBJECT").map((node) => node.id),
    ["o"],
  );
  assert.deepEqual(
    eligibleParentNodes([...nodes], "TASK").map((node) => node.id),
    ["w"],
  );
});

test("Execution keeps plan-wide dependency tasks separate from the chosen Work", () => {
  const document = {
    measures: [{ id: "measure", unit: "pcs" as const }],
    nodes: [
      {
        id: "work-a",
        parentId: null,
        title: "A",
        kind: "WORK",
        plannedQuantity: { measureId: "measure", value: "1" },
      },
      {
        id: "task-a",
        parentId: "work-a",
        title: "A1",
        kind: "TASK",
        plannedQuantity: { measureId: "measure", value: "1" },
      },
      {
        id: "work-b",
        parentId: null,
        title: "B",
        kind: "WORK",
        plannedQuantity: { measureId: "measure", value: "1" },
      },
      {
        id: "task-b",
        parentId: "work-b",
        title: "B1",
        kind: "TASK",
        plannedQuantity: { measureId: "measure", value: "1" },
      },
    ],
  };
  const line = {
    lineId: "line",
    agreedQuantity: "1",
    content: {
      planRevisionId: "plan",
      node: {
        id: "work-a",
        kind: "WORK" as const,
        title: "A",
        body: "",
        path: [],
        plannedQuantity: null,
      },
    },
  };
  assert.deepEqual(
    eligibleTasks(document, line).map((task) => task.id),
    ["task-a"],
  );
  assert.deepEqual(
    planTasks(document).map((task) => task.id),
    ["task-a", "task-b"],
  );
});

test("only the latest selection intent may publish its result", () => {
  const oldIntent = 1;
  const newIntent = 2;
  assert.equal(isCurrentIntent(oldIntent, newIntent), false);
  assert.equal(isCurrentIntent(newIntent, newIntent), true);
});

test("corrected owner panels preserve closed history and legal review actions without legacy replacement", () => {
  const executionSource = readFileSync(
    new URL("../src/modules/execution/executions-panel.tsx", import.meta.url),
    "utf8",
  );
  const contractSource = readFileSync(
    new URL("../src/modules/contract/contracts-panel.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    executionSource,
    /\.filter\(\(item\) => item\.state === "ACTIVE" \|\| item\.state === "CLOSED"\)/,
  );
  assert.equal(executionSource.match(/contract\.state !== "ACTIVE"/g)?.length, 2);
  assert.match(executionSource, /selected\.state !== "ACCEPTED"/);
  assert.doesNotMatch(contractSource, /legacyReplacementStarted|hasLegacyLines/);
  assert.match(
    contractSource,
    /!view\?\.canManage \|\| busy \|\| pending !== null \|\| draftDirty/,
  );
});
