import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const load = process.env.PLAYWRIGHT_PACKAGE_PATH
  ? (name) => require(path.join(process.env.PLAYWRIGHT_PACKAGE_PATH, name))
  : require;
const { chromium } = load("playwright");
const { expect } = load("playwright/test");
const webRequire = createRequire(new URL("../../apps/web/package.json", import.meta.url));
const { postgresFixture } = await import(
  pathToFileURL(webRequire.resolve("@line_bot_v1/platform/testing/postgres")).href
);
const { createRepositoryPulse } = await import(
  pathToFileURL(webRequire.resolve("@line_bot_v1/insights/application/use-cases/repository-pulse"))
    .href
);
const { createPostgresIssueMetrics } = await import(
  pathToFileURL(webRequire.resolve("@line_bot_v1/issue/composition/bootstrap/metrics")).href
);
const { createPostgresWbsMetrics } = await import(
  pathToFileURL(webRequire.resolve("@line_bot_v1/wbs/composition/bootstrap/metrics")).href
);
const { repositoryContentScope } = await import(
  pathToFileURL(webRequire.resolve("@line_bot_v1/repository/postgres/content-scope")).href
);
const { createWiki } = await import(
  pathToFileURL(webRequire.resolve("@line_bot_v1/wiki/application/use-cases/pages")).href
);
const { createWikiHistory } = await import(
  pathToFileURL(webRequire.resolve("@line_bot_v1/wiki/application/use-cases/history")).href
);
const { createPostgresWikiDependencies } = await import(
  pathToFileURL(webRequire.resolve("@line_bot_v1/wiki/composition/bootstrap/wiki-pages")).href
);
const { canEditWiki } = await import(
  pathToFileURL(webRequire.resolve("@line_bot_v1/wiki/domain/policies/wiki-access")).href
);
const { createPostgresWbsStore, createPostgresWbsGovernanceStore } = await import(
  pathToFileURL(webRequire.resolve("@line_bot_v1/wbs/composition/bootstrap/store")).href
);
const { parseWbsGovernanceCommand } = await import(
  pathToFileURL(webRequire.resolve("@line_bot_v1/wbs/application/commands/governance")).href
);
const { executeWbsCommand } = await import(
  pathToFileURL(webRequire.resolve("@line_bot_v1/wbs/application/use-cases/content")).href
);
const { executeWbsGovernanceCommand } = await import(
  pathToFileURL(webRequire.resolve("@line_bot_v1/wbs/application/use-cases/governance")).href
);
const fixture = await postgresFixture();
await fixture.db.transaction(async (sql) => {
  await sql.query(
    "INSERT INTO users(id,status,status_version,\"createdAt\") VALUES('owner','active',1,1)",
  );
  await sql.query("SELECT app_private.claim_account_login('owner','USER','alice',1)");
});
await fixture.pg.query(
  "SELECT * FROM app_private.provision_repository('repo','owner','owner','USER','Alpha','private')",
);
const contentStore = createPostgresWbsStore(fixture.db),
  governanceStore = createPostgresWbsGovernanceStore(fixture.db);
