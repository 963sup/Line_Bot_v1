import assert from "node:assert/strict";
import test from "node:test";
import {
  type ActionRule,
  ActionsError,
  cancelActionRun,
  finishActionStep,
  retryActionRun,
  startBaselineActionRun,
  startManualActionRun,
} from "../src/domain/automation.js";

const rule: ActionRule = {
  id: "rule",
  repositoryId: "repo",
  version: 4,
  kind: "notify-wbs-baseline",
  recipients: ["a", "b"],
  enabled: true,
  enabledAfter: 10,
  delegationId: "generation",
  delegate: "delegate",
  delegateVersion: 2,
};
const source = { repositoryId: "repo", revisionId: "revision", baselineId: "baseline", cursor: 11 };

test("Domain admits only new enabled Baseline events and binds manual delegation without changing the rule", () => {
  assert.equal(startBaselineActionRun(rule, { ...source, cursor: 10 }, "run", 100), null);
  assert.equal(startBaselineActionRun({ ...rule, enabled: false }, source, "run", 100), null);
  const manualRule: ActionRule = { ...rule, kind: "check-wbs-revision", recipients: [] };
  assert.equal(startBaselineActionRun(manualRule, source, "run", 100), null);
  const input = {
    id: "run",
    repositoryId: "repo",
    revisionId: "revision",
    expectedVersion: 4,
    actor: "manager",
    qualificationVersion: 7,
    now: 100,
  };
  assert.throws(() => startManualActionRun(rule, input), ActionsError);
  assert.throws(
    () => startManualActionRun(manualRule, { ...input, expectedVersion: 3 }),
    ActionsError,
  );
  const run = startManualActionRun(manualRule, input);
  assert.equal(run.rule.delegate, "manager");
  assert.equal(run.rule.delegateVersion, 7);
  assert.equal(manualRule.delegate, "delegate");
  assert.equal(manualRule.delegateVersion, 2);
});

test("Domain retry preserves the step, replaces uncertain results and never completes a cancelled run", () => {
  const queued = startBaselineActionRun(rule, source, "run", 100);
  assert.ok(queued);
  assert.throws(() => finishActionStep(queued, { kind: "checked", value: {} }, 100), ActionsError);
  const waiting = finishActionStep(
    { ...queued, status: "running", version: 2 },
    { kind: "notified", value: { line: "unknown" }, nextAt: 120 },
    101,
  );
  assert.equal(waiting.status, "waiting");
  assert.equal(waiting.step, 0);
  assert.equal(waiting.due, 120);
  assert.throws(() => retryActionRun(waiting, 2, 121), ActionsError);
  const retry = retryActionRun(waiting, waiting.version, 121);
  const first = finishActionStep(
    { ...retry, status: "running", version: retry.version + 1 },
    { kind: "notified", value: { line: "accepted" }, nextAt: null },
    122,
  );
  assert.equal(first.status, "queued");
  assert.equal(first.step, 1);
  assert.deepEqual(first.results, [{ step: 0, value: { line: "accepted" } }]);
  const last = finishActionStep(
    { ...first, status: "running", version: first.version + 1 },
    { kind: "notified", value: { line: "unavailable" }, nextAt: null },
    123,
  );
  assert.equal(last.status, "succeeded");
  assert.equal(last.step, 2);
  assert.throws(() => cancelActionRun(last, last.version), ActionsError);
  const cancelled = cancelActionRun(waiting, waiting.version);
  assert.deepEqual(cancelled.results, waiting.results);
  assert.throws(
    () =>
      finishActionStep(
        cancelled,
        { kind: "notified", value: { line: "accepted" }, nextAt: null },
        130,
      ),
    ActionsError,
  );
});
