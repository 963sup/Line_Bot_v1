import assert from "node:assert/strict";
import test from "node:test";
import {
  entryDestination,
  hasEntryContinuation,
} from "../src/shared/presentation/entry-destination";
import { entryNavigation } from "../src/shared/presentation/entry-navigation";
import { loginReturnUrl } from "../src/shared/presentation/entry-route";

test("governance entry preserves only a single explicit navigation intent across LINE login", () => {
  for (const intent of ["organizations", "enterprises"]) {
    const input = `https://example.com/?${intent}=1&access_token=secret&role=admin`;
    assert.equal(entryDestination(input), `/${intent}`);
    assert.equal(loginReturnUrl(input), `https://example.com/?${intent}=1`);
    assert.equal(entryDestination(`https://example.com/?${intent}=1&team=1`), "invalid");
    assert.equal(entryDestination(`https://example.com/?${intent}=1&${intent}=1`), "invalid");
    assert.equal(entryDestination(`https://example.com/?${intent}=admin`), "invalid");
  }
});

test("public entry is passive unless LINE carries an intent or SDK continuation", () => {
  assert.equal(hasEntryContinuation("https://example.com/"), false);
  assert.equal(hasEntryContinuation("https://example.com/?utm_source=test"), false);
  assert.equal(hasEntryContinuation("https://example.com/?liff.state=%3Frepositories%3D1"), true);
  assert.equal(hasEntryContinuation("https://example.com/?membership=1"), true);
});

test("external LINE login responses activate the SDK without interpreting its redirect", () => {
  const callback =
    "https://example.com/?code=test-code&state=test-state&liffClientId=2011311656" +
    "&liffRedirectUri=https%3A%2F%2Fexample.com%2Fsettings%3Fgoogle%3Dlink";
  assert.equal(hasEntryContinuation(callback), true);
  assert.equal(hasEntryContinuation("https://example.com/?liffClientId=2011311656"), true);
  assert.equal(
    hasEntryContinuation("https://example.com/?liffRedirectUri=https://evil.test"),
    true,
  );
  assert.equal(hasEntryContinuation("https://example.com/?code=test-code&state=test-state"), false);
  // SDK parameters activate initialization only; they never authorize a product redirect.
  assert.equal(entryDestination(callback), "/home");
});

test("canonical destinations retain only validated business intent after LIFF initialization", () => {
  const base = "https://example.com/";
  assert.equal(entryDestination(base + "?liff.state=x"), "pending");
  assert.equal(entryDestination(base + "?membership=1&repositories=1"), "invalid");
  assert.equal(entryDestination(base + "?expense=bad"), "invalid");
  assert.equal(entryDestination(base + "?membership=1&membership=1"), "invalid");
  assert.equal(entryDestination(base + "?repositories=1"), "/repositories");
  assert.equal(entryDestination(base + "?partners=1"), "/partners");
  assert.equal(entryDestination(base + "?partners=1&partnerView=news"), "/partners/news");
  assert.equal(entryDestination(base + "?partners=1&partnerView=referrals"), "/partners/referrals");
  assert.equal(entryDestination(base + "?records=1"), "/history");
  assert.equal(entryDestination(base + "?register=1"), "/membership/register");
  assert.equal(entryDestination(base + "?restore=1"), "/membership/restore");
  assert.equal(entryDestination(base + "?attendance=1"), "/attendance");
  assert.equal(entryDestination(base + "?clockIn=1&code=secret"), "/attendance/clock-in");
  assert.equal(entryDestination(base + "?clockOut=1"), "/attendance/clock-out");
  assert.equal(entryDestination(base + "?clockIn=1&clockOut=1"), "invalid");
  assert.equal(entryDestination(base + "?clockIn=0"), "invalid");
  assert.equal(entryDestination(base + "?clockOut=1&clockOut=1"), "invalid");
  assert.equal(
    entryDestination(
      base + "?membership=1&google=link&access_token=secret&returnUrl=https://evil.test#token",
    ),
    "/settings?google=link",
  );
  assert.equal(
    entryDestination(base + "membership?google=link", "membership"),
    "/settings?google=link",
  );
  assert.equal(
    entryDestination(base + "?expense=12345678-1234-1234-1234-123456789abc&code=secret"),
    "/expenses?expense=12345678-1234-1234-1234-123456789abc",
  );
});

