import assert from "node:assert/strict";
import { test } from "node:test";
import {
  deployProduction,
  parseProductionDeployArgs,
  VERCEL_PRODUCTION_TARGET,
} from "./deploy-production.mjs";

const SHA = "0123456789abcdef0123456789abcdef01234567";
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

test("production deploy requires explicit live authorization and exact SHA", () => {
  assert.throws(() => parseProductionDeployArgs(["--sha", SHA]), /--live/);
  assert.throws(() => parseProductionDeployArgs(["--live", "--sha", "main"]), /exact commit SHA/);
  assert.deepEqual(parseProductionDeployArgs(["--live", "--sha", SHA]), { sha: SHA });
});

test("production deploy targets the selected project and reads back the exact SHA", async () => {
  const calls = [];
  const responses = [
    json({ id: VERCEL_PRODUCTION_TARGET.projectId, name: VERCEL_PRODUCTION_TARGET.projectName }),
    json({ id: "dpl_exact" }, 201),
    json({ id: "dpl_exact", readyState: "BUILDING" }),
    json({
      id: "dpl_exact",
      readyState: "READY",
      target: "production",
      url: "mini-app-line-exact.vercel.app",
      alias: [VERCEL_PRODUCTION_TARGET.productionAlias],
      meta: { githubCommitSha: SHA },
    }),
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
  assert.equal(calls.length, 4);
  assert.match(calls[0].url, new RegExp(VERCEL_PRODUCTION_TARGET.projectId));
  const mutation = JSON.parse(calls[1].init.body);
  assert.equal(mutation.project, VERCEL_PRODUCTION_TARGET.projectId);
  assert.equal(mutation.target, "production");
  assert.equal(mutation.gitSource.ref, SHA);
  assert.equal(mutation.gitMetadata.commitSha, SHA);
});

test("production deploy never retries an unknown mutation result", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls === 1) {
      return json({
        id: VERCEL_PRODUCTION_TARGET.projectId,
        name: VERCEL_PRODUCTION_TARGET.projectName,
      });
    }
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
  assert.equal(calls, 2);
});
