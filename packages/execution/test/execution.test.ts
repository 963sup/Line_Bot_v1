import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { parseExecutionCommand } from "../src/application/commands/executions.js";
import { createExecutions } from "../src/application/use-cases/executions.js";
import type {
  ExecutionReads,
  ExecutionTransaction,
  ExecutionTransactions,
} from "../src/contracts/output/executions.js";
import { ExecutionError } from "../src/domain/error.js";
import {
  type ContentContractLineBasis,
  type ExecutionRevision,
  reviseExecution,
} from "../src/domain/execution.js";
import { reviseTaskDependencies } from "../src/domain/task-dependencies.js";

const ids = {
  execution: "11111111-1111-4111-8111-111111111111",
  request: "22222222-2222-4222-8222-222222222222",
  revision: "33333333-3333-4333-8333-333333333333",
  contract: "44444444-4444-4444-8444-444444444444",
  contractRevision: "55555555-5555-4555-8555-555555555555",
  line: "66666666-6666-4666-8666-666666666666",
  planRevision: "77777777-7777-4777-8777-777777777777",
  work: "88888888-8888-4888-8888-888888888888",
  task: "99999999-9999-4999-8999-999999999999",
  prerequisite: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  resource: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  resourceRevision: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
};

function item(nodeId = ids.task, kind: "WORK" | "TASK" = "TASK") {
  return {
    repositoryId: "repo",
    planRevisionId: ids.planRevision,
    planVersion: 1,
    node: {
      id: nodeId,
      kind,
      title: kind === "TASK" ? "Install" : "Works",
      body: "",
      path:
        kind === "TASK"
          ? [
              { id: ids.work, kind: "WORK" as const, title: "Works" },
              { id: nodeId, kind: "TASK" as const, title: "Install" },
            ]
          : [{ id: nodeId, kind: "WORK" as const, title: "Works" }],
      plannedQuantity: {
        value: "10",
        measure: { id: "length", name: "Length", subject: "installed", unit: "m" as const },
      },
    },
  };
}

function basis(nodeId = ids.work, kind: "WORK" | "TASK" = "WORK"): ContentContractLineBasis {
  return {
    contractId: ids.contract,
    contractRevisionId: ids.contractRevision,
    lineId: ids.line,
    agreedQuantity: "1",
    content: item(nodeId, kind),
  };
}

function source() {
  return {
    basis: basis(),
    task: item(),
    resources: [
      {
        resourceId: ids.resource,
        resourceRevisionId: ids.resourceRevision,
        resourceVersion: 1,
        kind: "EQUIPMENT" as const,
        name: "Lift",
      },
    ],
    dependency: {
      version: 2,
      revisionId: randomUUID(),
      prerequisiteTaskIds: [ids.prerequisite],
    },
  };
}

function context(id = ids.revision) {
  return {
    id,
    executionId: ids.execution,
    repositoryId: "repo",
    actorUserId: "owner",
    at: 100,
  };
}

test("Execution freezes Task, resources and DAG evidence across review transitions", () => {
  const evidence = source();
  const submitted = reviseExecution(
    null,
    0,
    { action: "submit", quantity: "2.500", note: " field note " },
    context(),
    evidence,
  );
  assert.equal(submitted.quantity, "2.5");
  assert.ok("task" in submitted);
  assert.deepEqual(submitted.dependency.prerequisiteTaskIds, [ids.prerequisite]);
  Reflect.set(evidence.task.node, "title", "mutated");
  assert.equal(submitted.task.node.title, "Install");

  const accepted = reviseExecution(submitted, 1, { action: "accept" }, context(randomUUID()), null);
  const voided = reviseExecution(
    accepted,
    2,
    { action: "void", reason: " duplicate " },
    context(randomUUID()),
    null,
  );
  assert.equal(voided.state, "VOIDED");
  assert.equal(voided.reason, "duplicate");
  assert.ok("task" in voided);
  assert.deepEqual(voided.task, submitted.task);
  assert.deepEqual(voided.resources, submitted.resources);
  assert.deepEqual(voided.dependency, submitted.dependency);
  assert.notStrictEqual(voided.task, submitted.task);
});

test("Execution domain rejects invalid Task membership, notes, reasons and quantity", () => {
  const invalidSources = [
    { ...source(), task: item(ids.work, "WORK") },
    {
      ...source(),
      task: { ...item(), planRevisionId: randomUUID() },
    },
    {
      ...source(),
      basis: basis(randomUUID(), "WORK"),
    },
    {
      ...source(),
      dependency: { version: 0, revisionId: ids.revision, prerequisiteTaskIds: [] },
    },
  ];
  for (const invalid of invalidSources)
    assert.throws(
      () =>
        reviseExecution(null, 0, { action: "submit", quantity: "1", note: "" }, context(), invalid),
      (error) => error instanceof ExecutionError && error.code === "CONFLICT",
    );
  for (const quantity of ["0", "-1", "1.0000"])
    assert.throws(
      () => reviseExecution(null, 0, { action: "submit", quantity, note: "" }, context(), source()),
      (error) => error instanceof ExecutionError && error.code === "INVALID_INPUT",
    );
  assert.throws(
    () =>
      reviseExecution(
        null,
        0,
        { action: "submit", quantity: "1", note: "x".repeat(2001) },
        context(),
        source(),
      ),
    ExecutionError,
  );
  const submitted = reviseExecution(
    null,
    0,
    { action: "submit", quantity: "1", note: "" },
    context(),
    source(),
  );
  for (const reason of [" ", "x".repeat(2001)])
    assert.throws(
      () =>
        reviseExecution(submitted, 1, { action: "reject", reason }, context(randomUUID()), null),
      ExecutionError,
    );
});

