import assert from "node:assert/strict";
import { test } from "node:test";
import { createWbs } from "@line_bot_v1/wbs/application";
import type { WbsStore } from "@line_bot_v1/wbs/contracts";
import { WbsError } from "@line_bot_v1/wbs/domain";
import { wbsRequest } from "../src/modules/repository/wbs-http.server";

test("WBS HTTP checks origin, parses commands and keeps failure classes distinct", async (t) => {
  const previous = process.env.APP_ORIGIN;
  process.env.APP_ORIGIN = "https://example.com";
  t.after(() => {
    if (previous === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = previous;
  });
  const calls: unknown[] = [];
  const store: WbsStore = {
    read: async (...args) => {
      calls.push(args);
      throw new WbsError(404, "missing");
    },
    history: async () => ({ revisions: [], next: null }),
    execute: async () => {
      throw new WbsError(409, "stale");
    },
  };
  const service = createWbs({
    activeUser: async () => ({ id: "user" }),
    store: () => store,
    now: () => 1,
  });
  const identity = async () => "verified-subject";
  const read = await wbsRequest(
    new Request("https://example.com/api/repository-wbs?owner=alice&name=Alpha"),
    service,
    identity,
  );
  assert.equal(read.status, 404);
  assert.deepEqual(calls, [["user", { ownerLogin: "alice", repositoryName: "Alpha" }, undefined]]);
  const history = await wbsRequest(
    new Request("https://example.com/api/repository-wbs/history?owner=alice&name=Alpha&before=0"),
    service,
    identity,
    true,
  );
  assert.equal(history.status, 400);
  function write(origin: string, body: unknown) {
    return wbsRequest(
      new Request("https://example.com/api/repository-wbs", {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      service,
      identity,
    );
  }
  const command = {
    action: "initialize",
    repositoryId: "repo",
    requestId: "11111111-1111-4111-8111-111111111111",
    expectedVersion: 0,
  };
  assert.equal((await write("https://attacker.test", command)).status, 403);
  assert.equal((await write("https://example.com", { ...command, actor: "spoof" })).status, 400);
  assert.equal((await write("https://example.com", command)).status, 409);
});
