import assert from "node:assert/strict";
import { test } from "node:test";
import {
  deployProduction,
  parseProductionDeployArgs,
  verifyProductionReleaseAuthorization,
  VERCEL_PRODUCTION_TARGET,
} from "./deploy-production.mjs";

const SHA = "0123456789abcdef0123456789abcdef01234567";
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const project = () =>
  json({ id: VERCEL_PRODUCTION_TARGET.projectId, name: VERCEL_PRODUCTION_TARGET.projectName });

const ready = (id = "dpl_exact") => ({
  id,
  readyState: "READY",
  state: "READY",
  target: "production",
  url: "mini-app-line-exact.vercel.app",
  alias: [VERCEL_PRODUCTION_TARGET.productionAlias],
  meta: { githubCommitSha: SHA },
});

test("production deploy requires explicit live authorization and exact SHA", () => {
  assert.throws(() => parseProductionDeployArgs(["--sha", SHA]), /--live/);
  assert.throws(() => parseProductionDeployArgs(["--live", "--sha", "main"]), /exact commit SHA/);
  assert.deepEqual(parseProductionDeployArgs(["--live", "--sha", SHA]), { sha: SHA });
});

test("production release authorization accepts only a current Release after Supabase success", async () => {
  const responses = [
    json({ id: 123, path: ".github/workflows/release.yml", event: "workflow_run", head_branch: "main", head_sha: SHA, status: "in_progress" }),
    json({ jobs: [{ name: "gate", conclusion: "success" }, { name: "supabase", conclusion: "success" }] }),
  ];
  await verifyProductionReleaseAuthorization({
    token: "test-token",
    runId: "123",
    sha: SHA,
    repository: "963sup/Line_Bot_v1",
    actionSha: SHA,
    fetchImpl: async () => responses.shift(),
  });
});

test("production release authorization fails closed before Supabase success", async () => {
  const responses = [
    json({ id: 123, path: ".github/workflows/release.yml", event: "workflow_run", head_branch: "main", head_sha: SHA, status: "in_progress" }),
    json({ jobs: [{ name: "gate", conclusion: "success" }, { name: "supabase", conclusion: "failure" }] }),
  ];
  await assert.rejects(
    verifyProductionReleaseAuthorization({
      token: "test-token",
      runId: "123",
      sha: SHA,
      repository: "963sup/Line_Bot_v1",
      actionSha: SHA,
      fetchImpl: async () => responses.shift(),
    }),
    /successful gate and Supabase convergence/,
  );
});

test("production deploy targets the selected project and reads back the exact SHA", async () => {
  const calls = [];
  const responses = [
    project(),
    json({ deployments: [] }),
    json({ id: "dpl_exact" }, 201),
    json({ id: "dpl_exact", readyState: "BUILDING" }),
    json(ready()),
  ];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return responses.shift();
  };

  const result = await deployProduction({
    token: "test-token",
    sha: SHA,
    fetchImpl,
    sleep: async () => {},
  });

  assert.equal(result.deploymentId, "dpl_exact");
  assert.equal(calls.length, 5);
  assert.match(calls[0].url, new RegExp(VERCEL_PRODUCTION_TARGET.projectId));
  assert.match(calls[1].url, /\/v7\/deployments\?/);
  assert.match(calls[1].url, new RegExp(`sha=${SHA}`));
  const mutation = JSON.parse(calls[2].init.body);
  assert.equal(calls[2].init.method, "POST");
  assert.equal(mutation.project, VERCEL_PRODUCTION_TARGET.projectId);
  assert.equal(mutation.target, "production");
  assert.equal(mutation.gitSource.ref, SHA);
  assert.equal(mutation.gitMetadata.commitSha, SHA);
});

test("production deploy reuses an exact READY production deployment before mutating", async () => {
  const calls = [];
  const responses = [
    project(),
    json({
      deployments: [
        {
          id: "dpl_recovered",
          state: "READY",
          target: "production",
          meta: { githubCommitSha: SHA },
        },
      ],
    }),
    json(ready("dpl_recovered")),
  ];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return responses.shift();
  };

  const result = await deployProduction({
    token: "test-token",
    sha: SHA,
    fetchImpl,
    sleep: async () => {},
  });

  assert.equal(result.deploymentId, "dpl_recovered");
  assert.equal(calls.length, 3);
  assert.equal(
    calls.some((call) => call.init.method === "POST"),
    false,
  );
});

test("production deploy resumes an exact in-flight deployment instead of duplicating it", async () => {
  const calls = [];
  const responses = [
    project(),
    json({
      deployments: [
        {
          id: "dpl_inflight",
          state: "BUILDING",
          target: "production",
          meta: { githubCommitSha: SHA },
        },
      ],
    }),
    json({
      id: "dpl_inflight",
      readyState: "BUILDING",
      target: "production",
      meta: { githubCommitSha: SHA },
    }),
    json(ready("dpl_inflight")),
  ];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return responses.shift();
  };

  const result = await deployProduction({
    token: "test-token",
    sha: SHA,
    fetchImpl,
    sleep: async () => {},
  });

  assert.equal(result.deploymentId, "dpl_inflight");
  assert.equal(
    calls.some((call) => call.init.method === "POST"),
    false,
  );
});

test("production deploy never retries an unknown mutation result inside one invocation", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls === 1) return project();
    if (calls === 2) return json({ deployments: [] });
    throw new Error("network lost after request");
  };

  await assert.rejects(
    deployProduction({
      token: "test-token",
      sha: SHA,
      fetchImpl,
      sleep: async () => {},
    }),
    /outcome unknown/,
  );
  assert.equal(calls, 3);
});
