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
const checkInPolicy = {
  version: "wheel-v1",
  totalWeight: 100,
  prizes: [
    { code: "coin-half", amount: 0.5, weight: 60 },
    { code: "coin-one", amount: 1, weight: 30 },
    { code: "coin-four", amount: 4, weight: 10 },
  ],
};
const claimFixtures = {
  "coin-half": {
    day: "2026-09-10",
    prizeCode: "coin-half",
    reward: 0.5,
    policyVersion: "wheel-v1",
    decidedAt: "2026-09-10T01:00:00.000Z",
  },
  "coin-one": {
    day: "2026-09-10",
    prizeCode: "coin-one",
    reward: 1,
    policyVersion: "wheel-v1",
    decidedAt: "2026-09-10T01:01:00.000Z",
  },
  "coin-four": {
    day: "2026-09-10",
    prizeCode: "coin-four",
    reward: 4,
    policyVersion: "wheel-v1",
    decidedAt: "2026-09-10T01:02:00.000Z",
  },
};
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
async function fixture(status = "active", signedIn = false, profileMode = "ready", options = {}) {
  context = await browser.newContext({
    viewport: options.viewport ?? { width: 390, height: 844 },
    reducedMotion: options.reducedMotion ?? "no-preference",
    serviceWorkers: "block",
  });
  if (output) await context.tracing.start({ screenshots: true, snapshots: true });
  page = await context.newPage();
  const state = {
    documents: 0,
    errors: [],
    posts: [],
    checkInPosts: [],
    recoveryReads: [],
    reads: [],
    status,
    linked: null,
    hold: false,
    release: null,
    pending: null,
    stages: [],
    liffRequests: 0,
    day: options.day ?? "2026-09-10",
    balance: options.balance ?? 10,
    claims: new Map(
      options.claim
        ? [[options.claim.day, { ...options.claim }]]
        : options.claimedToday
          ? [["2026-09-10", { ...claimFixtures["coin-one"] }]]
          : [],
    ),
    nextClaims: (options.nextClaims ?? [{ ...claimFixtures["coin-one"] }]).map((claim) => ({
      ...claim,
    })),
    failCheckInBeforeCommit: options.failCheckInBeforeCommit ?? false,
    dropCheckInBeforeCommit: options.dropCheckInBeforeCommit ?? false,
    failCheckInAfterCommit: options.failCheckInAfterCommit ?? false,
    recoveryFailuresRemaining: options.recoveryFailures ?? 0,
    dayAfterCommit: options.dayAfterCommit ?? null,
  };
  const coins = (day = state.day) => {
    const claim = state.claims.get(day) ?? null;
    return {
      balance: state.balance,
      day: state.day,
      claimedToday: Boolean(state.claims.get(state.day)),
      claim: state.claims.get(state.day) ?? null,
      policy: checkInPolicy,
    };
  };
  const member = () =>
    state.status
      ? {
          id: "synthetic-line",
          status: state.status,
          googleEmail: state.linked,
          coins: coins(),
        }
      : null;
  const checkInResponse = (claim, credited, replayed) => ({
    member: member(),
    checkIn: {
      claim,
      credited,
      replayed,
      coins: coins(),
    },
  });
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
      const checkInDay = target.searchParams.get("checkInDay");
      const candidate =
        request.headers().authorization === `Bearer ${session("second").access_token}`
          ? "second@example.test"
          : "first@example.test";
      if (request.method() === "POST") {
        const body = request.postDataJSON();
        state.posts.push(body);
        if (body.action === "checkIn") {
          state.checkInPosts.push(body);
          if (state.dropCheckInBeforeCommit) {
            state.dropCheckInBeforeCommit = false;
            return route.fulfill({ status: 502, json: { error: "連線中斷，請確認結果。" } });
          }
          if (state.failCheckInBeforeCommit) {
            return route.fulfill({ status: 403, json: { error: "今日簽到尚未提交。" } });
          }
          if (!body.expectedDay || body.expectedDay !== state.day) {
            return route.fulfill({ status: 409, json: { error: "簽到日期已更新，請重新整理。" } });
          }
          const replayed = state.claims.has(body.expectedDay);
          const claim = state.claims.get(body.expectedDay) ?? {
            ...(state.nextClaims.shift() ?? claimFixtures["coin-one"]),
            day: body.expectedDay,
          };
          if (!replayed) {
            state.claims.set(body.expectedDay, claim);
            state.balance += claim.reward;
          }
          if (state.failCheckInAfterCommit) {
            if (state.dayAfterCommit) state.day = state.dayAfterCommit;
            return route.fulfill({ status: 502, json: { error: "回應遺失，請讀回結果。" } });
          }
          return route.fulfill({
            json: checkInResponse(claim, replayed ? 0 : claim.reward, replayed),
          });
        }
        state.linked = candidate;
      } else state.reads.push({ google, authorization: request.headers().authorization });
      if (checkInDay) {
        state.recoveryReads.push(checkInDay);
        if (state.recoveryFailuresRemaining > 0) {
          state.recoveryFailuresRemaining -= 1;
          return route.fulfill({ status: 502, json: { error: "讀回結果暫時失敗。" } });
        }
        return route.fulfill({ json: { claim: state.claims.get(checkInDay) ?? null } });
      }
      if (state.hold) {
        state.hold = false;
        await new Promise((resolve) => {
          state.release = resolve;
        });
      }
      return route.fulfill({
        json: {
          member: member(),
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
const dialog = () => page.getByRole("dialog", { name: "每日簽到轉盤" });
const resultLookupButton = () =>
  dialog().getByRole("button", { name: "讀取原簽到結果", exact: true });
const main = () => page.getByRole("main");
async function closeDialogWithKeyboard() {
  await expect(dialog()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog()).toHaveCount(0);
}
async function assertNoHorizontalOverflow() {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    )
    .toBeLessThanOrEqual(1);
}
async function openCheckInResult() {
  await expect(dialog()).toBeVisible();
  await expect(dialog()).toContainText(/抽中|已領取|尚未回來/);
}
async function assertWheelMarker(claim) {
  const amount = claim.reward.toLocaleString("zh-TW", { maximumFractionDigits: 1 });
  await expect(
    dialog().getByRole("img", { name: `轉盤結果 ${amount} Coin`, exact: true }),
  ).toBeVisible();
  await expect(dialog().locator("[data-prize-code]")).toHaveAttribute(
    "data-prize-code",
    claim.prizeCode,
  );
}
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

  for (const [from, label, to, status, action] of [
    ["/membership/register", "恢復會員功能", "/membership/restore", "paused", "restore"],
    ["/membership/restore", "註冊會員", "/membership/register", null, "register"],
    [
      "/expenses?expense=33333333-3333-4333-8333-333333333333",
      "前往帳號設定",
      "/settings",
      null,
      "refresh",
    ],
    ["/auth/callback?error=access_denied", "返回帳號設定", "/settings", null, "refresh"],
  ]) {
    const state = await fixture(status);
    await page.goto(base + from);
    await link(label).click();
    await expect(page).toHaveURL(base + to);
    if (action === "register") {
      await expect(button("確認註冊")).toBeDisabled();
      await page.getByLabel("Login", { exact: true }).fill("synthetic-member");
      await expect(button("確認註冊")).toBeEnabled();
    } else if (action === "restore") {
      await expect(button("確認恢復")).toBeEnabled();
    } else {
      await expect(button("重新整理狀態")).toBeEnabled();
    }
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
  for (const prizeCode of ["coin-half", "coin-one", "coin-four"]) {
    const claim = { ...claimFixtures[prizeCode] };
    const state = await fixture("active", false, "ready", {
      nextClaims: [claim],
      reducedMotion: "no-preference",
    });
    await page.goto(base + "/settings");
    await expect(main()).toContainText("每日簽到轉盤");
    await expect(main()).toContainText("0.5 Coin");
    await expect(main()).toContainText("60%");
    await expect(main()).toContainText("1 Coin");
    await expect(main()).toContainText("30%");
    await expect(main()).toContainText("4 Coin");
    await expect(main()).toContainText("10%");
    await button("簽到並轉動轉盤").click();
    await openCheckInResult();
    await expect(dialog()).toContainText(
      `2026-09-10 抽中 ${claim.reward.toLocaleString("zh-TW", { maximumFractionDigits: 1 })} Coin`,
    );
    await assertWheelMarker(claim);
    await expect(dialog().getByRole("status").locator("strong")).toContainText(
      `${claim.reward.toLocaleString("zh-TW", { maximumFractionDigits: 1 })} Coin`,
    );
    assert.deepEqual(state.checkInPosts, [{ action: "checkIn", expectedDay: "2026-09-10" }]);
    assert.equal(state.recoveryReads.length, 0);
    if (prizeCode === "coin-four" && output)
      await dialog().screenshot({
        path: path.join(output, "membership-wheel-coin-four.png"),
      });
    await button("關閉").click();
    await expect(button("查看今日簽到結果")).toBeEnabled();
    await finish(`Daily wheel awards ${prizeCode}`, state);
  }
  {
    const claim = { ...claimFixtures["coin-four"] };
    const state = await fixture("active", false, "ready", {
      claim,
      claimedToday: true,
      reducedMotion: "reduce",
    });
    await page.goto(base + "/settings");
    await expect(button("查看今日簽到結果")).toBeEnabled();
    await page.reload();
    await expect(button("查看今日簽到結果")).toBeEnabled();
    await button("查看今日簽到結果").click();
    await expect(dialog()).toContainText("2026-09-10 抽中 4 Coin");
    await assertWheelMarker(claim);
    assert.equal(state.checkInPosts.length, 0);
    await closeDialogWithKeyboard();
    await expect(button("查看今日簽到結果")).toBeFocused();
    await finish("Claimed check-in reopens without a second POST", state);
  }
  {
    const state = await fixture("active", false, "ready", {
      nextClaims: [{ ...claimFixtures["coin-one"] }],
      dropCheckInBeforeCommit: true,
      reducedMotion: "reduce",
    });
    await page.goto(base + "/settings");
    await button("簽到並轉動轉盤").click();
    await expect(dialog()).toContainText("尚無已完成的簽到");
    assert.equal(state.checkInPosts.length, 1);
    assert.deepEqual(state.recoveryReads, ["2026-09-10"]);
    await button("重新送出原日簽到").click();
    await expect(dialog()).toContainText("2026-09-10 抽中 1 Coin");
    await assertWheelMarker(claimFixtures["coin-one"]);
    assert.deepEqual(state.checkInPosts, [
      { action: "checkIn", expectedDay: "2026-09-10" },
      { action: "checkIn", expectedDay: "2026-09-10" },
    ]);
    await finish("Uncommitted request can explicitly retry original day", state);
  }
  {
    const state = await fixture("active", false, "ready", {
      nextClaims: [{ ...claimFixtures["coin-half"] }],
      failCheckInAfterCommit: true,
      dayAfterCommit: "2026-09-11",
      reducedMotion: "reduce",
    });
    await page.goto(base + "/settings");
    await button("簽到並轉動轉盤").click();
    await openCheckInResult();
    await expect(dialog()).toContainText("2026-09-10 抽中 0.5 Coin");
    await assertWheelMarker(claimFixtures["coin-half"]);
    await expect(main()).toContainText("已讀回今日簽到結果，未重新抽獎。");
    assert.deepEqual(state.checkInPosts, [{ action: "checkIn", expectedDay: "2026-09-10" }]);
    assert.deepEqual(state.recoveryReads, ["2026-09-10"]);
    await finish("Committed check-in loss recovers original day across midnight", state);
  }
  {
    const state = await fixture("active", false, "ready", {
      failCheckInBeforeCommit: true,
      reducedMotion: "reduce",
    });
    await page.goto(base + "/settings");
    assert.equal(state.checkInPosts.length, 0, "Check-in must not auto POST on load");
    await button("簽到並轉動轉盤").click();
    await expect(dialog()).toContainText("今日簽到尚未提交。");
    await expect(main()).toContainText("今日簽到尚未提交。");
    await expect(dialog()).not.toContainText("今日簽到結果尚未回來");
    await expect(dialog()).not.toContainText("抽中");
    await expect(dialog().getByRole("status").locator("strong")).toHaveCount(0);
    assert.deepEqual(state.checkInPosts, [{ action: "checkIn", expectedDay: "2026-09-10" }]);
    assert.equal(state.recoveryReads.length, 0);
    await finish("Rejected check-in shows rejection without awarding", state);
  }
  {
    const state = await fixture("active", false, "ready", {
      nextClaims: [{ ...claimFixtures["coin-half"] }],
      failCheckInAfterCommit: true,
      recoveryFailures: 1,
      dayAfterCommit: "2026-09-11",
      reducedMotion: "reduce",
    });
    await page.goto(base + "/settings");
    await button("簽到並轉動轉盤").click();
    await expect(dialog()).toContainText("簽到請求未確認；目前沒有可顯示的入帳結果。");
    await expect(resultLookupButton()).toBeEnabled();
    assert.deepEqual(state.checkInPosts, [{ action: "checkIn", expectedDay: "2026-09-10" }]);
    assert.deepEqual(state.recoveryReads, ["2026-09-10"]);
    await resultLookupButton().click();
    await expect(dialog()).toContainText("2026-09-10 抽中 0.5 Coin");
    await assertWheelMarker(claimFixtures["coin-half"]);
    assert.deepEqual(state.checkInPosts, [{ action: "checkIn", expectedDay: "2026-09-10" }]);
    assert.deepEqual(state.recoveryReads, ["2026-09-10", "2026-09-10"]);
    await finish("Unknown check-in retry reads original day without second POST", state);
  }
  for (const width of [320, 390]) {
    const state = await fixture("active", false, "ready", {
      nextClaims: [{ ...claimFixtures["coin-one"] }],
      reducedMotion: "reduce",
      viewport: { width, height: 844 },
    });
    await page.goto(base + "/settings");
    await assertNoHorizontalOverflow();
    await button("簽到並轉動轉盤").click();
    await openCheckInResult();
    await assertNoHorizontalOverflow();
    await button("關閉").click();
    await finish(`Reduced-motion wheel fits ${width}px viewport`, state);
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
