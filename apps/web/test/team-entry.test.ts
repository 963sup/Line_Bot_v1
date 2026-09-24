import assert from "node:assert/strict";
import test from "node:test";
import { workAssistantRichMenu } from "../src/modules/assistant/rich-menu/definition";
import { teamApiError, teamBody, teamQuery } from "../src/modules/team/http.server";
import { entryDestination } from "../src/shared/presentation/entry-destination";
import { entryRoute, loginReturnUrl } from "../src/shared/presentation/entry-route";

test("team menu replaces all three entries and preserves their destination through login", () => {
  const menu = workAssistantRichMenu(
    "https://miniapp.line.me/123-test",
    { width: 1536, height: 1024 },
    "team",
  );
  const destinations = ["/partners/news", "/partners", "/partners/referrals"];
  assert.deepEqual(
    menu.areas.slice(1).map((area) => area.action.label),
    ["最新消息", "合作夥伴", "夥伴推薦"],
  );
  for (const [index, area] of menu.areas.slice(1).entries()) {
    assert.equal(area.action.type, "uri");
    if (area.action.type === "uri") {
      assert.equal(entryDestination(area.action.uri), destinations[index]);
      assert.equal(entryDestination(loginReturnUrl(area.action.uri)), destinations[index]);
    }
  }
  assert.equal(entryDestination("https://app.test/?partners=1&partnerView=unknown"), "/partners");
  assert.equal(
    entryDestination("https://app.test/?partners=1&partnerView=news&partnerView=referrals"),
    "/partners",
  );
  assert.equal(entryRoute("https://app.test/?team=1&meetings=1"), "invalid");
  assert.equal(entryRoute("https://app.test/?team=1&team=1"), "invalid");
  assert.equal(entryRoute("https://app.test/?meetings=wrong"), "invalid");
  assert.equal(
    loginReturnUrl("https://app.test/?meetings=1&access_token=secret"),
    "https://app.test/",
  );
});
test("team HTTP rejects cross-origin, malformed and oversized bodies", async () => {
  const previous = process.env.APP_ORIGIN;
  process.env.APP_ORIGIN = "https://app.test";
  const request = (body: string, origin = "https://app.test") =>
    new Request("https://app.test/api/team", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body,
    });
  try {
    assert.deepEqual(await teamBody(request('{"action":"join"}')), { action: "join" });
    for (const [req, status] of [
      [request("{}", "https://evil.test"), 403],
      [request("{"), 400],
      [request('"' + "x".repeat(66000) + '"'), 413],
    ] as const) {
      try {
        await teamBody(req);
        assert.fail("must reject");
      } catch (e) {
        assert.equal(teamApiError(e).status, status);
      }
    }
    const response = teamApiError(new Error("secret database detail"));
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.ok(!(await response.text()).includes("secret"));
  } finally {
    if (previous === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = previous;
  }
});

test("team HTTP accepts only canonical Organization-scoped query parameters", () => {
  assert.deepEqual(
    teamQuery(
      new Request("https://app.test/api/team?organizationAccountId=organization-a&teamId=team-a"),
    ),
    { kind: "id", organizationAccountId: "organization-a", teamId: "team-a" },
  );
  assert.deepEqual(
    teamQuery(
      new Request("https://app.test/api/team?organizationLogin=acme&teamSlug=platform-sre"),
    ),
    { kind: "locator", organizationLogin: "acme", teamSlug: "platform-sre" },
  );
  for (const url of [
    "https://app.test/api/team?groupId=retired",
    "https://app.test/api/team?teamId=a&teamId=b",
    "https://app.test/api/team?organizationAccountId=a&organizationAccountId=b",
    "https://app.test/api/team?organizationLogin=acme",
    "https://app.test/api/team?teamSlug=platform-sre",
    "https://app.test/api/team?organizationLogin=acme&teamSlug=platform-sre&teamId=team-a",
  ]) {
    assert.throws(() => teamQuery(new Request(url)));
  }
});
