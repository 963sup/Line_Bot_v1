import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const load = process.env.PLAYWRIGHT_PACKAGE_PATH
  ? (name) => require(path.join(process.env.PLAYWRIGHT_PACKAGE_PATH, name))
  : require;
const { chromium } = load("playwright");
const { expect } = load("playwright/test");
const target = new URL(process.env.NAVIGATION_BASE ?? "http://127.0.0.1:4117");
if (
  target.protocol !== "http:" ||
  !["127.0.0.1", "localhost", "[::1]"].includes(target.hostname) ||
  target.pathname !== "/" ||
  target.search ||
  target.hash
)
  throw new Error("NAVIGATION_BASE must be a loopback origin.");
const base = target.origin;
const output = process.env.NAVIGATION_ARTIFACT_DIR;
if (output) mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
  channel: process.env.NAVIGATION_BROWSER_CHANNEL || undefined,
  headless: true,
});
const results = [];
let context, page;
function panelSnapshot(state) {
  const startedAt = 1789000000000;
  const active = state.working
    ? { id: "record", day: "2026-09-11", startedAt, endedAt: null, ruleVersion: "taipei-window-v1" }
    : null;
  return {
    attendance: {
      records: active
        ? [
            {
              ...active,
              summary: {
                elapsedMs: 0,
                beforeMs: 0,
                scheduledMs: 0,
                afterMs: 0,
                crossesMidnight: false,
                provisional: true,
                days: [],
              },
            },
          ]
        : [],
      active,
      menuState: active ? "working" : "ready",
      computedAt: startedAt,
    },
    version: state.version,
    sites: [
      {
        id: "site",
        name: "測試地點",
        description: "",
        latitude: 25,
        longitude: 121,
        radius: 100,
        enabled: true,
        version: 1,
      },
    ],
  };
}
async function fixture(options = {}) {
  const state = {
    memberId: "member-a",
    working: false,
    version: 0,
    posts: [],
    reads: [],
    readVersions: [],
    errors: [],
    loseResponse: false,
    reject: 0,
    ...options,
  };
  const receipts = new Map();
  context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
  });
  if (output) await context.tracing.start({ screenshots: true, snapshots: true });
  await context.addInitScript(
    ({ gps, storageBlocked }) => {
      window.closeCalls = 0;
      window.gpsCalls = 0;
      Object.defineProperty(navigator, "geolocation", {
        value: {
          getCurrentPosition(success, failure) {
            window.gpsCalls++;
            if (gps === "deny") return failure({ code: 1 });
            if (gps === "hold") {
              window.releasePosition = () =>
                success({ coords: { latitude: 25, longitude: 121, accuracy: 5 } });
              return;
            }
            success({ coords: { latitude: 25, longitude: 121, accuracy: 5 } });
          },
        },
      });
      if (storageBlocked)
        Storage.prototype.setItem = () => {
          throw new Error("storage unavailable");
        };
    },
    { gps: options.gps, storageBlocked: options.storageBlocked },
  );
  page = await context.newPage();
  page.on("pageerror", (error) => state.errors.push(error.message));
  await context.route("**/*", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (url.hostname === "static.line-scdn.net")
      return route.fulfill({
        contentType: "text/javascript",
        body: `window.liff={init:async()=>{},isLoggedIn:()=>true,getAccessToken:()=> 'synthetic-line',isInClient:()=>${!options.external},getProfile:()=>{throw Error('Profile must not be loaded')},closeWindow:()=>{window.closeCalls++},login:()=>{}};`,
      });
    if (url.origin !== base) return route.abort();
    if (url.pathname === "/api/attendance") {
      state.reads.push(url.search);
      if (options.panel) {
        assert.equal(url.search, "");
        state.readVersions.push(state.version);
        return route.fulfill({ json: panelSnapshot(state) });
      }
      assert.equal(url.search, "?view=clock");
      return route.fulfill({
        json: {
          memberId: state.memberId,
          working: state.working,
          version: state.version,
          sites: options.noSite
            ? []
            : [{ id: "site", name: "測試地點", latitude: 25, longitude: 121, radius: 100 }],
        },
      });
    }
    if (/^\/api\/attendance\/clock-(in|out)$/.test(url.pathname)) {
      assert.equal(request.method(), "POST");
      assert.equal(url.search, options.panel ? "" : "?view=clock");
      const body = request.postDataJSON();
      state.posts.push({ operation: url.pathname, body });
      if (state.reject)
        return route.fulfill({ status: state.reject, json: { error: "位置超出範圍" } });
      let receipt = receipts.get(body.requestId);
      if (!receipt) {
        assert.equal(body.expectedVersion, state.version);
        state.version++;
        state.working = url.pathname.endsWith("clock-in");
        receipt = options.panel
          ? { ...panelSnapshot(state), credited: 0.5, replayed: false }
          : { version: state.version, at: 1789000000000, credited: 0.5, replayed: false };
        receipts.set(body.requestId, receipt);
        if (options.panel && options.advanceBeforeReplay) {
          state.version++;
          state.working = false;
        }
      } else {
        assert.deepEqual(body, state.posts[0].body);
        receipt = { ...receipt, replayed: true };
      }
      if (state.loseResponse) {
        state.loseResponse = false;
        return route.abort();
      }
      return route.fulfill({ json: receipt });
    }
    if (url.pathname.startsWith("/api/")) throw new Error(`Unexpected API ${url.pathname}`);
    return route.continue();
  });
  return state;
}
async function finish(name, state) {
  assert.deepEqual(state.errors, []);
  results.push({ name, posts: state.posts.length, status: "passed" });
  if (output) {
    await page.screenshot({
      path: path.join(output, `auto-clock-${results.length}.png`),
      fullPage: true,
    });
    await context.tracing.stop({ path: path.join(output, `auto-clock-${results.length}.zip`) });
  }
  await context.close();
  context = undefined;
}
const retry = () => page.getByRole("button", { name: "重新確認並定位打卡", exact: true });
try {
  for (const [operation, working] of [
    ["clock-in", false],
    ["clock-out", true],
  ]) {
    const state = await fixture({ working });
    await page.goto(`${base}/attendance/${operation}`);
    await expect(page.getByRole("status")).toContainText("已記錄");
    assert.equal(state.posts.length, 1);
    assert.equal(await page.evaluate(() => window.closeCalls), 1);
    await page.reload();
    await expect(page.getByRole("status")).toContainText("已記錄");
    assert.equal(state.posts.length, 1);
    assert.equal(await page.evaluate(() => window.gpsCalls), 0);
    await finish(`${operation} saves once; reload only shows receipt`, state);
  }
  {
    const state = await fixture({ loseResponse: true });
    await page.goto(`${base}/attendance/clock-in`);
    const resend = page.getByRole("button", { name: "重試同一筆上班", exact: true });
    await expect(resend).toBeEnabled();
    await page.reload();
    await expect(resend).toBeEnabled();
    assert.equal(state.posts.length, 1);
    await resend.click();
    await expect(page.getByRole("status")).toContainText("已記錄");
    assert.equal(state.posts.length, 2);
    assert.deepEqual(state.posts[0], state.posts[1]);
    assert.equal(await page.evaluate(() => window.gpsCalls), 0);
    await finish("lost response survives reload and replays identical command", state);
  }
  for (const options of [
    { gps: "deny" },
    { storageBlocked: true },
    { noSite: true },
    { working: true },
  ]) {
    const state = await fixture(options);
    await page.goto(`${base}/attendance/clock-in`);
    await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
    assert.equal(state.posts.length, 0);
    assert.equal(await page.evaluate(() => window.closeCalls), 0);
    await finish(`refused before submit: ${JSON.stringify(options)}`, state);
  }
  {
    const state = await fixture({ reject: 422 });
    await page.goto(`${base}/attendance/clock-in`);
    await expect(page.getByRole("main").getByRole("alert")).toContainText("位置超出範圍");
    assert.equal(state.posts.length, 1);
    assert.equal(await page.evaluate(() => window.closeCalls), 0);
    await page.reload();
    await expect(retry()).toBeEnabled();
    assert.equal(state.posts.length, 1);
    await finish("server geofence rejection is not success or automatic retry", state);
  }
  {
    const state = await fixture({ gps: "hold" });
    await page.goto(`${base}/attendance/clock-in`);
    await expect.poll(() => page.evaluate(() => typeof window.releasePosition)).toBe("function");
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
      window.releasePosition();
    });
    await expect(page.getByRole("status")).toContainText("已暫停");
    await page.reload();
    await expect(retry()).toBeEnabled();
    assert.equal(state.posts.length, 0);
    assert.equal(await page.evaluate(() => window.gpsCalls), 0);
    await finish("background and reload never submit a delayed location", state);
  }
  {
    const state = await fixture({ loseResponse: true });
    await page.goto(`${base}/attendance/clock-in`);
    await expect(page.getByRole("button", { name: "重試同一筆上班", exact: true })).toBeEnabled();
    state.memberId = "member-b";
    state.working = false;
    state.version = 0;
    await page.reload();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("會員身分已變更");
    assert.equal(state.posts.length, 1);
    await expect(page.getByRole("button", { name: "重試同一筆上班", exact: true })).toHaveCount(0);
    await finish("another member cannot restore the pending command", state);
  }
  {
    const state = await fixture({ external: true });
    await page.goto(`${base}/attendance/clock-in`);
    await expect(retry()).toBeEnabled();
    assert.equal(state.posts.length, 0);
    await retry().click();
    await expect(page.getByRole("status")).toContainText("已記錄");
    assert.equal(state.posts.length, 1);
    assert.equal(await page.evaluate(() => window.closeCalls), 0);
    await finish("external browser requires confirmation and keeps receipt", state);
  }
  {
    const state = await fixture({ panel: true });
    await page.goto(`${base}/attendance`);
    await expect(page.getByRole("button", { name: "上班", exact: true })).toBeEnabled();
    assert.deepEqual(state.readVersions, [0]);
    await page.getByRole("button", { name: "上班", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("上班已記錄");
    assert.equal(state.posts.length, 1);
    assert.deepEqual(state.readVersions, [0], "new command snapshot must not trigger a GET");
    await finish("attendance panel applies a new command snapshot without rereading", state);
  }
  {
    const state = await fixture({ panel: true, loseResponse: true, advanceBeforeReplay: true });
    await page.goto(`${base}/attendance`);
    await page.getByRole("button", { name: "上班", exact: true }).click();
    const resend = page.getByRole("button", { name: "重送同一筆", exact: true });
    await expect(resend).toBeEnabled();
    await resend.click();
    await expect(page.getByRole("status")).toContainText("上班已記錄");
    assert.equal(state.posts.length, 2);
    assert.deepEqual(state.posts[0].body, state.posts[1].body);
    assert.deepEqual(
      state.readVersions,
      [0, 2],
      "replayed receipt must reread the current attendance snapshot",
    );
    await expect(page.getByRole("heading", { name: "尚未上班", exact: true })).toBeVisible();
    await finish("attendance panel replays an unknown command then rereads current state", state);
  }
  console.log(JSON.stringify(results, null, 2));
  if (output)
    writeFileSync(path.join(output, "auto-clock-results.json"), JSON.stringify(results, null, 2));
} catch (error) {
  if (output && page && context) {
    await page.screenshot({ path: path.join(output, "auto-clock-failure.png"), fullPage: true });
    await context.tracing.stop({ path: path.join(output, "auto-clock-failure.zip") });
  }
  throw error;
} finally {
  await context?.close();
  await browser.close();
}
