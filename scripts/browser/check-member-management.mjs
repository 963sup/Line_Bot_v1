import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const load = process.env.PLAYWRIGHT_PACKAGE_PATH
  ? (n) => require(path.join(process.env.PLAYWRIGHT_PACKAGE_PATH, n))
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
  throw Error("Loopback origin required");
const output = process.env.NAVIGATION_ARTIFACT_DIR;
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
page.on("pageerror", (e) => errors.push(e.message));
let deny = false,
  fail = false,
  canSuspend = true,
  actorId = "admin",
  lose = false,
  conflict = false;
const user = {
  id: "target",
  status: "active",
  createdAt: 0,
  version: 1,
  googleLinked: true,
  restoreStatus: "active",
};
await context.route("**/*", async (route) => {
  const url = new URL(route.request().url());
  if (url.hostname === "static.line-scdn.net")
    return route.fulfill({
      contentType: "text/javascript",
      body: "window.liff={init:async()=>{},isLoggedIn:()=>true,getAccessToken:()=> 'synthetic',isInClient:()=>false,login:()=>{}};",
    });
  if (url.origin !== target.origin) return route.abort();
  if (url.pathname === "/api/membership/manage") {
    if (deny) return route.fulfill({ status: 403, json: { error: "無會員管理權限" } });
    if (fail) return route.fulfill({ status: 503, json: { error: "會員服務失敗" } });
    if (route.request().method() === "POST") {
      const command = route.request().postDataJSON();
      posts.push(command);
      if (conflict)
        return route.fulfill({
          status: 409,
          json: { error: "會員狀態已更新，請重新讀取後確認。" },
        });
      let receipt = receipts.get(command.requestId);
      if (!receipt) {
        user.status = command.action === "suspend" ? "suspended" : "active";
        user.version++;
        receipt = {
          id: user.id,
          status: user.status,
          version: user.version,
          requestId: command.requestId,
          at: 1000,
        };
        receipts.set(command.requestId, receipt);
      }
      if (lose) {
        lose = false;
        return route.abort();
      }
      return route.fulfill({ json: receipt });
    }
    const id = url.searchParams.get("id"),
      after = url.searchParams.get("after"),
      status = url.searchParams.get("status");
    if (id && id !== user.id)
      return route.fulfill({ status: 404, json: { error: "會員不存在。" } });
    return route.fulfill({
      json: {
        actorId,
        canSuspend,
        users:
          status && status !== user.status ? [] : [after ? { ...user, id: "target-two" } : user],
        next: id || after || status ? null : "target",
        detail: id
          ? {
              user,
              events: [],
              moreEvents: false,
              operations: [],
              moreOperations: false,
              openAttendance: ["attendance-example"],
              unfinishedIssues: ["issue-example"],
              unfinishedIssueCount: 1,
            }
          : null,
      },
    });
  }
  if (url.pathname.startsWith("/api/"))
    return route.fulfill({ status: 403, json: { error: "Synthetic denial" } });
  return route.continue();
});
async function openDetail() {
  await page.getByRole("button", { name: "查看 target", exact: true }).click();
  await expect(page.getByRole("heading", { name: "會員明細" })).toBeVisible();
}
async function confirm(label) {
  await page.getByLabel("操作原因").fill("核實狀態");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: label, exact: true }).click();
}
try {
  await page.goto(`${target.origin}/admin/members`);
  await expect(page.getByRole("heading", { name: "會員列表" })).toBeVisible();
  await page.getByLabel("會員編號", { exact: true }).fill("missing-member");
  await page.getByRole("button", { name: "查詢", exact: true }).click();
  await expect(page.getByText("會員不存在。", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "清除查詢條件", exact: true }).click();
  await expect(page.getByRole("heading", { name: "會員列表" })).toBeVisible();
  await page.getByRole("button", { name: "下一頁", exact: true }).click();
  await expect(page.getByRole("heading", { name: "target-two", exact: true })).toBeVisible();
  await page.getByRole("combobox").selectOption("paused");
  await page.getByRole("button", { name: "查詢", exact: true }).click();
  await expect(page.getByText("沒有符合條件的會員。")).toBeVisible();
  await expect(page.getByRole("combobox")).toHaveValue("paused");
  await page.getByLabel("會員編號", { exact: true }).fill("target");
  await page.getByRole("button", { name: "查詢", exact: true }).click();
  await expect(page.getByText("attendance-example", { exact: true })).toBeVisible();
  await expect(page.getByText("issue-example", { exact: true })).toBeVisible();
  if (output)
    await page.screenshot({
      path: path.join(output, "member-management-mobile.png"),
      fullPage: true,
    });
  lose = true;
  await confirm("確認停權");
  await expect(page.getByRole("button", { name: "重試原操作" })).toBeEnabled();
  assert.equal(posts.length, 1);
  await page.reload();
  await expect(page.getByRole("button", { name: "重試原操作" })).toBeEnabled();
  assert.equal(posts.length, 1);
  await page.getByRole("button", { name: "重試原操作" }).click();
  await expect(page.getByText(/已完成：已停權/)).toBeVisible();
  assert.deepEqual(posts[0], posts[1]);
  assert.equal(receipts.size, 1);
  await confirm("確認解除停權");
  await expect(page.getByText(/已完成：使用中/)).toBeVisible();
  assert.equal(user.status, "active");
  conflict = true;
  await confirm("確認停權");
  await expect(page.getByText("會員狀態已更新，請重新讀取後確認。", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "會員明細" })).toHaveCount(0);
  conflict = false;
  await page.getByRole("button", { name: "重新讀取", exact: true }).click();
  await expect(page.getByRole("heading", { name: "會員明細" })).toBeVisible();
  actorId = "other";
  const count = posts.length;
  await confirm("確認停權");
  await expect(
    page.getByText("LINE 身分已變更，請重新讀取後確認。", { exact: true }),
  ).toBeVisible();
  assert.equal(posts.length, count);
  actorId = "admin";
  canSuspend = false;
  await page.getByRole("button", { name: "重新讀取", exact: true }).click();
  await expect(page.getByText("目前只有會員查詢權限。")).toBeVisible();
  await expect(page.getByRole("button", { name: "確認停權" })).toHaveCount(0);
  deny = true;
  await page.getByRole("button", { name: "重新讀取", exact: true }).click();
  await expect(page.getByText("無會員管理權限", { exact: true })).toBeVisible();
  await expect(page.getByText("attendance-example", { exact: true })).toHaveCount(0);
  deny = false;
  fail = true;
  await page.getByRole("button", { name: "重新讀取", exact: true }).click();
  await expect(page.getByText("會員服務失敗", { exact: true })).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "重新讀取", exact: true }).click();
  await expect(page.getByRole("heading", { name: "會員明細" })).toBeVisible();
  await page.getByRole("button", { name: "返回會員列表", exact: true }).click();
  await expect(page.getByRole("heading", { name: "會員列表" })).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 900 });
  await openDetail();
  if (output)
    await page.screenshot({
      path: path.join(output, "member-management-desktop.png"),
      fullPage: true,
    });
  await page.getByRole("link", { name: "← 返回", exact: true }).click();
  await expect(page.getByRole("heading", { name: "管理後台" })).toBeVisible();
  assert.deepEqual(errors, []);
  console.log(
    "Member management browser passed: lookup, paging, suspension, recovery, original retry, role and identity rejection.",
  );
} finally {
  if (output)
    await context.tracing.stop({ path: path.join(output, "member-management-trace.zip") });
  await browser.close();
}
