import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const load = process.env.PLAYWRIGHT_PACKAGE_PATH
  ? (name) => require(path.join(path.resolve(process.env.PLAYWRIGHT_PACKAGE_PATH), name))
  : require;
const { chromium } = load("playwright");
const { expect } = load("playwright/test");
const url = new URL(process.env.NAVIGATION_BASE ?? "http://127.0.0.1:4117");
if (
  url.protocol !== "http:" ||
  !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
  url.pathname !== "/" ||
  url.search ||
  url.hash
) {
  throw new Error("NAVIGATION_BASE must be an HTTP loopback origin.");
}
const base = url.origin;
const output = process.env.NAVIGATION_ARTIFACT_DIR;
if (output) mkdirSync(output, { recursive: true });
const storageKey = "sb-local-auth-auth-token";
const session = (name) => ({
  access_token: `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub: name, exp: 4102444800 })).toString("base64url")}.synthetic`,
  refresh_token: `synthetic-${name}`,
  token_type: "bearer",
  expires_at: 4102444800,
  expires_in: 3600,
  user: { id: name, email: `${name}@example.test` },
});
const browser = await chromium.launch({
  channel: process.env.NAVIGATION_BROWSER_CHANNEL || undefined,
  headless: true,
});
const results = [];
let context;
let page;
async function fixture(status = "active", signedIn = false, profileMode = "ready") {
  context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
  });
  if (output) await context.tracing.start({ screenshots: true, snapshots: true });
  page = await context.newPage();
  const state = {
    documents: 0,
    errors: [],
    posts: [],
    reads: [],
    status,
    linked: null,
    hold: false,
    release: null,
    pending: null,
    stages: [],
    liffRequests: 0,
  };
  page.on("pageerror", (error) => state.errors.push(error.message));
  page.on("request", (request) => {
    if (request.resourceType() === "document") state.documents++;
  });
  if (signedIn)
    await context.addInitScript(
      ({ key, value }) => {
        if (!sessionStorage.getItem("seeded")) {
          localStorage.setItem(key, JSON.stringify(value));
          sessionStorage.setItem("seeded", "true");
        }
      },
      { key: storageKey, value: session("first") },
    );
  await context.route("**/*", async (route) => {
    const request = route.request();
    const target = new URL(request.url());
    if (target.hostname === "static.line-scdn.net") {
      state.liffRequests++;
      return route.fulfill({
        contentType: "text/javascript",
        body: `window.liffInitCount=0;window.profileMode=${JSON.stringify(profileMode)};window.releaseProfiles=[];window.liff={init:async()=>{window.liffInitCount++},isLoggedIn:()=>true,getAccessToken:()=> 'synthetic-line',isInClient:()=>false,getProfile:async()=>{if(window.profileMode==='fail')throw new Error('profile unavailable');if(window.profileMode==='hold')return new Promise(resolve=>window.releaseProfiles.push(resolve));return {displayName:'測試會員'}},login:()=>{}};`,
      });
    }
    if (target.origin !== base) return route.abort();
    if (target.pathname === "/api/membership/google-link") {
      if (request.method() === "POST") {
        const body = request.postDataJSON();
        state.posts.push(body);
        if (body.action === "start") {
          state.pending = {
            id: "11111111-1111-4111-8111-111111111111",
            email: null,
            expiresAt: Date.now() + 600000,
          };
          return route.fulfill({ json: { token: "a".repeat(43) } });
        }
        if (body.action === "stage") {
          assert.equal(request.headers()["x-line-token"], undefined);
          assert.equal(request.headers()["x-google-link"], "a".repeat(43));
          assert.ok(request.headers().authorization);
          state.stages.push(body);
          return route.fulfill({ json: { ok: true } });
        }
        if (body.action === "confirm") state.linked = state.pending.email;
        state.pending = null;
        return route.fulfill({ json: { ok: true } });
      }
      return route.fulfill({ json: { pending: state.pending } });
    }
    if (target.pathname === "/api/membership") {
      const google = target.searchParams.get("google") === "link";
      const candidate =
        request.headers().authorization === `Bearer ${session("second").access_token}`
          ? "second@example.test"
          : "first@example.test";
      if (request.method() === "POST") {
        state.posts.push(request.postDataJSON());
        state.linked = candidate;
      } else state.reads.push({ google, authorization: request.headers().authorization });
      if (state.hold) {
        state.hold = false;
        await new Promise((resolve) => {
          state.release = resolve;
        });
      }
      return route.fulfill({
        json: {
          member: state.status
            ? {
                id: "synthetic-line",
                status: state.status,
                googleEmail: state.linked,
                coins: { balance: 10, dailyReward: 5, claimedToday: false, day: "2026-09-10" },
              }
            : null,
          googleEmail: google ? candidate : null,
        },
      });
    }
    if (target.pathname.startsWith("/api/"))
      return route.fulfill({ status: 403, json: { error: "合成資格拒絕" } });
    return route.continue();
  });
  return state;
}
async function finish(name, state) {
  assert.deepEqual(state.errors, []);
  results.push({
    name,
    documents: state.documents,
    liffInitializations: await page.evaluate(() => window.liffInitCount),
    status: "passed",
  });
  if (output)
    await context.tracing.stop({ path: path.join(output, `membership-${results.length}.zip`) });
  await context.close();
  context = undefined;
}
const button = (name) => page.getByRole("button", { name, exact: true });
const link = (name) => page.getByRole("link", { name, exact: true });
try {
  for (const profileMode of ["hold", "fail"]) {
    const state = await fixture("active", false, profileMode);
    await page.goto(base + "/settings");
    await expect(button("綁定 Google（選填）")).toBeEnabled();
    await expect(button("重新整理狀態")).toBeEnabled();
    assert.ok(state.reads.length > 0, "Membership must load independently of profile");
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
    if (output)
      await page.screenshot({
        path: path.join(output, `membership-profile-${profileMode}.png`),
        fullPage: true,
      });
    if (profileMode === "hold") {
      await expect
        .poll(() => page.evaluate(() => window.releaseProfiles.length))
        .toBeGreaterThan(0);
      // A refresh invalidates the old initialization before its profile arrives.
      await button("重新整理狀態").click();
      await expect(button("重新整理狀態")).toBeEnabled();
      await page.evaluate(async () => {
        for (const resolve of window.releaseProfiles) resolve({ displayName: "過期會員名稱" });
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      });
      await expect(page.getByText("LINE：過期會員名稱", { exact: true })).toHaveCount(0);
    }
    await finish(`Profile ${profileMode} does not block membership`, state);
  }

  for (const [from, label, to, status] of [
    ["/membership/register", "恢復會員功能", "/membership/restore", "pending"],
    ["/membership/restore", "註冊會員", "/membership/register", null],
    ["/expenses?expense=33333333-3333-4333-8333-333333333333", "前往帳號設定", "/settings", null],
    ["/auth/callback?error=access_denied", "返回帳號設定", "/settings", null],
  ]) {
    const state = await fixture(status);
    await page.goto(base + from);
    await link(label).click();
    await expect(page).toHaveURL(base + to);
    await expect(
      button("重新整理狀態").or(button("確認恢復")).or(button("確認註冊")),
    ).toBeEnabled();
    assert.equal(state.documents, 1, label);
    assert.equal(await page.evaluate(() => window.liffInitCount), 1);
    await expect(button("選擇 Google 帳號")).toHaveCount(0);
    await finish(label, state);
  }

  {
    const state = await fixture("active", true);
    await page.goto(base + "/settings");
    await expect(button("綁定 Google（選填）")).toBeEnabled();
    await button("綁定 Google（選填）").click();
    await expect(page).toHaveURL(base + "/google-link");
    await expect(button("選擇 Google 帳號")).toBeEnabled();
    assert.equal(state.liffRequests, 1, "External Google page must not load LIFF");
    assert.equal(
      await page.evaluate(() => sessionStorage.getItem("googleLinkRequest")),
      "a".repeat(43),
    );
    // Synthetic OAuth return in the SAME external tab; no real accounts or network.
    await page.goto(base + "/google-link?complete=1");
    await expect(page.getByText(/Google 帳號已備妥/)).toBeVisible();
    assert.equal(state.stages.length, 1);
    assert.equal(state.liffRequests, 1);
    assert.equal(state.linked, null, "Google stage must not bind the member");
    state.pending.email = "first@example.test";
    await page.goto(base + "/settings");
    await expect(button("確認綁定 Google")).toBeEnabled();
    await expect(page.getByText("Google：first@example.test", { exact: true })).toBeVisible();
    await button("取消綁定").click();
    await expect(button("綁定 Google（選填）")).toBeEnabled();
    assert.equal(state.linked, null);
    state.pending = {
      id: "22222222-2222-4222-8222-222222222222",
      email: "second@example.test",
      expiresAt: Date.now() + 600000,
    };
    await button("重新整理狀態").click();
    await expect(page.getByText("Google：second@example.test", { exact: true })).toBeVisible();
    await button("確認綁定 Google").click();
    await expect(
      page.getByText("已綁定 Google：second@example.test", { exact: true }),
    ).toBeVisible();
    assert.equal(state.posts.filter((p) => p.action === "confirm").length, 1);
    if (output)
      await page.screenshot({
        path: path.join(output, "membership-google-linked.png"),
        fullPage: true,
      });
    await finish("Google-only external handoff and original member confirmation", state);
  }
  {
    const state = await fixture("active");
    await page.goto(base + "/google-link");
    await expect(page.getByRole("main").getByRole("alert")).toContainText("綁定連結已失效");
    assert.equal(state.liffRequests, 0);
    assert.equal(state.posts.length, 0);
    await finish("Missing handoff fails without LINE login", state);
  }
  console.log(JSON.stringify(results, null, 2));
  if (output)
    writeFileSync(
      path.join(output, "membership-results.json"),
      `${JSON.stringify(results, null, 2)}\n`,
    );
} catch (error) {
  if (output && page && context) {
    await page.screenshot({ path: path.join(output, "membership-failure.png"), fullPage: true });
    await context.tracing.stop({ path: path.join(output, "membership-failure.zip") });
  }
  throw error;
} finally {
  await context?.close();
  await browser.close();
}
