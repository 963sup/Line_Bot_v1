import assert from "node:assert/strict";
import test from "node:test";
import { createActions } from "../src/application/use-cases/automation.js";
import type { ActionRecord, ActionTransactions } from "../src/contracts/output/automation.js";
import type { FixedSteps } from "../src/contracts/output/fixed-steps.js";
import type { ActionRule, ActionRun } from "../src/domain/automation.js";

test("published Actions rules, runs and replay exclude internal fields and detach nested state", async () => {
  const rule = {
    id: "11111111-1111-4111-8111-111111111111",
    repositoryId: "repo",
    version: 1,
    kind: "notify-wbs-baseline" as const,
    recipients: ["recipient"],
    enabled: true,
    enabledAfter: 0,
    delegationId: "delegation",
    delegate: "owner",
    delegateVersion: 1,
    internalOnly: "private rule implementation",
  };
  const result = { findings: ["finding"] };
  const run = {
    id: "22222222-2222-4222-8222-222222222222",
    repositoryId: "repo",
    rule,
    revisionId: "revision",
    baselineId: "baseline",
    status: "failed" as const,
    version: 3,
    step: 0,
    attempt: 1,
    due: 100,
    createdAt: 1,
    results: [{ step: 0, value: result, internalOnly: "private step implementation" }],
    internalOnly: "private run implementation",
  };
  let record: ActionRecord | null = null;
  const saved: (ActionRule | ActionRun)[] = [];
  const transactions: ActionTransactions = {
    transact: async (_userId, _repositoryId, work) =>
      work({
        scope: { permissions: ["admin"], archived: false, qualificationVersion: 1 },
        id: () => "next-id",
        cursor: async () => 0,
        rules: {
          list: async () => [rule],
          load: async () => rule,
          save: async (next) => {
            saved.push(next);
          },
        },
        runs: {
          load: async () => run,
          save: async (next) => {
            saved.push(next);
          },
        },
        replay: async () => record,
        receipt: async (_request, _fingerprint, next) => {
          record = next;
        },
      }),
  };
  const steps: FixedSteps = {
    events: { cursor: async () => 0, claim: async () => null, acknowledge: async () => false },
    notifications: {
      deliver: async () => {
        throw new Error("unexpected delivery");
      },
      cancel: async () => {},
    },
    check: async () => {
      throw new Error("unexpected check");
    },
  };
  const actions = createActions({ transactions, steps, now: () => 100 });
  const rules = await actions.rules("owner", "repo");
  const published = await actions.run("owner", "repo", run.id);
  assert.ok(published);
  assert.equal("internalOnly" in published, false);
  assert.equal("internalOnly" in published.rule, false);
  assert.ok(published.results[0]);
  assert.equal("internalOnly" in published.results[0], false);
  assert.notStrictEqual(published.results[0].value, result);
  const publishedValue = published.results[0].value;
  assert.ok(publishedValue !== null && typeof publishedValue === "object");
  Reflect.set(publishedValue, "findings", ["consumer mutation"]);
  assert.deepEqual(result.findings, ["finding"]);
  assert.ok(rules[0]);
  assert.equal("internalOnly" in rules[0], false);
  Reflect.set(rules[0].recipients, "0", "consumer mutation");
  assert.deepEqual(rule.recipients, ["recipient"]);
  const command = {
    action: "retry",
    repositoryId: "repo",
    id: run.id,
    expectedVersion: 3,
    requestId: "33333333-3333-4333-8333-333333333333",
  };
  const first = await actions.execute("owner", command);
  const replay = await actions.execute("owner", command);
  assert.deepEqual(first, replay);
  assert.equal(saved.length, 1);
  assert.ok("run" in first && "run" in replay);
  assert.notStrictEqual(first.run, saved[0]);
  assert.notStrictEqual(first.run, replay.run);
  assert.equal("internalOnly" in first.run, false);
  assert.equal("internalOnly" in replay.run.rule, false);
  Reflect.set(first.run.rule.recipients, "0", "consumer mutation");
  assert.deepEqual(replay.run.rule.recipients, ["recipient"]);
  assert.deepEqual(rule.recipients, ["recipient"]);
});
