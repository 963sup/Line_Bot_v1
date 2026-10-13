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
  !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) ||
  target.pathname !== "/"
)
  throw new Error("Loopback origin required.");
const base = target.origin;
const output = process.env.NAVIGATION_ARTIFACT_DIR ?? ".artifacts/browser/wbs";
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  channel: process.env.NAVIGATION_BROWSER_CHANNEL || undefined,
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  serviceWorkers: "block",
});
await context.addInitScript(() => {
  window.liff = {
    init: async () => {},
    isLoggedIn: () => true,
    getAccessToken: () => "synthetic-proof",
    isInClient: () => false,
    getProfile: async () => ({
      userId: "U11111111111111111111111111111111",
      displayName: "WBS Tester",
    }),
    login: () => {},
    closeWindow: () => {},
    openWindow: () => {},
  };
});
await context.tracing.start({ screenshots: true, snapshots: true });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const revisions = [];
const receipts = new Map();
const posts = [];
let unknown = false,
  conflict = false,
  forbidden = false,
  actor = "owner";
let deniedStatus = 403;
const repository = { id: "repo", ownerLogin: "alice", name: "Alpha" };
const generation = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
await context.route("**/*", async (route) => {
  const request = route.request(),
    url = new URL(request.url());
  if (url.origin !== base) return route.abort();
  if (!url.pathname.startsWith("/api/")) return route.continue();
  if (url.pathname === "/api/auth")
    return route.fulfill({ json: { generation, sessionChanged: false } });
  if (!url.pathname.startsWith("/api/repository-wbs"))
    return route.fulfill({ status: 404, json: { error: "Synthetic route not provided" } });
  assert.equal(request.headers()["x-app-session-generation"], generation);
  if (forbidden)
    return route.fulfill({ status: deniedStatus, json: { error: "WBS 存取已撤銷。" } });
  if (request.method() === "GET") {
    if (url.pathname.endsWith("/history"))
      return route.fulfill({
        json: {
          revisions: [...revisions].reverse().map(({ document, ...metadata }) => metadata),
          next: null,
        },
      });
    const revisionId = url.searchParams.get("revisionId");
    const revision = revisionId
      ? revisions.find((r) => r.id === revisionId)
      : (revisions.at(-1) ?? null);
    return route.fulfill({
      json: {
        repository,
        actorUserId: actor,
        canEdit: !revisionId,
        canManageRepository: true,
        archived: false,
        version: revisions.length,
        revision,
      },
    });
  }
  const command = request.postDataJSON();
  posts.push(command);
  if (receipts.has(command.requestId))
    return route.fulfill({ json: receipts.get(command.requestId) });
  if (conflict) {
    conflict = false;
    return route.fulfill({
      status: 409,
      json: { error: "WBS 已更新；請重新讀取並確認你的修改。" },
    });
  }
  assert.equal(command.expectedVersion, revisions.length);
  const before = revisions.at(-1);
  let nodes = structuredClone(before?.document.nodes ?? []);
  if (command.action === "create-node") nodes.push(command.node);
  else if (command.action === "update-node")
    nodes = nodes.map((n) => (n.id === command.node.id ? command.node : n));
  else if (command.action === "delete-subtree")
    nodes = nodes.filter((n) => n.id !== command.nodeId);
  else assert.equal(command.action, "initialize");
  const revision = {
    id: crypto.randomUUID(),
    version: revisions.length + 1,
    parentRevisionId: before?.id ?? null,
    actorUserId: actor,
    action: command.action,
    at: 1780000000000 + revisions.length,
    document: { schemaVersion: 1, nodes },
  };
  revisions.push(revision);
  const receipt = { requestId: command.requestId, repositoryId: repository.id, revision };
  receipts.set(command.requestId, receipt);
  if (unknown) {
    unknown = false;
    return route.fulfill({ status: 503, json: { error: "結果未知，請重試原操作。" } });
  }
  return route.fulfill({ json: receipt });
});
try {
  await page.goto(`${base}/alice/Alpha/wbs`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "尚未建立 WBS" })).toBeVisible();
  assert.equal(posts.length, 0, "Read must not initialize content");
  await page.getByRole("button", { name: "建立 WBS", exact: true }).click();
  await expect(page.getByText("目前版本：1", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "新增節點" }).click();
  await page.getByLabel("標題", { exact: true }).fill("門市開幕");
  await page.getByLabel("交付成果", { exact: true }).fill("通過開幕驗收");
  await page.getByLabel("驗收要求", { exact: true }).fill("消防與營運驗收完成");
  unknown = true;
  await page.getByRole("button", { name: "儲存內容" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("結果未知");
  await expect(page.getByRole("button", { name: "重試原操作" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "重試原操作" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "重試原操作" })).toBeVisible();
  await page.getByRole("button", { name: "重試原操作" }).click();
  await expect(page.getByRole("button", { name: "重試原操作" })).toHaveCount(0);
  await expect(page.getByText("目前版本：2", { exact: true })).toBeVisible();
  assert.equal(posts.at(-1).requestId, posts.at(-2).requestId);
  assert.equal(revisions.length, 2);
  await page.getByRole("button", { name: "1 門市開幕 · 工作包", exact: true }).click();
  await page.getByLabel("標題", { exact: true }).fill("門市開幕第二版");
  conflict = true;
  await page.getByRole("button", { name: "儲存內容" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("WBS 已更新");
  await expect(page.getByLabel("標題", { exact: true })).toHaveValue("門市開幕第二版");
  await page.getByRole("button", { name: "重新載入目前版本" }).click();
  await expect(page.getByLabel("標題", { exact: true })).toHaveValue("門市開幕第二版");
  await page.getByRole("button", { name: "儲存內容" }).click();
  await expect(page.getByText("目前版本：3", { exact: true })).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "1 門市開幕第二版 · 工作包", exact: true }),
  ).toBeVisible();
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: path.join(output, `wbs-${width}.png`), fullPage: true });
  }
  await page.getByRole("button", { name: "查看歷史" }).click();
  await page.getByRole("button", { name: /版本 2 · create-node/ }).click();
  await expect(page.getByText("歷史版本（唯讀）：2", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "1 門市開幕 · 工作包", exact: true }).click();
  await expect(page.getByLabel("標題", { exact: true })).toBeDisabled();
  forbidden = true;
  await page.getByRole("button", { name: "重新載入目前版本" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("WBS 存取已撤銷");
  await expect(page.getByRole("heading", { name: "版本歷史" })).toHaveCount(0);
  await expect(page.getByLabel("標題", { exact: true })).toHaveCount(0);
  forbidden = false;
  await page.getByRole("button", { name: "重新載入目前版本" }).click();
  await page.getByRole("button", { name: "1 門市開幕第二版 · 工作包", exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "刪除子樹" }).click();
  await expect(page.getByText("目前版本：4", { exact: true })).toBeVisible();
  await expect(page.getByText("尚無節點。", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "新增節點" }).click();
  await page.getByLabel("標題", { exact: true }).fill("不可外洩的草稿");
  forbidden = true;
  deniedStatus = 404;
  await page.getByRole("button", { name: "儲存內容" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("WBS 存取已撤銷");
  await expect(page.getByLabel("標題", { exact: true })).toHaveCount(0);
  forbidden = false;
  deniedStatus = 403;
  await page.getByRole("button", { name: "重新載入目前版本" }).click();
  await expect(page.getByText("目前版本：4", { exact: true })).toBeVisible();
  forbidden = true;
  actor = "other";
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.getByText("目前版本：4", { exact: true })).toHaveCount(0);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.getByRole("main").getByRole("alert")).toContainText("WBS 存取已撤銷");
  await expect(page.getByText("門市開幕第二版", { exact: true })).toHaveCount(0);
  assert.deepEqual(errors, []);
  writeFileSync(
    path.join(output, "wbs-results.json"),
    JSON.stringify(
      {
        status: "passed",
        scope:
          "Real Next production/browser with synthetic LINE/API; DB behavior is verified separately.",
        checks: [
          "explicit initialize",
          "editing",
          "reload persistence projection",
          "unknown-result exact retry after reload",
          "conflict preserves draft",
          "immutable history readonly",
          "subtree delete",
          "mobile layout",
          "private state clear",
        ],
        posts: posts.length,
      },
      null,
      2,
    ),
  );
  console.log("WBS browser checks passed.");
} catch (error) {
  await page.screenshot({ path: path.join(output, "wbs-failure.png"), fullPage: true });
  throw error;
} finally {
  await context.tracing.stop({ path: path.join(output, "wbs-trace.zip") });
  await context.close();
  await browser.close();
}
