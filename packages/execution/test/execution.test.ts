import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { ContractLineBasis } from "@line_bot_v1/contract/contracts/output/references";
import { parseExecutionCommand } from "../src/application/commands/executions.js";
import { createExecutions } from "../src/application/use-cases/executions.js";
import type {
  ExecutionReads,
  ExecutionTransaction,
  ExecutionTransactions,
} from "../src/contracts/output/executions.js";
import { ExecutionError } from "../src/domain/error.js";
import { type ExecutionRevision, reviseExecution } from "../src/domain/execution.js";

const ids = {
  execution: "11111111-1111-4111-8111-111111111111",
  request: "22222222-2222-4222-8222-222222222222",
  revision: "33333333-3333-4333-8333-333333333333",
  contract: "44444444-4444-4444-8444-444444444444",
  contractRevision: "55555555-5555-4555-8555-555555555555",
  line: "66666666-6666-4666-8666-666666666666",
  resource: "77777777-7777-4777-8777-777777777777",
  resourceRevision: "88888888-8888-4888-8888-888888888888",
};

function basis(unit: "m" | "pcs" = "m"): ContractLineBasis {
  return {
    contractId: ids.contract,
    contractRevisionId: ids.contractRevision,
    lineId: ids.line,
    agreedQuantity: "1",
    resource: {
      resourceId: ids.resource,
      resourceRevisionId: ids.resourceRevision,
      resourceVersion: 1,
      name: "Concrete",
      measure: { id: "length", name: "Length", subject: "work", unit },
      sourceQuantity: "100",
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

test("Execution enforces transitions and preserves immutable submission evidence", () => {
  const source = basis();
  const submitted = reviseExecution(
    null,
    0,
    { action: "submit", quantity: "2.500", note: "  field note  " },
    context(),
    source,
  );
  assert.equal(submitted.quantity, "2.5");
  assert.equal(submitted.note, "  field note  ");
  assert.equal(submitted.state, "SUBMITTED");
  assert.notStrictEqual(submitted.basis, source);
  assert.notStrictEqual(submitted.basis.resource.measure, source.resource.measure);
  Reflect.set(source.resource.measure, "name", "mutated");
  assert.equal(submitted.basis.resource.measure.name, "Length");

  const accepted = reviseExecution(
    submitted,
    1,
    { action: "accept" },
    context(randomUUID()),
    basis(),
  );
  const voided = reviseExecution(
    accepted,
    2,
    { action: "void", reason: "duplicate" },
    context(randomUUID()),
    basis(),
  );
  assert.equal(voided.state, "VOIDED");
  assert.equal(voided.quantity, submitted.quantity);
  assert.equal(voided.note, submitted.note);
  assert.deepEqual(voided.basis, submitted.basis);
  assert.notStrictEqual(voided.basis, submitted.basis);
  assert.throws(
    () =>
      reviseExecution(
        submitted,
        1,
        { action: "void", reason: "no" },
        context(randomUUID()),
        basis(),
      ),
    (error) => error instanceof ExecutionError && error.code === "CONFLICT",
  );
  assert.throws(
    () =>
      reviseExecution(
        accepted,
        2,
        { action: "reject", reason: "no" },
        context(randomUUID()),
        basis(),
      ),
    ExecutionError,
  );
  assert.throws(
    () =>
      reviseExecution(
        null,
        0,
        { action: "submit", quantity: "1", note: "x".repeat(2001) },
        context(randomUUID()),
        basis(),
      ),
    (error) => error instanceof ExecutionError && error.code === "INVALID_INPUT",
  );
  for (const reason of ["   ", "x".repeat(2001)])
    assert.throws(
      () =>
        reviseExecution(submitted, 1, { action: "reject", reason }, context(randomUUID()), basis()),
      (error) => error instanceof ExecutionError && error.code === "INVALID_INPUT",
    );
  const rejected = reviseExecution(
    submitted,
    1,
    { action: "reject", reason: "  incomplete  " },
    context(randomUUID()),
    basis(),
  );
  assert.equal(rejected.reason, "incomplete");
});

test("Execution applies the shared unit policy without imposing agreed-quantity caps", () => {
  assert.equal(
    reviseExecution(
      null,
      0,
      { action: "submit", quantity: "1000.125", note: "" },
      context(),
      basis(),
    ).quantity,
    "1000.125",
  );
  for (const quantity of ["0", "-1", "1.5"]) {
    assert.throws(
      () =>
        reviseExecution(null, 0, { action: "submit", quantity, note: "" }, context(), basis("pcs")),
      (error) => error instanceof ExecutionError && error.code === "INVALID_INPUT",
    );
  }
});

test("Execution command parsing is strict, canonical and keeps only server-owned identity", () => {
  const submit = parseExecutionCommand({
    action: "submit",
    repositoryId: "repo",
    executionId: ids.execution.toUpperCase(),
    requestId: ids.request.toUpperCase(),
    expectedVersion: 0,
    contractId: ids.contract,
    contractRevisionId: ids.contractRevision,
    lineId: ids.line,
    quantity: "1",
    note: " note ",
  });
  assert.equal(submit.executionId, ids.execution);
  assert.equal(submit.action, "submit");
  if (submit.action !== "submit") assert.fail("expected submit command");
  assert.equal(submit.note, " note ");
  const rejected = parseExecutionCommand({
    action: "reject",
    repositoryId: "repo",
    executionId: ids.execution,
    requestId: ids.request,
    expectedVersion: 1,
    reason: "  wrong basis  ",
  });
  assert.equal(rejected.action, "reject");
  if (rejected.action !== "reject") assert.fail("expected reject command");
  assert.equal(rejected.reason, "wrong basis");
  for (const change of [
    { actorUserId: "forged" },
    { role: "admin" },
    { expectedVersion: -1 },
    { note: "x".repeat(2001) },
  ])
    assert.throws(
      () => parseExecutionCommand({ ...submit, ...change }),
      (error) => error instanceof ExecutionError && error.status === 400,
    );
});

test("Execution application authorizes before replay and verifies source under action policy", async () => {
  let replayCalls = 0;
  let sourcePolicy: boolean | undefined;
  let current: ExecutionRevision | null = null;
  const reads: ExecutionReads = {
    read: async () => {
      if (!current) throw new Error("missing");
      return current;
    },
    list: async () => ({ executions: [], next: null }),
    history: async () => ({ revisions: current ? [current] : [], next: null }),
  };
  const makeTransactions = (
    permissions: readonly string[],
    archived = false,
  ): ExecutionTransactions => ({
    transact: async (_userId, _scope, _evidence, operation) => {
      const tx: ExecutionTransaction = {
        scope: { repositoryId: "repo", permissions, archived },
        nextId: randomUUID,
        replay: async () => {
          replayCalls += 1;
          return null;
        },
        references: {
          verifyLine: async (_actor, _repository, _reference, policy) => {
            sourcePolicy = policy.requireActive;
            const value = basis();
            return policy.requireActive
              ? value
              : { ...value, resource: { ...value.resource, name: "later Resource name" } };
          },
        },
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
  const submit = {
    action: "submit",
    repositoryId: "repo",
    executionId: ids.execution,
    requestId: ids.request,
    expectedVersion: 0,
    contractId: ids.contract,
    contractRevisionId: ids.contractRevision,
    lineId: ids.line,
    quantity: "200",
    note: "done",
  } as const;
  await assert.rejects(
    createExecutions({ reads, transactions: makeTransactions(["read"]), now: () => 100 }).execute(
      "owner",
      submit,
    ),
    (error) => error instanceof ExecutionError && error.code === "FORBIDDEN",
  );
  assert.equal(replayCalls, 0);
  const writer = createExecutions({
    reads,
    transactions: makeTransactions(["write"]),
    now: () => 100,
  });
  const receipt = await writer.execute("owner", submit);
  assert.equal(sourcePolicy, true);
  assert.equal(receipt.revision.quantity, "200");
  await assert.rejects(
    writer.execute("owner", {
      action: "accept",
      repositoryId: "repo",
      executionId: ids.execution,
      requestId: randomUUID(),
      expectedVersion: 1,
    }),
    (error) => error instanceof ExecutionError && error.code === "FORBIDDEN",
  );
  const reviewer = createExecutions({
    reads,
    transactions: makeTransactions(["admin"]),
    now: () => 100,
  });
  const accepted = await reviewer.execute("owner", {
    action: "accept",
    repositoryId: "repo",
    executionId: ids.execution,
    requestId: randomUUID(),
    expectedVersion: 1,
  });
  assert.equal(sourcePolicy, false);
  assert.deepEqual(accepted.revision.basis, receipt.revision.basis);
});

test("Execution read boundaries reject malformed JSON before calling providers", async () => {
  const unexpected = async (): Promise<never> => {
    throw new Error("Provider must not be called");
  };
  const executions = createExecutions({
    reads: { read: unexpected, list: unexpected, history: unexpected },
    transactions: { transact: unexpected },
    now: () => 1,
  });
  const invalid = (error: unknown) =>
    error instanceof ExecutionError && error.code === "INVALID_INPUT";
  for (const repositoryId of [1, [], {}, null]) {
    await assert.rejects(
      Reflect.apply(executions.read, undefined, [
        "owner",
        { repositoryId, executionId: ids.execution },
      ]),
      invalid,
    );
    await assert.rejects(
      Reflect.apply(executions.list, undefined, [
        "owner",
        { repositoryId, contractId: ids.contract },
      ]),
      invalid,
    );
    await assert.rejects(
      Reflect.apply(executions.history, undefined, [
        "owner",
        { repositoryId, executionId: ids.execution },
      ]),
      invalid,
    );
  }
  await assert.rejects(
    Reflect.apply(executions.read, undefined, [
      "owner",
      { repositoryId: "repo", executionId: [ids.execution] },
    ]),
    invalid,
  );
  await assert.rejects(Reflect.apply(executions.read, undefined, ["owner", true]), invalid);
  await assert.rejects(
    Reflect.apply(executions.history, undefined, [
      "owner",
      { repositoryId: "repo", executionId: ids.execution, revisionId: ids.revision },
    ]),
    invalid,
  );
});

test("Execution DTO projection detaches all nested source values", async () => {
  const internal = reviseExecution(
    null,
    0,
    { action: "submit", quantity: "2", note: "n" },
    context(),
    basis(),
  );
  const reads: ExecutionReads = {
    read: async () => internal,
    list: async () => ({ executions: [], next: null }),
    history: async () => ({ revisions: [internal], next: null }),
  };
  const transactions: ExecutionTransactions = {
    transact: async (_userId, _scope, _evidence, operation) =>
      operation({
        scope: { repositoryId: "repo", permissions: ["admin"], archived: false },
        nextId: randomUUID,
        replay: async () => ({ requestId: ids.request, revision: internal }),
        references: { verifyLine: async () => basis() },
        executions: { load: async () => internal, save: async () => {} },
        record: async () => {},
      }),
  };
  const executions = createExecutions({ reads, transactions, now: () => 1 });
  const projected = await executions.read("owner", {
    repositoryId: "repo",
    executionId: ids.execution,
  });
  assert.equal("id" in projected, false);
  assert.equal(projected.revisionId, internal.id);
  assert.notStrictEqual(projected.basis, internal.basis);
  assert.notStrictEqual(projected.basis.resource, internal.basis.resource);
  assert.notStrictEqual(projected.basis.resource.measure, internal.basis.resource.measure);
  Reflect.set(projected.basis.resource.measure, "name", "consumer mutation");
  assert.equal(internal.basis.resource.measure.name, "Length");
});
