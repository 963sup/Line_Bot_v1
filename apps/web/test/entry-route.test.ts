import assert from "node:assert/strict";
import test from "node:test";
import { entryDestination } from "../src/shared/presentation/entry-destination";
import {
  entryRoute,
  loginReturnUrl,
  miniAppEntryUrl,
} from "../src/shared/presentation/entry-route";

test("every published operation survives LINE login and resolves to the canonical product page", () => {
  const destinations = {
    workplaces: "/admin/workplaces",
    home: "/home",
    repositories: "/repositories",
    partners: "/partners",
    feedback: "/feedback",
    membership: "/settings",
    records: "/history",
    register: "/membership/register",
    restore: "/membership/restore",
    attendance: "/attendance",
    clockIn: "/attendance/clock-in",
    clockOut: "/attendance/clock-out",
    expense: "/expenses",
  } as const;
  for (const [intent, path] of Object.entries(destinations)) {
    const id = "00000000-0000-4000-8000-000000000000";
    const entry = new URL(
      miniAppEntryUrl(
        "https://miniapp.line.me/123-test",
        intent as keyof typeof destinations,
        intent === "expense" ? id : "1",
      ),
    );
    const returned = loginReturnUrl(
      `https://app.example/${entry.search}${entry.search ? "&" : "?"}access_token=secret&returnUrl=https://evil.test#token`,
    );
    assert.equal(entryDestination(returned), path + (intent === "expense" ? `?expense=${id}` : ""));
    assert.doesNotMatch(returned, /secret|evil|token/);
  }
});

test("primary LIFF redirect waits; restored intent selects only explicit operations", () => {
  assert.equal(entryRoute("https://example.com/expenses?liff.state=%3Fmembership%3D1"), "pending");
  assert.equal(entryRoute("https://example.com/expenses"), "home");
  assert.equal(entryRoute("https://example.com/expenses?membership=1"), "membership");
  assert.equal(entryRoute("https://example.com/?attendance=1"), "attendance");
  for (const route of ["repositories", "partners", "feedback", "clockIn", "clockOut"] as const) {
    assert.equal(entryRoute(`https://example.com/?${route}=1`), route);
    assert.equal(entryRoute(`https://example.com/?${route}=1&membership=1`), "invalid");
    assert.equal(
      loginReturnUrl(`https://example.com/?${route}=1&access_token=secret`),
      `https://example.com/?${route}=1`,
    );
  }
  assert.equal(entryRoute("https://example.com/?membership=1&expense=bad"), "invalid");
  assert.equal(entryRoute("https://example.com/?expense=bad"), "invalid");
  assert.equal(
    entryRoute("https://example.com/?expense=12345678-1234-1234-1234-123456789abc"),
    "expense",
  );
  assert.equal(
    loginReturnUrl(
      "https://example.com/?membership=1&access_token=secret&returnUrl=https://evil.test#token",
    ),
    "https://example.com/?membership=1",
  );
});

test("login keeps supported view parameters but drops ambiguous views and credentials", () => {
  assert.equal(
    loginReturnUrl("https://example.com/repositories?issueView=mine&code=secret#token"),
    "https://example.com/repositories",
  );
  for (const [path, key, values] of [
    ["notifications", "notificationView", ["all", "unread"]],
    ["partners", "partnerView", ["news", "directory", "referrals"]],
  ] as const) {
    for (const value of values) {
      assert.equal(
        loginReturnUrl(`https://example.com/${path}?${key}=${value}&code=secret#token`),
        `https://example.com/${path}?${key}=${value}`,
      );
    }
    for (const query of [`${key}=unknown`, `${key}=${values[0]}&${key}=${values[0]}`]) {
      assert.equal(
        loginReturnUrl(`https://example.com/${path}?${query}`),
        `https://example.com/${path}`,
      );
    }
  }
});

test("MINI App entry uses the current miniapp.line.me permanent-link domain only", () => {
  assert.equal(
    miniAppEntryUrl("https://miniapp.line.me/123-test", "membership"),
    "https://miniapp.line.me/123-test?membership=1",
  );
  assert.throws(
    () => miniAppEntryUrl("https://liff.line.me/123-test", "membership"),
    /Invalid LINE MINI App URL/,
  );
});
