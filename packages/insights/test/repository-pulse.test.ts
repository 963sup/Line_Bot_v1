import assert from "node:assert/strict";
import { test } from "node:test";
import { createRepositoryPulse } from "../src/application/use-cases/repository-pulse.js";
import { parseRepositoryPulse } from "../src/contracts/dto/repository-pulse.js";

const issues = {
  created: 1,
  closed: 2,
  reopened: 1,
  workflow: { pending: 1, active: 0, review: 0, completed: 3 },
  coverage: {
    stateChanges: "recorded-events-only" as const,
    legacyIssues: 0,
    unstructuredEvents: 0,
  },
};
test("Pulse preserves time boundaries and metric meaning without loading authoritative aggregates", async () => {
  const calls: unknown[] = [];
  const query = createRepositoryPulse({
    qualify: async (user, repo) => {
      calls.push([user, repo]);
    },
    issues: {
      read: async (user, repo, from, to) => {
        calls.push([user, repo, from, to]);
        return issues;
      },
    },
    now: () => 1000000000,
  });
  const view = await query.read("owner", { repositoryId: "repo" });
  assert.deepEqual(view.period, { from: 395200000, to: 1000000000, timeZone: "Asia/Taipei" });
  assert.deepEqual(calls, [
    ["owner", "repo"],
    ["owner", "repo", 395200000, 1000000000],
  ]);
  assert.equal(view.issues.status, "available");
  assert.equal("wbs" in view, false);
  await assert.rejects(query.read("owner", { repositoryId: "repo", from: 2, to: 2 }));
});
test("an unavailable source is not zero; authorization and not-found failures stay closed", async () => {
  const deps = {
    qualify: async () => {},
    issues: {
      read: async () => {
        throw new Error("storage unavailable");
      },
    },
    now: () => 100,
  };
  const view = await createRepositoryPulse(deps).read("owner", {
    repositoryId: "repo",
    from: 0,
    to: 100,
  });
  assert.deepEqual(view.issues, { status: "unavailable", value: null });
  for (const status of [401, 403, 404]) {
    await assert.rejects(
      createRepositoryPulse({
        ...deps,
        issues: {
          read: async () => {
            throw Object.assign(new Error("denied"), { status });
          },
        },
      }).read("owner", { repositoryId: "repo", from: 0, to: 100 }),
    );
  }
});

test("Pulse response parser preserves unavailable evidence and rejects fabricated metrics", () => {
  const unavailable = {
    repositoryId: "repo",
    period: { from: 1, to: 2, timeZone: "Asia/Taipei" },
    observedAt: 2,
    issues: { status: "unavailable", value: null },
  };
  assert.deepEqual(parseRepositoryPulse(unavailable), unavailable);
  assert.throws(() =>
    parseRepositoryPulse({
      ...unavailable,
      issues: { status: "available", value: { created: 0 } },
    }),
  );
});
