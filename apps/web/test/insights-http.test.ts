import assert from "node:assert/strict";
import { test } from "node:test";
import { createRepositoryPulse } from "@line_bot_v1/insights/application/use-cases/repository-pulse";
import { RepositoryError } from "@line_bot_v1/repository/domain";
import { WbsError } from "@line_bot_v1/wbs/domain/document";
import { insightsRequest } from "../src/modules/repository/insights-http.server";
import { insightsView } from "../src/modules/repository/insights-response";
import { RequestIdentityError } from "../src/shared/server/request-identity-error";

test("Insights HTTP preserves identity, locator, interval, partial availability and denial", async () => {
  const url = "https://example.test/api/repository-insights?owner=alice&name=Alpha";
  let failure: "none" | "source" | "forbidden" | "missing" = "none";
  const calls: unknown[] = [];
  const query = createRepositoryPulse({
    qualify: async (actor, repositoryId) => {
      calls.push([actor, repositoryId]);
    },
    issues: {
      read: async () => {
        if (failure === "source") throw new Error("storage unavailable");
        if (failure === "forbidden") throw new RepositoryError(403, "denied");
        return {
          created: 2,
          closed: 1,
          reopened: 0,
          workflow: { pending: 1, active: 2, review: 0, completed: 3 },
          coverage: {
            stateChanges: "recorded-events-only",
            legacyIssues: 1,
            unstructuredEvents: 2,
          },
        };
      },
    },
    wbs: {
      read: async () => {
        if (failure === "missing") throw new WbsError(404, "missing");
        return {
          initialized: false,
          pendingProposals: 0,
          baseline: null,
          draftRevisionId: null,
          differences: null,
        };
      },
    },
    now: () => 1000000000,
  });
  const read: Parameters<typeof insightsRequest>[1] = async (subject, selector, period) => {
    assert.equal(subject, "verified-line-subject");
    assert.deepEqual(selector, { ownerLogin: "alice", repositoryName: "Alpha" });
    // Stand in for current Account/Repository resolution; client actor/role/id are ignored.
    return query.read("canonical-user", { repositoryId: "resolved-repo", ...period });
  };
  const identity = async () => "verified-line-subject";
  const request = (suffix = "") => insightsRequest(new Request(url + suffix), read, identity);
  const response = await request("&userId=attacker&role=admin&repositoryId=other");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  const view = insightsView(await response.json());
  assert.equal(view.issues?.created, 2);
  assert.equal(view.from, 395200000);
  assert.equal(view.to, 1000000000);
  assert.deepEqual(calls, [["canonical-user", "resolved-repo"]]);
  for (const invalid of [
    "&from=2&to=2",
    "&from=-1",
    "&to=0",
    "&from=",
    "&to=1.2",
    "&from=9007199254740992",
  ])
    assert.equal((await request(invalid)).status, 400);
  assert.equal((await request("&from=1&to=2")).status, 200);
  assert.equal(
    (
      await insightsRequest(new Request(url), read, async () => {
        throw new RequestIdentityError(401, "login required");
      })
    ).status,
    401,
  );
  failure = "source";
  const partial = await request();
  assert.equal(partial.status, 200);
  assert.equal(insightsView(await partial.json()).issues, null);
  failure = "forbidden";
  assert.equal((await request()).status, 403);
  failure = "missing";
  assert.equal((await request()).status, 404);
});

test("Insights presentation rejects missing metrics rather than fabricating zeros", () => {
  const value = {
    period: { from: 1, to: 2, timeZone: "Asia/Taipei" },
    observedAt: 2,
    issues: { status: "unavailable", value: null },
    wbs: { status: "unavailable", value: null },
  };
  assert.equal(insightsView(value).wbs, null);
  assert.throws(() => insightsView({ ...value, issues: { status: "available", value: {} } }));
});