test("view selection survives continuation only for its owning destination", () => {
  assert.equal(entryDestination("https://example.com/?team=1&teamView=meetings"), "/team");
  assert.equal(entryDestination("https://example.com/?handovers=1"), "invalid");
  assert.equal(entryDestination("https://example.com/?meetings=1"), "invalid");
  assert.equal(
    entryDestination(
      "https://example.com/?repositories=1&teamView=members&notificationView=unread",
    ),
    "/repositories",
  );
  assert.equal(
    entryDestination("https://example.com/?repositories=1&issueView=created"),
    "/repositories",
  );
  for (const [intent, key, value, path] of [
    ["notifications", "notificationView", "unread", "/notifications"],
    ["partners", "partnerView", "news", "/partners"],
  ]) {
    for (const query of [`${key}=unknown`, `${key}=${value}&${key}=${value}`]) {
      assert.equal(entryDestination(`https://example.com/?${intent}=1&${query}`), path);
    }
  }
});

// LIFF can update browser history before Next renders the target route; explicitly converge the two states.
test("post-LIFF history replacement re-enters App Router with a sanitized local URL", () => {
  assert.deepEqual(
    entryNavigation(
      "https://example.com/settings?google=link&code=secret&state=secret",
      "home",
      "/",
    ),
    { state: "redirect", target: "/settings?google=link" },
  );
  assert.deepEqual(
    entryNavigation("https://example.com/?liff.state=%3Fmembership%3D1", "home", "/"),
    { state: "pending" },
  );
  assert.deepEqual(entryNavigation("https://example.com/settings", "home", "/settings"), {
    state: "ready",
  });
});

test("entry navigation resolves continuation once and normalizes stale intent parameters", () => {
  assert.deepEqual(entryNavigation("https://example.com/repositories?issueView=mine"), {
    state: "ready",
  });
  assert.deepEqual(
    entryNavigation("https://example.com/repositories?repositories=1&issueView=mine"),
    {
      state: "redirect",
      target: "/repositories",
    },
  );
  assert.deepEqual(entryNavigation("https://example.com/?liff.state=%3Frepositories%3D1"), {
    state: "pending",
  });
  assert.deepEqual(entryNavigation("https://example.com/?membership=1&repositories=1"), {
    state: "invalid",
  });
  assert.deepEqual(entryNavigation("https://example.com/records", "records"), {
    state: "redirect",
    target: "/history",
  });
});

test("legacy expense endpoint resolves menu intents and never opens an unspecified expense", () => {
  const base = "https://example.com/expenses";
  for (const suffix of ["", "?utm_source=line"]) {
    assert.deepEqual(entryNavigation(base + suffix), { state: "redirect", target: "/home" });
  }
  for (const [intent, target] of [
    ["repositories=1", "/repositories"],
    ["membership=1", "/settings"],
    ["notifications=1&notificationView=unread", "/notifications?notificationView=unread"],
    ["clockIn=1", "/attendance/clock-in"],
    ["clockOut=1", "/attendance/clock-out"],
    ["attendance=1", "/attendance"],
    ["team=1", "/team"],
    ["partners=1", "/partners"],
    ["feedback=1", "/feedback"],
    ["records=1", "/history"],
    ["register=1", "/membership/register"],
    ["restore=1", "/membership/restore"],
    ["planned=1", "/planned"],
  ]) {
    assert.deepEqual(entryNavigation(`${base}?${intent}`), { state: "redirect", target });
  }
  assert.deepEqual(entryNavigation(`${base}?liff.state=%3Frepositories%3D1`), { state: "pending" });
  assert.deepEqual(entryNavigation(`${base}?expense=bad`), { state: "invalid" });
  assert.deepEqual(entryNavigation(`${base}?expense=12345678-1234-1234-1234-123456789abc`), {
    state: "ready",
  });
});

test("resource continuation keeps notification IDs but normalizes legacy Repository IDs", () => {
  const id = "12345678-1234-1234-1234-123456789abc";
  assert.equal(
    entryDestination(
      `https://example.com/notifications/${id}?notifications=1&notificationView=unread&token=secret#secret`,
    ),
    `/notifications/${id}?notificationView=unread`,
  );
  assert.equal(
    entryDestination("https://example.com/notifications/bad?notifications=1"),
    "invalid",
  );
  assert.equal(
    entryDestination(
      `https://example.com/repositories/${id}?repositories=1&issueView=mine&token=secret#secret`,
    ),
    "/repositories",
  );
  assert.equal(
    entryDestination(`https://example.com/repositories/${id}?membership=1`),
    "/settings",
  );
});