const wikiStore = createPostgresWikiDependencies(fixture.db);
const wikiContent = createWiki({ ...wikiStore, now: Date.now });
const wikiVersions = createWikiHistory(wikiStore.reads);
const wikiPosts = [];
let wikiUnknown = false;
let insightsUnavailable = false;
const insightsPeriods = [];
const pulse = createRepositoryPulse({
  qualify: async (userId, repositoryId) =>
    fixture.db.transaction((sql) => repositoryContentScope(sql, userId, { repositoryId })),
  issues: {
    read: async (...args) => {
      if (insightsUnavailable) throw new Error("Synthetic source unavailable");
      return createPostgresIssueMetrics(fixture.db).read(...args);
    },
  },
  wbs: createPostgresWbsMetrics(fixture.db),
  now: Date.now,
});
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
const governancePosts = [];
let governanceUnknown = false;
let governanceDeniedOnPost = false;
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
  if (url.pathname === "/api/repository-wbs/transfer") {
    assert.equal(request.method(), "GET");
    assert.equal(request.headers()["x-app-session-generation"], generation);
    assert.equal(url.searchParams.get("repositoryId"), "repo");
    return route.fulfill({ json: null });
  }
  if (url.pathname === "/api/repository-wiki") {
    assert.equal(request.headers()["x-app-session-generation"], generation);
    try {
      const { repository: source, archived } = await fixture.db.transaction((sql) =>
        repositoryContentScope(sql, actor, {
          ownerLogin: url.searchParams.get("owner"),
          repositoryName: url.searchParams.get("name"),
        }),
      );
      const scope = {
        actorUserId: actor,
        repository: { id: source.id, name: source.name, ownerLogin: "alice" },
        archived,
        canEdit: !archived && canEditWiki(source.permissions),
        canManageRepository: source.permissions.includes("admin"),
      };
      if (request.method() === "POST") {
        const command = request.postDataJSON();
        assert.equal(command.repositoryId, source.id);
        wikiPosts.push(command);
        const receipt = await wikiContent.execute(actor, command);
        if (wikiUnknown) {
          wikiUnknown = false;
          return route.fulfill({
            status: 503,
            json: { error: "Wiki 儲存結果未知，請重試原操作。" },
          });
        }
        return route.fulfill({ json: receipt });
      }
      const pageId = url.searchParams.get("pageId"),
        view = url.searchParams.get("view") ?? (pageId ? "page" : "list");
      const selector = { repositoryId: source.id, pageId };
      if (view === "history")
        return route.fulfill({
          json: {
            ...scope,
            ...(await wikiVersions.history(
              actor,
              selector,
              url.searchParams.has("before") ? Number(url.searchParams.get("before")) : undefined,
            )),
          },
        });
      if (view === "compare")
        return route.fulfill({
          json: {
            ...scope,
            ...(await wikiVersions.compare(
              actor,
              selector,
              url.searchParams.get("beforeId"),
              url.searchParams.get("afterId"),
            )),
          },
        });
      if (pageId)
        return route.fulfill({
          json: {
            ...scope,
            revision: await wikiContent.read(actor, {
              ...selector,
              ...(url.searchParams.has("revisionId")
                ? { revisionId: url.searchParams.get("revisionId") }
                : {}),
            }),
          },
        });
      return route.fulfill({
        json: {
          ...scope,
          ...(await wikiContent.list(actor, source.id, url.searchParams.get("after") ?? undefined)),
        },
      });
    } catch (error) {
      return route.fulfill({
        status: error.status ?? 503,
        json: { error: error.status === 409 ? error.message : "Wiki 存取失敗。" },
      });
    }
  }
  if (url.pathname === "/api/repository-insights") {
    assert.equal(request.method(), "GET");
    assert.equal(request.headers()["x-app-session-generation"], generation);
    assert.equal(url.searchParams.get("owner"), "alice");
    assert.equal(url.searchParams.get("name"), "Alpha");
    insightsPeriods.push(Number(url.searchParams.get("to")) - Number(url.searchParams.get("from")));
    try {
      return route.fulfill({
        json: {
          ...(await pulse.read(actor, {
            repositoryId: "repo",
            from: Number(url.searchParams.get("from")),
            to: Number(url.searchParams.get("to")),
          })),
          canManageRepository: (
            await fixture.db.transaction((sql) =>
              repositoryContentScope(sql, actor, { repositoryId: "repo" }),
            )
          ).repository.permissions.includes("admin"),
        },
      });
    } catch (error) {
      return route.fulfill({
        status: error.status ?? 503,
        json: { error: "Insights 存取已撤銷。" },
      });
    }
  }
  if (!url.pathname.startsWith("/api/repository-wbs"))
    return route.fulfill({ status: 404, json: { error: "Synthetic route not provided" } });
  assert.equal(request.headers()["x-app-session-generation"], generation);
  if (forbidden)
    return route.fulfill({ status: deniedStatus, json: { error: "WBS 存取已撤銷。" } });
  if (url.pathname.endsWith("/governance")) {
    try {
      if (request.method() === "GET") {
        const query = Object.fromEntries(
          [...url.searchParams]
            .filter(([key]) =>
              [
                "proposalId",
                "baselineId",
                "beforeProposal",
                "beforeBaseline",
                "beforeReview",
                "proposalVersion",
              ].includes(key),
            )
            .map(([key, value]) => [
              key,
              key.startsWith("before") || key === "proposalVersion" ? Number(value) : value,
            ]),
        );
        return route.fulfill({
          json: await governanceStore.view(actor, { repositoryId: "repo" }, query),
        });
      }
      const command = parseWbsGovernanceCommand(request.postDataJSON());
      if (governanceDeniedOnPost) {
        governanceDeniedOnPost = false;
        forbidden = true;
        return route.fulfill({ status: 403, json: { error: "WBS 存取在寫入時已撤銷。" } });
      }
      governancePosts.push(command);
      const receipt = await executeWbsGovernanceCommand(
        governanceStore,
        actor,
        command,
        Date.now(),
      );
      if (governanceUnknown) {
        governanceUnknown = false;
        return route.fulfill({ status: 503, json: { error: "治理結果未知，請重試原操作。" } });
      }
      return route.fulfill({ json: receipt });
    } catch (error) {
      return route.fulfill({ status: error.status ?? 503, json: { error: error.message } });
    }
  }
  if (request.method() === "GET") {
    if (url.pathname.endsWith("/history"))
      return route.fulfill({
        json: {
          revisions: [...revisions].reverse().map(({ document, ...metadata }) => metadata),
          next: null,
        },
      });
    return route.fulfill({
      json: await contentStore.read(
        actor,
        { repositoryId: "repo" },
        url.searchParams.get("revisionId") ?? undefined,
      ),
    });
  }
  const command = request.postDataJSON();
  posts.push(command);
  if (conflict) {
    conflict = false;
    return route.fulfill({
      status: 409,
      json: { error: "WBS 已更新；請重新讀取並確認你的修改。" },
    });
  }
  const receipt = await executeWbsCommand(contentStore, actor, command, Date.now());
  if (!revisions.some((r) => r.id === receipt.revision.id)) revisions.push(receipt.revision);
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
  const governance = page.getByRole("region", { name: "WBS 正式範圍治理" });
  await governance.getByLabel("提案名稱").fill("開幕範圍");
  await governance.getByLabel("變更理由").fill("凍結開幕工作包");
  governanceUnknown = true;
  await governance.getByRole("button", { name: "建立變更提案" }).click();
  await expect(governance.getByRole("alert")).toContainText("治理結果未知");
  await page.reload();
  await expect(governance.getByRole("button", { name: "重試原治理操作" })).toBeVisible();
  await governance.getByRole("button", { name: "重試原治理操作" }).click();
  await expect(governance.getByRole("button", { name: "核准此版本" })).toBeEnabled();
  assert.equal(governancePosts.at(-1).requestId, governancePosts.at(-2).requestId);
  await governance.getByRole("button", { name: "核准此版本" }).click();
  await expect(governance.getByRole("button", { name: "發布正式 Baseline" })).toBeEnabled();
  await page.getByRole("button", { name: "1 門市開幕第二版 · 工作包", exact: true }).click();
  await page.getByLabel("說明", { exact: true }).fill("後續草稿，尚未發布");
  await page.getByRole("button", { name: "儲存內容" }).click();
  await expect(page.getByText("目前版本：4", { exact: true })).toBeVisible();
  await expect(governance.getByRole("button", { name: "發布正式 Baseline" })).toBeEnabled();
  page.once("dialog", (dialog) => dialog.accept());
  await governance.getByRole("button", { name: "發布正式 Baseline" }).click();
  await expect(governance.getByRole("status")).toContainText("正式 Baseline 已發布");
  const official = await governanceStore.view("owner", { repositoryId: "repo" }, {});
  assert.equal(official.baseline.revision.version, 3);
  assert.equal((await contentStore.read("owner", { repositoryId: "repo" })).version, 4);
  assert.equal(official.baseline.revision.document.nodes[0].description, "");
  await governance.getByRole("button", { name: "查看審查的提案 v1" }).click();
  await expect(governance.getByText("歷史提案版本（唯讀）。", { exact: false })).toBeVisible();
  await expect(governance.getByRole("button", { name: "核准此版本" })).toHaveCount(0);
  await governance.getByRole("button", { name: "返回最新提案" }).click();
  await governance.getByText("治理政策設定", { exact: true }).click();
  await governance.getByLabel("必要核准人數").fill("2");
  await governance.getByRole("button", { name: "更新治理政策" }).click();
  await expect(governance.getByText(/政策 v2：至少 2 位核准/)).toBeVisible();
  await governance.getByRole("button", { name: "查看審查的提案 v1" }).click();
  await expect(governance.getByText(/已發布 Baseline #.*採用提案 v1 與政策 v1/)).toBeVisible();
  await expect(governance.getByText(/候選內容版本 3 · 發布時有效核准 1 筆/)).toBeVisible();
  await governance.getByRole("button", { name: "返回最新提案" }).click();
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: path.join(output, `wbs-${width}.png`), fullPage: true });
  }
  await governance.getByLabel("提案名稱").fill("不得送出的提案");
  governanceDeniedOnPost = true;
  await governance.getByRole("button", { name: "建立變更提案" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("WBS 存取在寫入時已撤銷");
  await expect(governance).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "1 門市開幕第二版 · 工作包", exact: true }),
  ).toHaveCount(0);
  assert.equal(
    (await governanceStore.view("owner", { repositoryId: "repo" }, {})).proposals.length,
    1,
  );
  forbidden = false;
  await page.getByRole("button", { name: "重新載入目前版本" }).click();
  await expect(governance.getByLabel("提案名稱")).toBeVisible();
  forbidden = true;
  await governance.getByRole("button", { name: "重新載入治理資料" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("WBS 存取已撤銷");
  await expect(governance).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "1 門市開幕第二版 · 工作包", exact: true }),
  ).toHaveCount(0);
  forbidden = false;
  await page.getByRole("button", { name: "重新載入目前版本" }).click();
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
  await expect(page.getByText("目前版本：5", { exact: true })).toBeVisible();
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
  await expect(page.getByText("目前版本：5", { exact: true })).toBeVisible();
  forbidden = true;
  actor = "other";
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.getByText("目前版本：5", { exact: true })).toHaveCount(0);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.getByRole("main").getByRole("alert")).toContainText("WBS 存取已撤銷");
  await expect(page.getByText("門市開幕第二版", { exact: true })).toHaveCount(0);
  actor = "owner";
  forbidden = false;
  const expectedMetrics = await createPostgresWbsMetrics(fixture.db).read("owner", "repo");
  assert.ok(expectedMetrics.baseline);
  const baselineText = `正式基準 #${expectedMetrics.baseline.number}`;
  await page.goto(`${base}/alice/Alpha/insights`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Issue 活動", exact: true })).toBeVisible();
  await expect(page.getByText(baselineText, { exact: false })).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "Repository resources" })
      .getByRole("link", { name: "Settings", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/^移除：/)).toBeVisible();
  await page.getByLabel("Issue 活動期間").selectOption("30");
  await expect.poll(() => insightsPeriods.at(-1)).toBe(30 * 86400000);
  await expect(page.getByText(/更新時間：/)).toBeVisible();
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      `Insights overflow at ${width}`,
    );
    await page.screenshot({ path: path.join(output, `insights-${width}.png`), fullPage: true });
  }
  insightsUnavailable = true;
  await page.getByRole("button", { name: "重新整理", exact: true }).click();
  await expect(
    page.getByText("Issue 來源暫時不可用，無法顯示指標。", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(baselineText, { exact: false })).toBeVisible();
  await fixture.pg.query("UPDATE app_private.users SET status='paused' WHERE id='owner'");
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.getByText(baselineText, { exact: false })).toHaveCount(0);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Insights 存取已撤銷");
  await expect(page.getByText(/更新時間：/)).toHaveCount(0);
  await fixture.pg.query("UPDATE app_private.users SET status='active' WHERE id='owner'");
  await page.goto(`${base}/alice/Alpha/wiki`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText("尚無 Wiki 頁面。", { exact: true })).toBeVisible();
  assert.equal(wikiPosts.length, 0);
  await page.getByRole("button", { name: "建立頁面", exact: true }).click();
  await page.getByLabel("標題", { exact: true }).fill("Wiki Guide");
  const originalWiki = "# Markdown 原文\n<script>window.__wikiInjected=true</script>";
  await page.getByLabel("Markdown 原文", { exact: true }).fill(originalWiki);
  await page.getByRole("button", { name: "儲存頁面", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Wiki Guide", exact: true })).toBeVisible();
  const wikiPath = new URL(page.url()).pathname;
  assert.match(wikiPath, /^\/alice\/Alpha\/wiki\/[0-9a-f-]{36}$/);
  assert.equal(await page.evaluate(() => Reflect.get(window, "__wikiInjected")), undefined);
  await page.getByRole("button", { name: "編輯頁面", exact: true }).click();
  await page.getByLabel("標題", { exact: true }).fill("Wiki Guide updated");
  await page.getByLabel("Markdown 原文", { exact: true }).fill("Updated raw Markdown");
  wikiUnknown = true;
  await page.getByRole("button", { name: "儲存頁面", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Wiki 儲存結果未知");
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "重試原操作", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "重試原操作", exact: true }).click();
  await expect(page.getByText("目前版本：2", { exact: true })).toBeVisible();
  assert.deepEqual(wikiPosts.at(-1), wikiPosts.at(-2));
  assert.equal(new URL(page.url()).pathname, wikiPath);
  await page.getByRole("button", { name: "查看歷史", exact: true }).click();
  await page.getByRole("button", { name: "比較版本 1 與目前版本", exact: true }).click();
  await expect(page.getByRole("heading", { name: "版本差異", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "查看版本 1", exact: true }).click();
  await expect(page.getByText("歷史版本（唯讀）：1", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "編輯頁面", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "還原此版本為新版本", exact: true }).click();
  await expect(page.getByText("目前版本：3", { exact: true })).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "封存頁面", exact: true }).click();
  await expect(page.getByText("目前版本：4 · 已封存", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "編輯頁面", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "查看歷史", exact: true }).click();
  await page.getByRole("button", { name: "查看版本 1", exact: true }).click();
  await page.getByRole("button", { name: "還原此版本為新版本", exact: true }).click();
  await expect(page.getByText("目前版本：5", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "編輯頁面", exact: true }).click();
  await page.getByLabel("標題", { exact: true }).fill("Local stale draft");
  await page.getByLabel("Markdown 原文", { exact: true }).fill("Local stale content");
  const stableWikiPageId = wikiPath.split("/").at(-1);
  await wikiContent.execute("owner", {
    action: "edit",
    repositoryId: "repo",
    pageId: stableWikiPageId,
    requestId: randomUUID(),
    expectedVersion: 5,
    title: "Concurrent server update",
    body: "Server content",
  });
  await page.getByRole("button", { name: "重新讀取 Wiki", exact: true }).click();
  await expect(page.getByText("目前版本：6", { exact: true })).toBeVisible();
  await expect(page.getByLabel("標題", { exact: true })).toHaveValue("Local stale draft");
  await page.getByRole("button", { name: "儲存頁面", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("version conflict");
  assert.equal(wikiPosts.at(-1).expectedVersion, 5);
  const preservedWiki = await wikiContent.read("owner", {
    repositoryId: "repo",
    pageId: stableWikiPageId,
  });
  assert.equal(preservedWiki.version, 6);
  assert.equal(preservedWiki.body, "Server content");
  await expect(page.getByLabel("Markdown 原文", { exact: true })).toHaveValue(
    "Local stale content",
  );
  await page.getByRole("button", { name: "取消編輯", exact: true }).click();
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      `Wiki overflow at ${width}`,
    );
    await page.screenshot({ path: path.join(output, `wiki-${width}.png`), fullPage: true });
  }
  await fixture.pg.query("UPDATE app_private.repositories SET is_archived=true WHERE id='repo'");
  await page.getByRole("button", { name: "重新讀取 Wiki", exact: true }).click();
  await expect(page.getByText("Repository 已封存，Wiki 為唯讀。", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "編輯頁面", exact: true })).toHaveCount(0);
  await fixture.pg.query("UPDATE app_private.users SET status='paused' WHERE id='owner'");
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(
    page.getByRole("heading", { name: "Concurrent server update", exact: true }),
  ).toHaveCount(0);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Wiki 存取失敗");
  assert.deepEqual(errors, []);
  writeFileSync(
    path.join(output, "wbs-results.json"),
    JSON.stringify(
      {
        status: "passed",
        scope:
          "Real Next production/browser with synthetic LINE/API transport and real WBS owner stores on local PGlite; multi-session PostgreSQL races are verified separately in CI.",
        checks: [
          "frozen proposal, exact governance retry and version-bound approval",
          "atomic Baseline publication preserves later draft",
          "policy editing and current-source access loss clears draft and Baseline",
          "explicit initialize",
          "editing",
          "reload persistence projection",
          "unknown-result exact retry after reload",
          "conflict preserves draft",
          "immutable history readonly",
          "subtree delete",
          "mobile layout",
          "private state clear",
          "Wiki raw content, stable page identity, durable exact retry after reload, immutable history, compare/restore, archive and current access",
          "Insights period/current state, real owner metrics, partial source failure and qualification revocation",
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
  await fixture.pg.close();
}
