import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const load = process.env.PLAYWRIGHT_PACKAGE_PATH
  ? (name) => require(path.join(process.env.PLAYWRIGHT_PACKAGE_PATH, name))
  : require;
const { chromium } = load("playwright"),
  { expect } = load("playwright/test");
const target = new URL(process.env.NAVIGATION_BASE ?? "http://127.0.0.1:4117");
if (
  target.protocol !== "http:" ||
  !["127.0.0.1", "localhost", "[::1]"].includes(target.hostname) ||
  target.pathname !== "/" ||
  target.search ||
  target.hash
)
  throw new Error("Loopback origin required.");
const output = process.env.NAVIGATION_ARTIFACT_DIR;
if (output) mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  channel: process.env.NAVIGATION_BROWSER_CHANNEL || undefined,
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  serviceWorkers: "block",
});
if (output) await context.tracing.start({ screenshots: true, snapshots: true });
const page = await context.newPage(),
  errors = [],
  posts = [],
  receipts = new Map();
let address = null,
  version = 1,
  actorUserId = "owner",
  capability = "admin",
  member = true,
  lose = false;
page.on("pageerror", (error) => errors.push(error.message));
await context.route("**/*", async (route) => {
  const request = route.request(),
    url = new URL(request.url());
  if (url.hostname === "static.line-scdn.net")
    return route.fulfill({
      contentType: "text/javascript",
      body: "window.liff={init:async()=>{},isLoggedIn:()=>true,getAccessToken:()=> 'synthetic',isInClient:()=>false,login:()=>{}};",
    });
  if (url.origin !== target.origin) return route.abort();
  if (url.pathname === "/api/repository-address") {
    if (request.method() === "GET") {
      assert.equal(url.searchParams.get("owner"), "alice");
      assert.equal(url.searchParams.get("name"), "Operations");
      if (!member)
        return route.fulfill({
          status: 403,
          json: { error: "目前不是此 Repository 的有效成員。" },
        });
      return route.fulfill({
        json: {
          repository: {
            id: "repo",
            actorUserId,
            ownerLogin: "alice",
            name: "Operations",
            version,
            actorCapability: capability,
          },
          address,
        },
      });
    }
    const command = request.postDataJSON();
    posts.push(command);
    let result = receipts.get(command.requestId);
    if (!result) {
      if (capability !== "admin")
        return route.fulfill({
          status: 403,
          json: { error: "需要 Repository admin 才能管理地址。" },
        });
      assert.equal(command.expectedVersion, version);
      address = command.action === "set" ? command.address : null;
      version += 1;
      const receiptAddress = address
        ? {
            radius: address.radius,
            longitude: address.longitude,
            address: address.address,
            latitude: address.latitude,
          }
        : null;
      result = {
        requestId: command.requestId,
        repositoryId: "repo",
        address: receiptAddress,
        version,
        at: 1000,
      };
      receipts.set(command.requestId, result);
    }
    if (lose) {
      lose = false;
      return route.abort();
    }
    return route.fulfill({ json: result });
  }
  if (url.pathname.startsWith("/api/"))
    return route.fulfill({ status: 403, json: { error: "Synthetic denial" } });
  return route.continue();
});
try {
  await page.goto(new URL("/alice/Operations/settings", target).href);
  await expect(page.getByRole("heading", { name: "alice/Operations" })).toBeVisible();
  await page.getByLabel("地址", { exact: true }).fill("台北市信義區市府路 1 號");
  await page.getByLabel("緯度", { exact: true }).fill("25.0375");
  await page.getByLabel("經度", { exact: true }).fill("121.5637");
  await page.getByLabel("打卡半徑（公尺）", { exact: true }).fill("100");
  lose = true;
  await page.getByRole("button", { name: "儲存打卡點" }).click();
  await expect(page.getByRole("button", { name: "重試原操作" })).toBeEnabled();
  assert.equal(posts.length, 1);

  await page.reload();
  await expect(page.getByRole("button", { name: "重試原操作" })).toBeEnabled();
  assert.equal(posts.length, 1);
  await page.getByRole("button", { name: "重試原操作" }).click();
  await expect(page.getByText("打卡點已更新。", { exact: true })).toBeVisible();
  assert.deepEqual(posts[1], posts[0], "retry must preserve the original UUID and payload");
  assert.equal(receipts.size, 1);
  await expect(page.getByLabel("地址", { exact: true })).toHaveValue("台北市信義區市府路 1 號");

  const postsBeforeWrongRepository = posts.length;
  await page.evaluate(() => {
    sessionStorage.setItem(
      "repository-address:alice/operations",
      JSON.stringify({
        owner: "owner",
        command: {
          action: "remove",
          requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          repositoryId: "another-repository",
          expectedVersion: 2,
        },
      }),
    );
  });
  await page.reload();
  await expect(page.getByRole("heading", { name: "alice/Operations" })).toBeVisible();
  await expect(page.getByRole("button", { name: "重試原操作" })).toHaveCount(0);
  assert.equal(posts.length, postsBeforeWrongRepository);

  await page.getByLabel("打卡半徑（公尺）", { exact: true }).fill("120");
  lose = true;
  await page.getByRole("button", { name: "儲存打卡點" }).click();
  await expect(page.getByRole("button", { name: "重試原操作" })).toBeEnabled();
  const postsBeforeIdentityChange = posts.length;
  actorUserId = "other-owner";
  await page.reload();
  await expect(page.getByRole("heading", { name: "alice/Operations" })).toBeVisible();
  await expect(page.getByRole("button", { name: "重試原操作" })).toHaveCount(0);
  assert.equal(posts.length, postsBeforeIdentityChange);
  actorUserId = "owner";
  await page.reload();

  capability = "read";
  await page.reload();
  await expect(page.getByText(/台北市信義區市府路 1 號 · 120 公尺/)).toBeVisible();
  await expect(page.getByRole("button", { name: "儲存打卡點" })).toHaveCount(0);
  if (output)
    await page.screenshot({
      path: path.join(output, "repository-address-member.png"),
      fullPage: true,
    });

  member = false;
  await page.reload();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "目前不是此 Repository 的有效成員",
  );
  await expect(page.getByText("台北市信義區市府路 1 號", { exact: false })).toHaveCount(0);

  member = true;
  capability = "admin";
  await page.reload();
  await page.getByRole("button", { name: "移除打卡點" }).click();
  await expect(page.getByText("打卡點已移除。", { exact: true })).toBeVisible();
  await expect(page.getByLabel("地址", { exact: true })).toHaveValue("");
  assert.equal(posts.at(-1).action, "remove");
  assert.deepEqual(errors, []);
  if (output) {
    await page.screenshot({
      path: path.join(output, "repository-address-admin.png"),
      fullPage: true,
    });
    await context.tracing.stop({ path: path.join(output, "repository-address-trace.zip") });
    writeFileSync(
      path.join(output, "repository-address-results.json"),
      JSON.stringify(
        {
          status: "passed",
          checks: [
            "save address",
            "persistent identical retry",
            "wrong Repository pending operation rejected",
            "pending operation cleared on actor change",
            "effective member read",
            "removed member denied",
            "remove address",
          ],
          posts: posts.length,
        },
        null,
        2,
      ),
    );
  }
  console.log("Repository address browser checks passed.");
} catch (error) {
  if (output) {
    await page.screenshot({
      path: path.join(output, "repository-address-failure.png"),
      fullPage: true,
    });
    await context.tracing.stop({ path: path.join(output, "repository-address-failure.zip") });
  }
  throw error;
} finally {
  await context.close();
  await browser.close();
}