test("Execution command parsing strictly canonicalizes Task and resource pins", () => {
  const parsed = parseExecutionCommand({
    action: "submit",
    repositoryId: "repo",
    executionId: ids.execution.toUpperCase(),
    requestId: ids.request,
    expectedVersion: 0,
    contractId: ids.contract,
    contractRevisionId: ids.contractRevision,
    lineId: ids.line,
    task: { planRevisionId: ids.planRevision, nodeId: ids.task },
    resources: [{ resourceId: ids.resource, resourceRevisionId: ids.resourceRevision }],
    observedDependencyVersion: 0,
    quantity: "1",
    note: "",
  });
  assert.equal(parsed.executionId, ids.execution);
  assert.equal(parsed.action, "submit");
  if (parsed.action !== "submit") assert.fail("expected submit");
  if (!("task" in parsed)) assert.fail("expected Task submission");
  assert.deepEqual(parsed.task, { planRevisionId: ids.planRevision, nodeId: ids.task });
  for (const change of [
    { actorUserId: "forged" },
    { observedDependencyVersion: -1 },
    {
      resources: [
        { resourceId: ids.resource, resourceRevisionId: ids.resourceRevision, extra: true },
      ],
    },
    { task: { planRevisionId: ids.planRevision, nodeId: ids.task, kind: "TASK" } },
  ])
    assert.throws(() => parseExecutionCommand({ ...parsed, ...change }), ExecutionError);
});

test("Task dependency domain rejects duplicate, self, cross-plan and cyclic graphs", () => {
  const prerequisite = item(ids.prerequisite);
  const context = {
    id: randomUUID(),
    repositoryId: "repo",
    planRevisionId: ids.planRevision,
    actorUserId: "owner",
    at: 1,
  };
  const edge = { taskId: ids.task, prerequisiteTaskId: ids.prerequisite };
  const first = reviseTaskDependencies(null, 0, [edge], [item(), prerequisite], context);
  assert.equal(first.version, 1);
  for (const edges of [
    [edge, edge],
    [{ taskId: ids.task, prerequisiteTaskId: ids.task }],
    [edge, { taskId: ids.prerequisite, prerequisiteTaskId: ids.task }],
  ])
    assert.throws(
      () => reviseTaskDependencies(null, 0, edges, [item(), prerequisite], context),
      ExecutionError,
    );
  assert.throws(
    () =>
      reviseTaskDependencies(
        null,
        0,
        [edge],
        [item(), { ...prerequisite, planRevisionId: randomUUID() }],
        context,
      ),
    ExecutionError,
  );
  assert.throws(
    () => reviseTaskDependencies(first, 0, [], [], { ...context, id: randomUUID() }),
    (error) => error instanceof ExecutionError && error.code === "CONFLICT",
  );
});

test("Execution application authorizes before replay and freezes current DAG without completion inference", async () => {
  let current: ExecutionRevision | null = null;
  let replayCalls = 0;
  const reads: ExecutionReads = {
    read: async () => {
      if (!current) throw new Error("missing");
      return current;
    },
    list: async () => ({ executions: [], next: null }),
    history: async () => ({ revisions: current ? [current] : [], next: null }),
  };
  const transactions = (permissions: readonly string[]): ExecutionTransactions => ({
    transact: async (_userId, _scope, _evidence, operation) => {
      const tx: ExecutionTransaction = {
        scope: { repositoryId: "repo", permissions, archived: false },
        nextId: randomUUID,
        replay: async () => {
          replayCalls += 1;
          return null;
        },
        contracts: { verifyLine: async () => basis() },
        content: {
          verifyRevision: async () => {},
          verifyPinned: async () => [item()],
        },
        resources: { verifyPinned: async () => source().resources },
        readDependencies: async () => ({
          repositoryId: "repo",
          planRevisionId: ids.planRevision,
          version: 2,
          revisionId: ids.revision,
          edges: [{ taskId: ids.task, prerequisiteTaskId: ids.prerequisite }],
        }),
        executions: {
          load: async () => current,
          save: async (next) => {
            current = next;
          },
        },
        record: async () => {},
      };
      return operation(tx);
    },
  });
  const command = {
    action: "submit",
    repositoryId: "repo",
    executionId: ids.execution,
    requestId: ids.request,
    expectedVersion: 0,
    contractId: ids.contract,
    contractRevisionId: ids.contractRevision,
    lineId: ids.line,
    task: { planRevisionId: ids.planRevision, nodeId: ids.task },
    resources: [{ resourceId: ids.resource, resourceRevisionId: ids.resourceRevision }],
    observedDependencyVersion: 2,
    quantity: "3",
    note: "done",
  } as const;
  await assert.rejects(
    createExecutions({ reads, transactions: transactions(["read"]), now: () => 1 }).execute(
      "owner",
      command,
    ),
    (error) => error instanceof ExecutionError && error.code === "FORBIDDEN",
  );
  assert.equal(replayCalls, 0);
  const receipt = await createExecutions({
    reads,
    transactions: transactions(["write"]),
    now: () => 1,
  }).execute("owner", command);
  assert.ok("task" in receipt.revision);
  if (!("task" in receipt.revision)) assert.fail("expected Task execution");
  assert.deepEqual(receipt.revision.dependency.prerequisiteTaskIds, [ids.prerequisite]);
  await assert.rejects(
    createExecutions({
      reads: { ...reads },
      transactions: transactions(["write"]),
      now: () => 1,
    }).execute("owner", {
      ...command,
      executionId: randomUUID(),
      requestId: randomUUID(),
      observedDependencyVersion: 1,
    }),
    (error) => error instanceof ExecutionError && error.code === "CONFLICT",
  );
});
