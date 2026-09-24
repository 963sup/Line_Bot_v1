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
let owner = "admin",
  canManage = true,
  grants = [],
  version = 0,
  lose = false;
page.on("pageerror", (e) => errors.push(e.message));
await context.route("**/*", async (route) => {
  const req = route.request(),
    url = new URL(req.url());
  if (url.hostname === "static.line-scdn.net")
    return route.fulfill({
      contentType: "text/javascript",
      body: "window.liff={init:async()=>{},isLoggedIn:()=>true,getAccessToken:()=> 'synthetic',isInClient:()=>false,login:()=>{}};",
    });
  if (url.origin !== target.origin) return route.abort();
  if (url.pathname === "/api/permissions") {
    if (req.method() === "POST") {
      const c = req.postDataJSON();
      posts.push(c);
      let result = receipts.get(c.requestId);
      if (!result) {
        version++;
        grants = c.enabled
          ? [
              {
                permission: c.permission,
                workplaceId: c.workplaceId,
                workplaceName: c.workplaceId ? "A 工地" : null,
                effective: true,
              },
            ]
          : [];
        result = { requestId: c.requestId, version };
        receipts.set(c.requestId, result);
      }
      if (lose) {
        lose = false;
        return route.abort();
      }
      return route.fulfill({ json: result });
    }
    const id = url.searchParams.get("target");
    if (id && !canManage)
      return route.fulfill({ status: 403, json: { error: "沒有權限管理資格。" } });
    return route.fulfill({
      json: {
        userId: owner,
        canManage,
        own: [],
        target: id ? { id, status: "active", version, grants } : null,
        history: [],
        moreHistory: false,
      },
    });
  }
  if (url.pathname.startsWith("/api/"))
    return route.fulfill({ status: 403, json: { error: "Synthetic denial" } });
  return route.continue();
});
try {
  await page.goto(new URL("/admin/permissions", target).href);
  await page.getByLabel("使用者 ID", { exact: true }).fill("worker");
  await page.getByRole("button", { name: "查詢使用者權限" }).click();
  await expect(page.getByRole("heading", { name: "使用者 worker", exact: true })).toBeVisible();
  await page.getByLabel("指定地點編號").fill("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  await page.getByLabel("原因", { exact: true }).fill("負責 A 工地人員與地點");
  await expect(page.getByRole("button", { name: "確認變更" })).toBeDisabled();
  await page.getByLabel("我已核對使用者、功能與範圍").check();
  lose = true;
  await page.getByRole("button", { name: "確認變更" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "重試原操作" })).toBeVisible();
  await page.getByRole("button", { name: "重試原操作" }).click();
  await expect(page.getByText("權限已更新。", { exact: true })).toBeVisible();
  assert.equal(posts.length, 2);
  assert.deepEqual(posts[0], posts[1]);
  assert.equal(receipts.size, 1);
  await expect(page.getByRole("listitem").filter({ hasText: "A 工地" })).toBeVisible();
  if (output) await page.screenshot({ path: path.join(output, "permissions.png"), fullPage: true });
  await page.getByLabel("指定地點編號").fill("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  await page.getByLabel("操作", { exact: true }).selectOption("revoke");
  await page.getByLabel("原因", { exact: true }).fill("調離地點");
  await page.getByLabel("我已核對使用者、功能與範圍").check();
  await page.getByRole("button", { name: "確認變更" }).click();
  await expect(page.getByText("尚無業務管理權限。", { exact: true })).toBeVisible();
  assert.equal(posts.at(-1).enabled, false);
  await page.getByLabel("使用者 ID", { exact: true }).fill("admin");
  await page.getByRole("button", { name: "查詢使用者權限" }).click();
  await expect(
    page.getByText("不能修改自己的業務權限，請由另一位權限管理員處理。", { exact: true }),
  ).toBeVisible();
  const before = posts.length;
  owner = "ordinary";
  canManage = false;
  await page.getByRole("button", { name: "重新載入", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("沒有權限管理資格");
  await expect(page.getByRole("heading", { name: "使用者 admin", exact: true })).toHaveCount(0);
  await page.goto(new URL("/admin", target).href);
  await expect(page.getByRole("link", { name: "我的權限" })).toBeVisible();
  await expect(page.getByRole("link", { name: /^權限管理/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^工作地點/ })).toHaveCount(0);
  assert.equal(posts.length, before);
  assert.deepEqual(errors, []);
  if (output) {
    await context.tracing.stop({ path: path.join(output, "permissions-trace.zip") });
    writeFileSync(
      path.join(output, "permissions-results.json"),
      JSON.stringify(
        {
          status: "passed",
          checks: [
            "explicit confirmation",
            "scoped grant",
            "persistent identical retry",
            "revoke",
            "self change denied",
            "account change clears data",
            "navigation by permission",
          ],
          posts: posts.length,
        },
        null,
        2,
      ),
    );
  }
  console.log("Permissions browser checks passed.");
} catch (error) {
  if (output) {
    await page.screenshot({ path: path.join(output, "permissions-failure.png"), fullPage: true });
    await context.tracing.stop({ path: path.join(output, "permissions-failure.zip") });
  }
  throw error;
} finally {
  await context.close();
  await browser.close();
}
