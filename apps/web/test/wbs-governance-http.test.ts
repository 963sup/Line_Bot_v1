import assert from "node:assert/strict";
import { test } from "node:test";
import { createWbsGovernance } from "@line_bot_v1/wbs/application/governance";
import type { WbsGovernanceStore } from "@line_bot_v1/wbs/contracts/governance";
import { WbsError } from "@line_bot_v1/wbs/domain";
import { wbsGovernanceRequest } from "../src/modules/repository/wbs-governance-http.server";

test("WBS governance transport rejects spoofing, wrong origins, invalid versions and preserves error classes", async (t) => {
  const previous = process.env.APP_ORIGIN;
  process.env.APP_ORIGIN = "https://example.com";
  t.after(() => {
    if (previous === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = previous;
  });
  const calls: unknown[] = [];
  let status = 404;
  const store: WbsGovernanceStore = {
    view: async (...args) => {
      calls.push(args);
      throw new WbsError(status, "source error");
    },
    execute: async (...args) => {
      calls.push(args);
      throw new WbsError(status, "transition error");
    },
  };
  const service = createWbsGovernance({
    activeUser: async () => ({ id: "verified-user" }),
    store: () => store,
    now: () => 10,
  });
  const identity = async () => "verified-subject";
  const get = (query = "owner=alice&name=Alpha") =>
    wbsGovernanceRequest(
      new Request(`https://example.com/api/repository-wbs/governance?${query}`),
      service,
      identity,
    );
  const response = await get();
  assert.equal(response.status, 404);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  assert.deepEqual(calls[0], [
    "verified-user",
    { ownerLogin: "alice", repositoryName: "Alpha" },
    {},
  ]);
  assert.equal((await get("owner=alice&name=Alpha&beforeProposal=0")).status, 400);
  assert.equal((await get("owner=alice&name=Alpha&proposalId=bad")).status, 400);
  function post(body: unknown, origin = "https://example.com") {
    return wbsGovernanceRequest(
      new Request("https://example.com/api/repository-wbs/governance", {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      service,
      identity,
    );
  }
  const command = {
    action: "create-proposal",
    repositoryId: "repo",
    requestId: "11111111-1111-4111-8111-111111111111",
    expectedVersion: 0,
    title: "Scope",
    reason: "",
    candidateRevisionId: "22222222-2222-4222-8222-222222222222",
    baseBaselineId: null,
  };
  assert.equal((await post(command, "https://attacker.test")).status, 403);
  assert.equal((await post({ ...command, actor: "spoof" })).status, 400);
  for (status of [403, 404, 409, 503]) assert.equal((await post(command)).status, status);
  status = 409;
  assert.equal((await post({ ...command, reason: "理由與驗收".repeat(2000) })).status, 409);
  assert.equal((await post({ ...command, reason: "\\u0000".repeat(20000) })).status, 413);
});
