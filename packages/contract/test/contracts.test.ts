import assert from "node:assert/strict";
import test from "node:test";
import type { ContentPlanItemBasis } from "@line_bot_v1/content/domain/plan-reference";
import type { ResourceQuantityBasis } from "@line_bot_v1/resources/domain/engineering-reference";
import { parseContractCommand } from "../src/application/commands.js";
import { createContracts } from "../src/application/use-cases/contracts.js";
import type { ContractReads, ContractTransactions } from "../src/contracts/output/contracts.js";
import type { ContractRevision } from "../src/domain/contract.js";
import { ContractError } from "../src/domain/error.js";

const ids = {
  contract: "11111111-1111-4111-8111-111111111111",
  request: "22222222-2222-4222-8222-222222222222",
  revision: "33333333-3333-4333-8333-333333333333",
  line: "44444444-4444-4444-8444-444444444444",
  planRevision: "55555555-5555-4555-8555-555555555555",
  node: "66666666-6666-4666-8666-666666666666",
  measure: "77777777-7777-4777-8777-777777777777",
};

const basis: ContentPlanItemBasis = {
  repositoryId: "repo",
  planRevisionId: ids.planRevision,
  planVersion: 1,
  node: {
    id: ids.node,
    kind: "TASK",
    title: "Install cable",
    body: "Task basis",
    path: [{ id: "88888888-8888-4888-8888-888888888888", kind: "WORK", title: "Cable" }],
    plannedQuantity: {
      value: "10",
      measure: { id: ids.measure, name: "Length", subject: "Installed length", unit: "m" },
    },
  },
};

const command = {
  action: "create",
  repositoryId: "repo",
  contractId: ids.contract,
  requestId: ids.request,
  expectedVersion: 0,
  title: "Agreement",
  body: "terms",
  lines: [
    {
      lineId: ids.line,
      planRevisionId: ids.planRevision,
      nodeId: ids.node,
      agreedQuantity: "5.000",
    },
  ],
} as const;

const historicalCommand = {
  ...command,
  lines: [
    {
      lineId: ids.line,
      resourceId: "99999999-9999-4999-8999-999999999999",
      resourceRevisionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      agreedQuantity: "5",
    },
  ],
} as const;

test("strict commands canonicalize IDs and reject unknown nested fields", () => {
  assert.equal(
    parseContractCommand({ ...command, contractId: ids.contract.toUpperCase() }).contractId,
    ids.contract,
  );
  assert.throws(
    () =>
      parseContractCommand({
        ...command,
        lines: [{ ...command.lines[0], extra: true }],
      }),
    (error) => error instanceof ContractError && error.code === "INVALID_INPUT",
  );
  const parsedHistorical = parseContractCommand(historicalCommand);
  assert.ok(parsedHistorical.action === "create" || parsedHistorical.action === "edit");
  assert.equal(parsedHistorical.lines.length, 1);
  assert.throws(
    () => parseContractCommand({ ...command, actorUserId: "attacker" }),
    (error) => error instanceof ContractError && error.code === "INVALID_INPUT",
  );
});

function harness(options?: {
  permissions?: readonly string[];
  archived?: boolean;
  replay?: ContractRevision | null;
}) {
  const saved: ContractRevision[] = [];
  let contentCalls = 0;
  let replayCalls = 0;
  const reads: ContractReads = {
    list: async () => ({ contracts: [], next: null }),
    read: async () => {
      if (!saved[0]) throw new Error("missing");
      return saved[0];
    },
    history: async () => ({ revisions: saved, next: null }),
  };
  const transactions: ContractTransactions = {
    transact: async (_userId, _scope, _evidence, operation) =>
      operation({
        scope: {
          repositoryId: "repo",
          permissions: options?.permissions ?? ["write"],
          archived: options?.archived ?? false,
        },
        content: {
          verifyRevision: async () => {},
          verifyPinned: async () => {
            contentCalls += 1;
            return [basis];
          },
        },
        nextId: () => ids.revision,
        replay: async () => {
          replayCalls += 1;
          return options?.replay ? { requestId: ids.request, revision: options.replay } : null;
        },
        contracts: {
          load: async () => null,
          save: async (revision) => {
            saved.push(revision);
          },
        },
        record: async () => {},
      }),
  };
  return {
    app: createContracts({ reads, transactions, now: () => 100 }),
    saved,
    counters: () => ({ contentCalls, replayCalls }),
  };
}

