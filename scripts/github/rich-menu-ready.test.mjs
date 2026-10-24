import assert from "node:assert/strict";
import { test } from "node:test";
import { requireRichMenuWebReady } from "./rich-menu-ready.mjs";

const SHA = "a".repeat(40);
const json = (value) =>
  new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
  });

function fixture({
  snapshots = [
    [null, null],
    ["success", "success"],
  ],
  runSha = SHA,
  mainShas = [SHA],
  runStatuses = ["in_progress"],
} = {}) {
  let polls = 0;
  let currentMainReads = 0;
  let currentRunReads = 0;
  let sleeps = 0;
  return {
    args: {
      sha: SHA,
      repository: "963sup/Line_Bot_v1",
      runId: 42,
      runAttempt: 1,
      token: "test-only",
      pollMs: 0,
      maxPolls: 3,
      sleep: async () => {
        sleeps++;
      },
      fetchImpl: async (url) => {
        const pathname = new URL(url).pathname;
        if (pathname.endsWith("/branches/main")) {
          const index = Math.min(currentMainReads++, mainShas.length - 1);
          return json({ commit: { sha: mainShas[index] } });
        }
        if (pathname.endsWith("/actions/runs/42"))
          return json({
            id: 42,
            head_sha: runSha,
            head_branch: "main",
            event: "push",
            path: ".github/workflows/release.yml",
            run_attempt: 1,
            status: runStatuses[Math.min(currentRunReads++, runStatuses.length - 1)],
          });
        if (pathname.endsWith("/actions/runs/42/jobs")) {
          const values = snapshots[Math.min(polls++, snapshots.length - 1)];
          return json({
            jobs: ["deployment", "identifier_runtime_activation"].map((name, i) => ({
              id: i + 1 + polls * 10,
              run_attempt: 1,
              name,
              conclusion: values[i],
            })),
          });
        }
        throw new Error("Unexpected evidence request " + pathname);
      },
    },
    counters: () => ({ polls, sleeps }),
  };
}

test("runtime gate waits for successful exact-run Web and identifier activation", async () => {
  const { args, counters } = fixture();
  assert.deepEqual(await requireRichMenuWebReady(args), {
    sha: SHA,
    run_id: 42,
    attempt: 1,
    ready: true,
  });
  assert.deepEqual(counters(), { polls: 2, sleeps: 1 });
});

for (const status of ["failure", "cancelled", "skipped", "timed_out"]) {
  test("runtime gate fails closed on " + status, async () => {
    const { args } = fixture({ snapshots: [[status, null]] });
    await assert.rejects(requireRichMenuWebReady(args), /not successful/);
  });
}

test("runtime gate rejects a failed activation after successful Web deployment", async () => {
  const { args } = fixture({ snapshots: [["success", "failure"]] });
  await assert.rejects(requireRichMenuWebReady(args), /not successful/);
});

test("runtime gate times out rather than claiming readiness for pending jobs", async () => {
  const { args, counters } = fixture({ snapshots: [[null, null]] });
  await assert.rejects(requireRichMenuWebReady(args), /still unknown/);
  assert.equal(counters().polls, 3);
});

test("runtime gate rejects another Release SHA before job readback", async () => {
  const { args, counters } = fixture({ runSha: "b".repeat(40) });
  await assert.rejects(requireRichMenuWebReady(args), /invalid Release identity/);
  assert.equal(counters().polls, 0);
});

test("runtime gate stops if main changes during publication", async () => {
  const { args } = fixture({
    mainShas: [SHA, SHA, "b".repeat(40)],
    snapshots: [
      [null, null],
      ["success", "success"],
    ],
  });
  await assert.rejects(requireRichMenuWebReady(args), /not current main/);
});

test("runtime gate refuses a cancelled Release after successful job readback", async () => {
  const { args } = fixture({
    snapshots: [["success", "success"]],
    runStatuses: ["in_progress", "completed"],
  });
  await assert.rejects(requireRichMenuWebReady(args), /no active matching Release/);
});
