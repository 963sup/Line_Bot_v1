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
let site = null,
  members = [],
  memberId = "manager-a",
  deny = false,
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
  if (url.pathname === "/api/workplaces") {
    if (deny) return route.fulfill({ status: 403, json: { error: "沒有工作地點管理權限。" } });
    if (req.method() === "GET")
      return route.fulfill({
        json: {
          memberId,
          canCreate: true,
          sites: site ? [site] : [],
          members: url.searchParams.get("id") ? members : [],
          next: null,
        },
      });
    const c = req.postDataJSON();
    posts.push(c);
    let result = receipts.get(c.requestId);
    if (!result) {
      if (c.action === "save") site = { ...c, version: (site?.version ?? 0) + 1 };
      else {
        members = c.allowed ? [{ id: c.memberId, status: "active" }] : [];
        site.version++;
      }
      result = { id: c.id, version: site.version };
      receipts.set(c.requestId, result);
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
  await page.goto(target.origin + "/admin/workplaces");
  await expect(page.getByRole("button", { name: "新增地點" })).toBeEnabled();
  await page.getByRole("button", { name: "新增地點" }).click();
  await page.getByLabel("地點名稱").fill("測試工作室");
  await page.getByLabel("地址或位置說明").fill("一樓入口");
  await page.getByLabel("緯度", { exact: true }).fill("25");
  await page.getByLabel("經度", { exact: true }).fill("121");
  await page.getByRole("button", { name: "儲存地點" }).click();
  await expect(page.getByRole("heading", { name: "可以打卡的人員" })).toBeVisible();
  assert.equal(posts.length, 1);
  await page.getByLabel("會員編號").fill("synthetic-member");
  lose = true;
  await page.getByRole("button", { name: "加入人員" }).click();
  await expect(page.getByRole("button", { name: "重試原操作" })).toBeEnabled();
  await page.getByRole("button", { name: "重試原操作" }).click();
  await expect(page.getByRole("listitem")).toContainText("synthetic-member");
  assert.deepEqual(posts[1], posts[2], "retry must preserve the original UUID and payload");
  if (output) await page.screenshot({ path: path.join(output, "workplaces.png"), fullPage: true });
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "移除人員" }).click();
  await expect(page.getByText("尚未加入人員，此地點目前無人可以打卡。")).toBeVisible();
  // A different account discovered at preflight cannot submit the previous account's form.
  await page.getByLabel("地點名稱").fill("不得提交");
  memberId = "manager-b";
  const before = posts.length;
  await page.getByRole("button", { name: "儲存地點" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "帳號已變更" })).toBeVisible();
  assert.equal(posts.length, before);
  deny = true;
  await page.getByRole("button", { name: "重新載入" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "管理權限" })).toBeVisible();
  await expect(page.getByRole("button", { name: "新增地點" })).toHaveCount(0);
  assert.deepEqual(errors, []);
  if (output) {
    await context.tracing.stop({ path: path.join(output, "workplaces-trace.zip") });
    writeFileSync(
      path.join(output, "workplaces-results.json"),
      JSON.stringify(
        {
          status: "passed",
          checks: [
            "create",
            "add member",
            "identical retry",
            "remove member",
            "account change",
            "permission denial",
          ],
          posts: posts.length,
        },
        null,
        2,
      ),
    );
  }
  console.log("Workplaces browser checks passed.");
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
