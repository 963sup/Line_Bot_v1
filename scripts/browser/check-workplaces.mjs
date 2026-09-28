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
) {
  throw new Error("Loopback origin required.");
}
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
const page = await context.newPage();
const errors = [];
const posts = [];
const receipts = new Map();
const repositoryId = "11111111-1111-4111-8111-111111111111";
let site = null;
let userId = "manager-a";
let capability = "admin";
let lose = false;

page.on("pageerror", (error) => errors.push(error.message));
await context.route("**/*", async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  if (url.hostname === "static.line-scdn.net") {
    return route.fulfill({
      contentType: "text/javascript",
      body: "window.liff={init:async()=>{},isLoggedIn:()=>true,getAccessToken:()=> 'synthetic',isInClient:()=>false,login:()=>{}};",
    });
  }
  if (url.origin !== target.origin) return route.abort();

  if (url.pathname === "/api/repositories") {
    return route.fulfill({
      json: {
        items: [
          {
            id: repositoryId,
            ownerLogin: "acme",
            name: "operations",
            capability,
          },
        ],
      },
    });
  }

  if (url.pathname === "/api/workplaces") {
    if (capability !== "admin") {
      return route.fulfill({
        status: 403,
        json: { error: "需要此 Repository 的 admin 權限。" },
      });
    }
    if (request.method() === "GET") {
      assert.equal(url.searchParams.get("id"), repositoryId);
      return route.fulfill({
        json: {
          userId,
          canCreate: true,
          sites: site ? [site] : [],
          next: null,
        },
      });
    }

    const command = request.postDataJSON();
    posts.push(command);
    assert.equal(command.action, "save");
    assert.equal(command.id, repositoryId);
    let result = receipts.get(command.requestId);
    if (!result) {
      site = {
        id: command.id,
        name: command.name,
        description: command.description,
        latitude: command.latitude,
        longitude: command.longitude,
        radius: command.radius,
        enabled: command.enabled,
        version: command.expectedVersion + 1,
      };
      result = { id: command.id, version: site.version };
      receipts.set(command.requestId, result);
    }
    if (lose) {
      lose = false;
      return route.abort();
    }
    return route.fulfill({ json: result });
  }

  if (url.pathname.startsWith("/api/")) {
    return route.fulfill({ status: 403, json: { error: "Synthetic denial" } });
  }
  return route.continue();
});

try {
  await page.goto(target.origin + "/acme/operations/settings/attendance");
  await expect(page.getByRole("heading", { name: "Attendance Location" })).toBeVisible();
  await page.getByLabel("地點名稱").fill("營運中心");
  await page.getByLabel("地址或位置說明").fill("一樓入口");
  await page.getByLabel("緯度", { exact: true }).fill("25");
  await page.getByLabel("經度", { exact: true }).fill("121");
  await page.getByLabel("啟用打卡點").check();

  lose = true;
  await page.getByRole("button", { name: "儲存打卡點" }).click();
  await expect(page.getByRole("button", { name: "重試原操作" })).toBeEnabled();
  assert.equal(posts.length, 1);

  await page.reload();
  await expect(page.getByRole("button", { name: "重試原操作" })).toBeEnabled();
  assert.equal(posts.length, 1);
  await page.getByRole("button", { name: "重試原操作" }).click();
  await expect(page.getByText("Repository 打卡點已更新。", { exact: true })).toBeVisible();
  assert.equal(posts.length, 2);
  assert.deepEqual(posts[0], posts[1], "retry must preserve request identity and payload");
  assert.equal(receipts.size, 1);

  userId = "manager-b";
  await page.getByLabel("地點名稱").fill("不得提交");
  const beforeIdentityChange = posts.length;
  await page.getByRole("button", { name: "儲存打卡點" }).click();
  await expect(page.getByRole("alert")).toContainText("帳號或 Repository 權限已變更");
  assert.equal(posts.length, beforeIdentityChange);

  userId = "manager-a";
  capability = "read";
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("Repository 的 admin 權限");
  await expect(page.getByRole("button", { name: "儲存打卡點" })).toHaveCount(0);

  assert.deepEqual(errors, []);
  if (output) {
    await page.screenshot({ path: path.join(output, "workplaces.png"), fullPage: true });
    await context.tracing.stop({ path: path.join(output, "workplaces-trace.zip") });
    writeFileSync(
      path.join(output, "workplaces-results.json"),
      JSON.stringify(
        {
          status: "passed",
          checks: ["repository scope", "identical retry", "account change", "access revocation"],
          posts: posts.length,
        },
        null,
        2,
      ),
    );
  }
  console.log("Repository Attendance Location browser checks passed.");
} catch (error) {
  if (output) {
    await page.screenshot({ path: path.join(output, "workplaces-failure.png"), fullPage: true });
    await context.tracing.stop({ path: path.join(output, "workplaces-failure.zip") });
  }
  throw error;
} finally {
  await context.close();
  await browser.close();
}
