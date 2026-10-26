import assert from "node:assert/strict";
import test from "node:test";
import { readLatestRunJobs } from "./api.mjs";

const options = { repository: "963sup/Line_Bot_v1", runId: 123, token: "synthetic" };
const json = (body) => new Response(JSON.stringify(body));
const job = (id, attempt, name, conclusion) => ({ id, run_attempt: attempt, name, conclusion });

test("job evidence preserves unchanged prerequisites but never hides a newer failure or pending retry", async () => {
  const jobs = [
    job(20, 2, "release_plan", "success"),
    job(10, 1, "release_plan", "failure"),
    job(11, 1, "validation / validate", "success"),
    job(12, 1, "deployment", "success"),
    job(30, 3, "deployment", "failure"),
    job(40, 4, "deployment", null),
  ];
  const read = (history) =>
    readLatestRunJobs({ ...options, fetchImpl: async () => json({ jobs: history }) });
  const result = await read(jobs);
  assert.equal(result.find((item) => item.name === "release_plan").id, 20);
  assert.equal(result.find((item) => item.name === "validation / validate").id, 11);
  assert.equal(result.find((item) => item.name === "deployment").conclusion, null);
  assert.equal(
    (await read(jobs.slice(0, -1))).find((item) => item.name === "deployment").conclusion,
    "failure",
  );
  assert.deepEqual(await read(jobs.toReversed()), result.toReversed());
});

test("job history reads every page, including prerequisites outside the first hundred entries", async () => {
  const calls = [];
  const result = await readLatestRunJobs({
    ...options,
    fetchImpl: async (url) => {
      const query = new URL(url).searchParams;
      assert.equal(query.get("filter"), "all");
      calls.push(query.get("page"));
      return json({
        jobs:
          query.get("page") === "1"
            ? Array.from({ length: 100 }, (_, i) => job(i + 1, 1, `matrix-${i}`, "success"))
            : [job(101, 2, "release_plan", "success")],
      });
    },
  });
  assert.deepEqual(calls, ["1", "2"]);
  assert.equal(result.find((item) => item.name === "release_plan").id, 101);
});

test("malformed job history and evidence from a future attempt fail closed", async () => {
  for (const body of [
    {},
    { jobs: [null] },
    { jobs: [{ name: "release_plan", conclusion: "success" }] },
    { jobs: [job(1, 4, "release_plan", "success")] },
  ]) {
    await assert.rejects(
      readLatestRunJobs({ ...options, maxAttempt: 3, fetchImpl: async () => json(body) }),
      /evidence|identity|attempt/,
    );
  }
  await assert.rejects(
    readLatestRunJobs({
      ...options,
      fetchImpl: async () => {
        throw new Error("offline");
      },
    }),
    /evidence read failed/,
  );
});
