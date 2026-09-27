import assert from "node:assert/strict";
import test from "node:test";
import { teamApiError, teamBody, teamQuery } from "../src/modules/team/http.server";
import { entryDestination } from "../src/shared/presentation/entry-destination";
import { entryRoute, loginReturnUrl } from "../src/shared/presentation/entry-route";

test("partner entry destinations survive login independently of Rich Menu navigation", () => {
  for (const [view, destination] of [
    ["news", "/partners/news"],
    ["directory", "/partners"],
    ["referrals", "/partners/referrals"],
  ] as const) {
    const uri = `https://miniapp.line.me/123-test?partners=1&partnerView=${view}`;
    assert.equal(entryDestination(uri), destination);
    assert.equal(entryDestination(loginReturnUrl(uri)), destination);
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
