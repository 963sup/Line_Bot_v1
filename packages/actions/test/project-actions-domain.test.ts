import assert from "node:assert/strict";
import { test } from "node:test";
import { createProjectActions } from "../src/application/use-cases/project-automation.js";
import type { ProjectActionRecord } from "../src/contracts/output/project-automation.js";
import {
  executionAllowed,
  type ProjectActionRule,
  requireProjectActionAccess,
  requireProjectActionManager,
  startProjectBaselineActionRun,
} from "../src/domain/project-automation.js";

const rule: ProjectActionRule = {
  id: "00000000-0000-4000-8000-000000000001",
  projectId: "project",
  version: 1,
  kind: "notify-wbs-baseline",
  recipients: ["recipient"],
  enabled: true,
  enabledAfter: 4,
  delegationId: "delegation",
  delegate: "admin",
  delegateVersion: 7,
};

test("Project Actions require current ADMIN and block closed or transferring scopes", () => {
  for (const role of ["READ", "WRITE"] as const)
    assert.throws(() =>
      requireProjectActionAccess({
        role,
        closed: false,
        transferRequested: false,
        qualificationVersion: 7,
      }),
    );
  assert.doesNotThrow(() =>
    requireProjectActionAccess({
      role: "ADMIN",
      closed: true,
      transferRequested: false,
      qualificationVersion: 7,
    }),
  );
  assert.throws(() =>
    requireProjectActionManager({
      role: "ADMIN",
      closed: true,
      transferRequested: false,
      qualificationVersion: 7,
    }),
  );
  assert.throws(() =>
    requireProjectActionManager({
      role: "ADMIN",
      closed: false,
      transferRequested: true,
      qualificationVersion: 7,
    }),
  );
});

test("Project Baseline admission honors activation cursor and execution rechecks delegation", () => {
  assert.equal(
    startProjectBaselineActionRun(
      rule,
      { projectId: "project", baselineId: "baseline", revisionId: "revision", cursor: 4 },
      "run",
      10,
    ),
    null,
  );
  const run = startProjectBaselineActionRun(
    rule,
    { projectId: "project", baselineId: "baseline", revisionId: "revision", cursor: 5 },
    "run",
    10,
  );
  assert.ok(run);
  assert.equal(
    executionAllowed(run, rule, {
      role: "ADMIN",
      closed: false,
      transferRequested: false,
      qualificationVersion: 7,
    }),
    true,
  );
  assert.equal(
    executionAllowed(run, rule, {
      role: "ADMIN",
      closed: false,
      transferRequested: true,
      qualificationVersion: 7,
    }),
    false,
  );
  assert.equal(
    executionAllowed(run, rule, {
      role: "WRITE",
      closed: false,
      transferRequested: false,
      qualificationVersion: 7,
    }),
    false,
  );
});

test("exact command replay is deduped and remains available after Project closure", async () => {
  let savedRule: ProjectActionRule | null = null;
  let receipt: ProjectActionRecord | null = null;
  let saves = 0;
  let closed = false;
  const actions = createProjectActions({
    transactions: {
      transact: async (_userId, _projectId, work) =>
        work({
          scope: {
            role: "ADMIN",
            closed,
            transferRequested: false,
            qualificationVersion: 7,
          },
          id: () => "00000000-0000-4000-8000-000000000003",
          cursor: async () => 0,
          replay: async () => receipt,
          receipt: async (_requestId, _fingerprint, result) => {
            receipt = result;
          },
          rules: {
            list: async () => (savedRule ? [savedRule] : []),
            load: async () => savedRule,
            save: async (value) => {
              saves++;
              savedRule = value;
            },
          },
          runs: {
            load: async () => null,
            save: async () => {
              throw new Error("unexpected run");
            },
          },
        }),
    },
    steps: {
      events: {
        cursor: async () => 0,
        claim: async () => null,
        acknowledge: async () => false,
      },
      notifications: {
        deliver: async () => ({
          inbox: "skipped",
          notificationId: null,
          line: "unavailable",
          nextAt: null,
        }),
        cancel: async () => {},
      },
      check: async () => ({}),
    },
    now: () => 1,
  });
  const command = {
    action: "define",
    projectId: "project",
    id: "00000000-0000-4000-8000-000000000001",
    requestId: "00000000-0000-4000-8000-000000000002",
    expectedVersion: 0,
    kind: "check-wbs-revision",
    recipients: [],
    enabled: true,
  };
  const first = await actions.execute("admin", command);
  closed = true;
  assert.deepEqual(await actions.execute("admin", command), first);
  assert.equal(saves, 1);
});
