import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
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
  errors = [];
let deny = false,
  fail = false,
  pending;
let savedPartner = null,
  lose = false,
  memberId = "synthetic",
  conflict = false;
const posts = [],
  receipts = new Map();
page.on("pageerror", (error) => errors.push(error.message));
await context.route("**/*", async (route) => {
  const url = new URL(route.request().url());
  if (url.hostname === "static.line-scdn.net")
    return route.fulfill({
      contentType: "text/javascript",
      body: "window.testToken='one';window.liff={init:async()=>{},isLoggedIn:()=>true,getAccessToken:()=>window.testToken,isInClient:()=>false,login:()=>{}};",
    });
  if (url.origin !== target.origin) return route.abort();
  if (url.pathname === "/api/partners") {
    if (route.request().method() === "POST") {
      const command = route.request().postDataJSON();
      posts.push(command);
      assert.equal(command.action, "save-partner");
      if (conflict)
        return route.fulfill({ status: 409, json: { error: "資料已更新，請重新讀取後再編輯。" } });
      let result = receipts.get(command.requestId);
      if (!result) {
        result = {
          id: command.id,
          version: command.expectedVersion + 1,
          at: 1000,
          requestId: command.requestId,
        };
        receipts.set(command.requestId, result);
        savedPartner = {
          ...command,
          version: result.version,
          contacts: command.contacts.map((c) => ({ ...c, partnerId: command.id })),
        };
      }
      if (lose) {
        lose = false;
        return route.abort();
      }
      return route.fulfill({ json: result });
    }
    assert.equal(url.searchParams.get("view"), "manage");
    if (pending) {
      const resolve = pending;
      pending = undefined;
      await new Promise((done) => resolve(done));
    }
    if (deny) return route.fulfill({ status: 403, json: { error: "需要合作夥伴管理權限。" } });
    if (fail) return route.fulfill({ status: 503, json: { error: "服務暫不可用。" } });
    const second = url.searchParams.has("after");
    return route.fulfill({
      json: {
        memberId,
        canReview: false,
        news: [],
        referrals: [],
        next: savedPartner || second ? null : "cursor",
        partners: savedPartner
          ? [savedPartner]
          : [
              {
                id: second ? "p2" : "p1",
                name: second ? "第二頁夥伴" : "測試合作夥伴",
                category: "設備維修",
                region: "台北",
                status: "unlisted",
                version: 1,
                contacts: [
                  {
                    id: "c1",
                    partnerId: "p1",
                    name: "測試窗口",
                    responsibility: "設備聯繫",
                    phone: "",
                    email: "",
                    line: "test-contact",
                    status: "unlisted",
                  },
                ],
              },
            ],
      },
    });
  }
  if (url.pathname.startsWith("/api/"))
    return route.fulfill({ status: 403, json: { error: "Synthetic denial" } });
  return route.continue();
});
try {
  await page.goto(target.origin + "/admin/groups");
  await expect(page.getByRole("heading", { name: "測試合作夥伴（已下架）" })).toBeVisible();
  await page.getByText("窗口與聯繫方式（1）", { exact: true }).click();
  await expect(page.getByText("test-contact", { exact: true })).toBeVisible();
  if (output)
    await page.screenshot({
      path: path.join(output, "partner-management-mobile.png"),
      fullPage: true,
    });
  await page.getByRole("button", { name: "下一頁" }).click();
  await expect(page.getByRole("heading", { name: "第二頁夥伴（已下架）" })).toBeVisible();
  deny = true;
  await page.getByRole("button", { name: "重新讀取" }).click();
  await expect(page.getByText("需要合作夥伴管理權限。", { exact: true })).toBeVisible();
  await expect(page.getByText("第二頁夥伴（已下架）", { exact: true })).toHaveCount(0);
  deny = false;
  fail = true;
  await page.getByRole("button", { name: "重新讀取" }).click();
  await expect(page.getByText("服務暫不可用。", { exact: true })).toBeVisible();
  fail = false;
  let release;
  const held = new Promise((resolve) => {
    pending = (done) => {
      release = done;
      resolve();
    };
  });
  await page.getByRole("button", { name: "重新讀取" }).click();
  await held;
  await page.evaluate(() => {
    window.testToken = "two";
  });
  release();
  await expect(page.getByText("LINE 身分已變更，請重新讀取。", { exact: true })).toBeVisible();
  await expect(page.getByText("測試合作夥伴（已下架）", { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "測試合作夥伴（已下架）" })).toBeVisible();
  await page.getByRole("button", { name: "新增合作夥伴", exact: true }).click();
  await page.getByLabel("夥伴名稱", { exact: true }).fill("新夥伴");
  await page.getByLabel("合作類型", { exact: true }).fill("維修");
  await page.getByLabel("窗口姓名", { exact: true }).fill("王窗口");
  await page.getByLabel("負責事項", { exact: true }).fill("聯絡");
  await page.getByLabel("電話", { exact: true }).fill("0212345678");
  await page.getByLabel("Email", { exact: true }).fill("window@example.com");
  await page.getByLabel("LINE ID 或連結", { exact: true }).fill("window-line");
  await page.getByLabel("修改原因", { exact: true }).fill("核實聯絡方式");
  await page.getByRole("checkbox").check();
  lose = true;
  await page.getByRole("button", { name: "確認儲存", exact: true }).click();
  await expect(page.getByRole("button", { name: "重試原操作", exact: true })).toBeEnabled();
  assert.equal(posts.length, 1);
  await page.reload();
  await expect(page.getByRole("button", { name: "重試原操作", exact: true })).toBeEnabled();
  assert.equal(posts.length, 1);
  await page.getByRole("button", { name: "重試原操作", exact: true }).click();
  await expect(page.getByText(/已保存版本 1/)).toBeVisible();
  assert.deepEqual(posts[1], posts[0]);
  assert.equal(receipts.size, 1);
  await page.getByRole("button", { name: "編輯新夥伴", exact: true }).click();
  await page.getByRole("button", { name: "增加窗口", exact: true }).click();
  await page.getByLabel("窗口姓名", { exact: true }).nth(1).fill("李窗口");
  await page.getByLabel("負責事項", { exact: true }).nth(1).fill("備援聯絡");
  await page.getByLabel("電話", { exact: true }).nth(1).fill("0212345678");
  await page.getByLabel("修改原因", { exact: true }).fill("新增第二窗口");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "確認儲存", exact: true }).click();
  await expect(page.getByText(/已保存版本 2/)).toBeVisible();
  assert.equal(savedPartner.contacts.length, 2);
  await page.getByRole("button", { name: "編輯新夥伴", exact: true }).click();
  await page.getByRole("combobox", { name: /^夥伴狀態/ }).selectOption("unlisted");
  await page.getByLabel("修改原因", { exact: true }).fill("停止合作");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "確認儲存", exact: true }).click();
  await expect(page.getByRole("heading", { name: "新夥伴（已下架）" })).toBeVisible();
  await page.getByRole("button", { name: "編輯新夥伴", exact: true }).click();
  await page.getByLabel("修改原因", { exact: true }).fill("測試版本衝突");
  await page.getByRole("checkbox").check();
  conflict = true;
  await page.getByRole("button", { name: "確認儲存", exact: true }).click();
  await expect(page.getByText("資料已更新，請重新讀取後再編輯。", { exact: true })).toBeVisible();
  conflict = false;
  await page.getByRole("button", { name: "重新讀取", exact: true }).click();
  await page.getByRole("button", { name: "編輯新夥伴", exact: true }).click();
  await page.getByLabel("修改原因", { exact: true }).fill("換身分拒絕");
  await page.getByRole("checkbox").check();
  const count = posts.length;
  memberId = "other";
  await page.getByRole("button", { name: "確認儲存", exact: true }).click();
  await expect(
    page.getByText("LINE 身分已變更，請重新讀取後編輯。", { exact: true }),
  ).toBeVisible();
  assert.equal(posts.length, count);
  memberId = "synthetic";
  await page.getByRole("button", { name: "重新讀取", exact: true }).click();
  await expect(page.getByRole("heading", { name: "新夥伴（已下架）" })).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 900 });
  if (output)
    await page.screenshot({
      path: path.join(output, "partner-management-desktop.png"),
      fullPage: true,
    });
  await page.getByRole("link", { name: "← 返回", exact: true }).click();
  await expect(page.getByRole("heading", { name: "管理後台" })).toBeVisible();
  assert.deepEqual(errors, []);
  console.log(
    "Partner management browser: details, pagination, denial, retry, changed identity and return passed.",
  );
} finally {
  if (output)
    await context.tracing.stop({ path: path.join(output, "partner-management-trace.zip") });
  await browser.close();
}