test("application authorizes before replay and rejects archived writes after replay", async () => {
  const denied = harness({ permissions: [] });
  await assert.rejects(
    denied.app.execute("owner", command),
    (error) => error instanceof ContractError && error.code === "FORBIDDEN",
  );
  assert.deepEqual(denied.counters(), { contentCalls: 0, replayCalls: 0 });

  const archived = harness({ archived: true });
  await assert.rejects(
    archived.app.execute("owner", command),
    (error) => error instanceof ContractError && error.code === "LIFECYCLE_CONFLICT",
  );
  assert.deepEqual(archived.counters(), { contentCalls: 0, replayCalls: 1 });
});

test("create qualifies exact pins, normalizes values and publishes detached DTOs", async () => {
  const { app, saved, counters } = harness();
  const receipt = await app.execute("owner", command);
  assert.equal(receipt.revision.lines[0]?.agreedQuantity, "5");
  assert.equal(saved[0]?.lines[0]?.agreedQuantity, "5");
  assert.deepEqual(counters(), { contentCalls: 1, replayCalls: 1 });
  assert.notStrictEqual(receipt.revision.lines, saved[0]?.lines);
  const published = receipt.revision.lines[0];
  const internal = saved[0]?.lines[0];
  assert.ok(published && "content" in published);
  assert.ok(internal && "content" in internal);
  assert.notStrictEqual(published.content, internal.content);
  Reflect.set(published.content.node.plannedQuantity?.measure ?? {}, "name", "consumer mutation");
  assert.equal(internal.content.node.plannedQuantity?.measure.name, "Length");
});

test("authorized exact replay bypasses archive and source requalification", async () => {
  const seed = harness();
  await seed.app.execute("owner", command);
  const internal = seed.saved[0];
  assert.ok(internal);
  const replay = harness({ archived: true, replay: internal });
  assert.deepEqual(await replay.app.execute("owner", command), {
    requestId: ids.request,
    revision: {
      revisionId: internal.id,
      contractId: internal.contractId,
      repositoryId: internal.repositoryId,
      version: internal.version,
      parentRevisionId: internal.parentRevisionId,
      actorUserId: internal.actorUserId,
      at: internal.at,
      action: internal.action,
      state: internal.state,
      title: internal.title,
      body: internal.body,
      lines: internal.lines,
    },
  });
  assert.deepEqual(replay.counters(), { contentCalls: 0, replayCalls: 1 });
});

test("historical Resource command without a receipt cannot create a new revision", async () => {
  const state = harness();
  await assert.rejects(
    state.app.execute("owner", historicalCommand),
    (error) => error instanceof ContractError && error.code === "LIFECYCLE_CONFLICT",
  );
  assert.equal(state.saved.length, 0);
  assert.deepEqual(state.counters(), { contentCalls: 0, replayCalls: 1 });
});

test("historical Resource receipt replays without invoking the new Content provider", async () => {
  const resource: ResourceQuantityBasis = {
    resourceId: historicalCommand.lines[0].resourceId,
    resourceRevisionId: historicalCommand.lines[0].resourceRevisionId,
    resourceVersion: 1,
    name: "Historical cable",
    measure: { id: ids.measure, name: "Length", subject: "Installed length", unit: "m" },
    sourceQuantity: "10",
  };
  const historical: ContractRevision = {
    id: ids.revision,
    contractId: ids.contract,
    repositoryId: "repo",
    version: 2,
    parentRevisionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    actorUserId: "owner",
    at: 90,
    action: "activate",
    state: "ACTIVE",
    title: "Historical",
    body: "",
    lines: [{ lineId: ids.line, resource, agreedQuantity: "5" }],
  };
  const replay = harness({ archived: true, replay: historical });
  const result = await replay.app.execute("owner", historicalCommand);
  const line = result.revision.lines[0];
  assert.ok(line && "resource" in line);
  assert.equal(line.resource.resourceRevisionId, resource.resourceRevisionId);
  assert.deepEqual(replay.counters(), { contentCalls: 0, replayCalls: 1 });
});
