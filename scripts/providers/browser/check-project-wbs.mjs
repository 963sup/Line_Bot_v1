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
const resolvedImport = async (specifier) =>
  import(pathToFileURL(webRequire.resolve(specifier)).href);

const { postgresFixture } = await resolvedImport("@line_bot_v1/platform/testing/postgres");
const { createSql } = await resolvedImport("@line_bot_v1/platform/postgres");
const { createProjectManagement } = await resolvedImport(
  "@line_bot_v1/project/application/management",
);
const { createPostgresProjectLifecycle, createPostgresProjectManagementStore } =
  await resolvedImport(
    "@line_bot_v1/project/composition/bootstrap/postgres-project-management-store",
  );
const { createPostgresProjectContentScope } = await resolvedImport(
  "@line_bot_v1/project/composition/bootstrap/project-content-scope",
);
const { createPostgresProjectWbsStore } = await resolvedImport(
  "@line_bot_v1/wbs/composition/bootstrap/project-content",
);
const { createPostgresProjectWbsGovernanceStore } = await resolvedImport(
  "@line_bot_v1/wbs/composition/bootstrap/project-governance",
);
const { createPostgresProjectWbsMetrics } = await resolvedImport(
  "@line_bot_v1/wbs/composition/bootstrap/project-metrics",
);
const { createPostgresWbsStore, createPostgresWbsGovernanceStore } = await resolvedImport(
  "@line_bot_v1/wbs/composition/bootstrap/store",
);
const { createPostgresWbsScopeTransferStore } = await resolvedImport(
  "@line_bot_v1/wbs/composition/bootstrap/transfer",
);
const { createPostgresActionTransferFacts } = await resolvedImport(
  "@line_bot_v1/actions/composition/bootstrap/transfer-facts",
);
const { createPostgresNotificationTransferFacts } = await resolvedImport(
  "@line_bot_v1/notifications/composition/bootstrap/transfer-facts",
);
const { parseProjectWbsCommand } = await resolvedImport(
  "@line_bot_v1/wbs/application/commands/project-content",
);
const { parseProjectWbsGovernanceCommand } = await resolvedImport(
  "@line_bot_v1/wbs/application/commands/project-governance",
);
const { parseWbsGovernanceCommand } = await resolvedImport(
  "@line_bot_v1/wbs/application/commands/governance",
);
const { parseCancelWbsScopeTransferCommand, parseRequestWbsScopeTransferCommand } =
  await resolvedImport("@line_bot_v1/wbs/application/commands/transfer");
const { executeProjectWbsCommand } = await resolvedImport(
  "@line_bot_v1/wbs/application/use-cases/project-content",
);
const { executeProjectWbsGovernanceCommand } = await resolvedImport(
  "@line_bot_v1/wbs/application/use-cases/project-governance",
);
const { executeWbsCommand } = await resolvedImport(
  "@line_bot_v1/wbs/application/use-cases/content",
);
const { executeWbsGovernanceCommand } = await resolvedImport(
  "@line_bot_v1/wbs/application/use-cases/governance",
);
const {
  cancelWbsScopeTransfer,
  executeWbsScopeTransfer,
  readWbsScopeTransfer,
  requestWbsScopeTransfer,
} = await resolvedImport("@line_bot_v1/wbs/application/use-cases/transfer");
const { repositoryContentScope } = await resolvedImport(
  "@line_bot_v1/repository/postgres/content-scope",
);

const fixture = await postgresFixture();
for (const userId of ["owner", "writer"]) {
  await fixture.db.transaction(async (sql) => {
    await sql.query(
      "INSERT INTO users(id,status,status_version,\"createdAt\") VALUES($1,'active',1,1)",
      [userId],
    );
    await sql.query("SELECT app_private.claim_account_login($1,'USER',$1,1)", [userId]);
  });
}
await fixture.pg.query(
  "SELECT * FROM app_private.provision_repository('repo','owner','owner','USER','Alpha','public')",
);

const projectService = createProjectManagement({
  activeUser: async (subject) => ({ id: subject }),
  store: () => createPostgresProjectManagementStore(fixture.db),
  lifecycle: () => createPostgresProjectLifecycle(fixture.db),
  now: Date.now,
});
const created = await projectService.command("owner", {
  action: "create-project",
  requestId: randomUUID(),
  ownerAccountId: "owner",
  ownerKind: "USER",
  expectedVersion: 0,
  title: "Project Alpha",
  public: false,
  repositoryId: null,
  teamId: null,
});
const projectId = created.projectId;
await projectService.command("owner", {
  action: "update-collaborators",
  requestId: randomUUID(),
  projectId,
  expectedVersion: created.version,
  collaborators: [{ role: "WRITER", userId: "writer" }],
});

const projectContent = createPostgresProjectWbsStore(fixture.db);
const projectGovernance = createPostgresProjectWbsGovernanceStore(fixture.db);
const projectMetrics = createPostgresProjectWbsMetrics(fixture.db);
const repositoryContent = createPostgresWbsStore(fixture.db);
const repositoryGovernance = createPostgresWbsGovernanceStore(fixture.db);
const transferStore = createPostgresWbsScopeTransferStore(
  fixture.db,
  (sql) => ({
    project: async (userId, targetProjectId) => {
      const scope = await createPostgresProjectContentScope(sql).read(userId, targetProjectId);
      return {
        projectId: scope.project.id,
        ownerAccountId: scope.project.ownerAccountId,
        ownerKind: scope.project.ownerKind,
        role: scope.role,
        public: scope.project.public,
        closed: scope.closed,
        hasCollaboratorGrants: scope.project.hasCollaboratorGrants,
      };
    },
    dependents: async (_actorUserId, _repositoryId, targetProjectId) => {
      const [actionRows, notificationRows] = await Promise.all([
        createPostgresActionTransferFacts(sql).read(targetProjectId),
        createPostgresNotificationTransferFacts(sql).read(),
      ]);
      return { actionRows, notificationRows };
    },
  }),
  {
    transaction: (work) =>
      fixture.pg.transaction(async (tx) => {
        await tx.exec("SET LOCAL search_path=app_private,pg_catalog");
        return work(
          createSql(async (text, values) => {
            const result = await tx.query(text, values);
            return { rows: result.rows, rowCount: result.affectedRows ?? null };
          }),
        );
      }),
  },
);
await executeWbsCommand(
  repositoryContent,
  "owner",
  {
    action: "initialize",
    repositoryId: "repo",
    requestId: randomUUID(),
    expectedVersion: 0,
  },
  Date.now(),
);

const target = new URL(process.env.NAVIGATION_BASE ?? "http://127.0.0.1:4117");
if (
  target.protocol !== "http:" ||
  !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) ||
  target.pathname !== "/"
) {
  throw new Error("Loopback origin required.");
}
const base = target.origin;
const output = process.env.NAVIGATION_ARTIFACT_DIR ?? ".artifacts/browser/project-wbs";
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
      displayName: "Project WBS Tester",
    }),
    login: () => {},
    closeWindow: () => {},
    openWindow: () => {},
  };
});
await context.tracing.start({ screenshots: true, snapshots: true });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));

const generation = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
let actor = "owner";
let projectUnknown = false;
let contentUnknown = false;
let governanceUnknown = false;
let cancelUnknown = false;
let transferUnknown = false;
const projectPosts = [];
const contentPosts = [];
const governancePosts = [];
const transferPosts = [];
let transferLookupFailure = false;
const cancelPosts = [];

function errorResponse(route, error, fallback) {
  return route.fulfill({
    status: error && typeof error.status === "number" ? error.status : 503,
    json: { error: error instanceof Error ? error.message : fallback },
  });
}

await context.route("**/*", async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  if (url.origin !== base) return route.abort();
  if (!url.pathname.startsWith("/api/")) return route.continue();
  if (url.pathname === "/api/auth") {
    return route.fulfill({ json: { generation, sessionChanged: false } });
  }
  assert.equal(request.headers()["x-app-session-generation"], generation);
  if (url.pathname === "/api/membership") {
    return route.fulfill({
      json: {
        member: {
          id: actor,
          login: actor,
          status: "active",
          createdAt: 1,
          googleEmail: null,
        },
      },
    });
  }
  if (url.pathname === "/api/project-management") {
    try {
      if (request.method() === "GET") {
        return route.fulfill({
          json: await projectService.view(actor, url.searchParams.get("projectId")),
        });
      }
      const command = request.postDataJSON();
      projectPosts.push(command);
      const receipt = await projectService.command(actor, command);
      if (projectUnknown) {
        projectUnknown = false;
        return route.fulfill({ status: 503, json: { error: "Project 建立結果尚待確認。" } });
      }
      return route.fulfill({ json: receipt });
    } catch (error) {
      return errorResponse(route, error, "Project 操作失敗。");
    }
  }
  if (url.pathname.startsWith("/api/project-wbs")) {
    try {
      const selector = { projectId: url.searchParams.get("projectId") ?? projectId };
      if (url.pathname.endsWith("/metrics")) {
        assert.equal(request.method(), "GET");
        return route.fulfill({
          json: {
            actorUserId: actor,
            projectId: selector.projectId,
            metrics: await projectMetrics.read(actor, selector.projectId),
          },
        });
      }
      if (url.pathname.endsWith("/governance")) {
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
          return route.fulfill({ json: await projectGovernance.view(actor, selector, query) });
        }
        const command = parseProjectWbsGovernanceCommand(request.postDataJSON());
        governancePosts.push({ actor, command });
        const receipt = await executeProjectWbsGovernanceCommand(
          projectGovernance,
          actor,
          command,
          Date.now(),
        );
        if (governanceUnknown) {
          governanceUnknown = false;
          return route.fulfill({ status: 503, json: { error: "治理結果未知，請重試原操作。" } });
        }
        return route.fulfill({ json: receipt });
      }
      if (request.method() === "GET") {
        if (url.pathname.endsWith("/history")) {
          return route.fulfill({
            json: await projectContent.history(
              actor,
              selector,
              url.searchParams.has("before") ? Number(url.searchParams.get("before")) : undefined,
            ),
          });
        }
        return route.fulfill({
          json: await projectContent.read(
            actor,
            selector,
            url.searchParams.get("revisionId") ?? undefined,
          ),
        });
      }
      const command = parseProjectWbsCommand(request.postDataJSON());
      contentPosts.push(command);
      const receipt = await executeProjectWbsCommand(projectContent, actor, command, Date.now());
      if (contentUnknown) {
        contentUnknown = false;
        return route.fulfill({ status: 503, json: { error: "結果未知，請重試原操作。" } });
      }
      return route.fulfill({ json: receipt });
    } catch (error) {
      return errorResponse(route, error, "Project WBS 操作失敗。");
    }
  }
  if (url.pathname === "/api/repository-wbs/transfer/cancel") {
    try {
      const command = parseCancelWbsScopeTransferCommand(request.postDataJSON());
      cancelPosts.push(command);
      const receipt = await cancelWbsScopeTransfer(transferStore, actor, command, Date.now());
      if (cancelUnknown) {
        cancelUnknown = false;
        return route.fulfill({ status: 503, json: { error: "撤回結果尚待確認。" } });
      }
      return route.fulfill({ json: receipt });
    } catch (error) {
      return errorResponse(route, error, "WBS 移轉撤回失敗。");
    }
  }
  if (url.pathname === "/api/repository-wbs/transfer") {
    try {
      if (request.method() === "GET") {
        if (transferLookupFailure)
          return route.fulfill({ status: 503, json: { error: "移轉服務暫時無法使用。" } });
        const repositoryId =
          url.searchParams.get("repositoryId") ??
          (await fixture.db.transaction(
            async (sql) =>
              (
                await repositoryContentScope(sql, actor, {
                  ownerLogin: url.searchParams.get("owner") ?? "",
                  repositoryName: url.searchParams.get("name") ?? "",
                })
              ).repository.id,
          ));
        return route.fulfill({
          json: await readWbsScopeTransfer(transferStore, actor, repositoryId),
        });
      }
      const command = parseRequestWbsScopeTransferCommand(request.postDataJSON());
      transferPosts.push(command);
      const receipt = await requestWbsScopeTransfer(transferStore, actor, command, Date.now());
      if (transferUnknown) {
        transferUnknown = false;
        return route.fulfill({ status: 503, json: { error: "移轉請求結果尚待確認。" } });
      }
      return route.fulfill({
        json: receipt,
      });
    } catch (error) {
      return errorResponse(route, error, "WBS 移轉請求失敗。");
    }
  }
  if (url.pathname.startsWith("/api/repository-wbs")) {
    try {
      const selector = { ownerLogin: "owner", repositoryName: "Alpha" };
      if (url.pathname.endsWith("/governance")) {
        if (request.method() === "GET") {
          return route.fulfill({ json: await repositoryGovernance.view(actor, selector, {}) });
        }
        const command = parseWbsGovernanceCommand(request.postDataJSON());
        return route.fulfill({
          json: await executeWbsGovernanceCommand(repositoryGovernance, actor, command, Date.now()),
        });
      }
      if (request.method() === "GET") {
        if (url.pathname.endsWith("/history")) {
          return route.fulfill({ json: await repositoryContent.history(actor, selector) });
        }
        return route.fulfill({ json: await repositoryContent.read(actor, selector) });
      }
      const receipt = await executeWbsCommand(
        repositoryContent,
        actor,
        request.postDataJSON(),
        Date.now(),
      );
      return route.fulfill({ json: receipt });
    } catch (error) {
      return errorResponse(route, error, "Repository WBS 操作失敗。");
    }
  }
  return route.fulfill({ status: 404, json: { error: "Synthetic route not provided" } });
});

try {
  await page.goto(`${base}/projects/${encodeURIComponent(projectId)}/wbs`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByRole("heading", { name: "Project WBS" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "尚未建立 WBS" })).toBeVisible();
  const metrics = page.getByRole("region", { name: "Project WBS 規劃指標" });
  await expect(metrics.getByText("尚未建立 WBS。", { exact: true })).toBeVisible();
  await expect(metrics.getByText("待審提案：0", { exact: true })).toBeVisible();
  await expect(
    metrics.getByText("尚無正式基準，無法比較草稿差異。", { exact: true }),
  ).toBeVisible();
  assert.equal(contentPosts.length, 0, "Read must not initialize Project WBS");

  await page.getByRole("button", { name: "建立 WBS", exact: true }).click();
  await expect(page.getByText("目前版本：1", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "新增節點" }).click();
  await page.getByLabel("標題", { exact: true }).fill("Project launch");
  await page.getByLabel("交付成果", { exact: true }).fill("Released Project scope");
  await page.getByLabel("驗收要求", { exact: true }).fill("Owner accepts release evidence");
  contentUnknown = true;
  await page.getByRole("button", { name: "儲存內容" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("結果未知");
  await page.reload();
  await expect(page.getByRole("button", { name: "重試原操作" })).toBeVisible();
  await page.getByRole("button", { name: "重試原操作" }).click();
  await expect(page.getByText("目前版本：2", { exact: true })).toBeVisible();
  await expect(metrics.getByText("WBS 已初始化。", { exact: true })).toBeVisible();
  assert.equal(contentPosts.at(-1).requestId, contentPosts.at(-2).requestId);

  await page.getByRole("button", { name: "1 Project launch · 工作包", exact: true }).click();
  await page.getByLabel("標題", { exact: true }).fill("Project launch v2");
  await page.getByRole("button", { name: "儲存內容" }).click();
  await expect(page.getByText("目前版本：3", { exact: true })).toBeVisible();

  const governance = page.getByRole("region", { name: "WBS 正式範圍治理" });
  await governance.getByLabel("提案名稱").fill("Project scope v1");
  await governance.getByLabel("變更理由").fill("Freeze candidate before later draft edits");
  governanceUnknown = true;
  await governance.getByRole("button", { name: "建立變更提案" }).click();
  await expect(governance.getByRole("alert")).toContainText("治理結果未知");
  await page.reload();
  await governance.getByRole("button", { name: "重試原治理操作" }).click();
  await expect(governance.getByRole("status")).toContainText("治理操作已保存。");
  assert.equal(governancePosts.at(-1).command.requestId, governancePosts.at(-2).command.requestId);
  await metrics.getByRole("button", { name: "重新載入規劃資訊" }).click();
  await expect(metrics.getByText("待審提案：1", { exact: true })).toBeVisible();

  actor = "writer";
  await page.reload();
  await governance.getByRole("button", { name: "#1 Project scope v1 · 待審", exact: true }).click();
  await expect(governance.getByRole("button", { name: "核准此版本" })).toBeEnabled();
  await expect(governance.getByRole("button", { name: "發布正式 Baseline" })).toHaveCount(0);
  await governance.getByRole("button", { name: "核准此版本" }).click();
  await expect(governance.getByRole("status")).toContainText("治理操作已保存。");
  assert.equal(governancePosts.at(-1).actor, "writer");

  actor = "owner";
  await page.reload();
  await governance.getByRole("button", { name: "#1 Project scope v1 · 待審", exact: true }).click();
  await page.getByRole("button", { name: "1 Project launch v2 · 工作包", exact: true }).click();
  await page.getByLabel("說明", { exact: true }).fill("Later unpublished draft");
  await page.getByRole("button", { name: "儲存內容" }).click();
  await expect(page.getByText("目前版本：4", { exact: true })).toBeVisible();
  await expect(governance.getByRole("button", { name: "發布正式 Baseline" })).toBeEnabled();
  page.once("dialog", (dialog) => dialog.accept());
  await governance.getByRole("button", { name: "發布正式 Baseline" }).click();
  await expect(governance.getByRole("status")).toContainText("正式 Baseline 已發布");
  const official = await projectGovernance.view("owner", { projectId }, {});
  assert.ok(official.baseline);
  await metrics.getByRole("button", { name: "重新載入規劃資訊" }).click();
  await expect(metrics.getByText("待審提案：0", { exact: true })).toBeVisible();
  await expect(metrics.getByText(`正式基準 #${official.baseline.baseline.number}`)).toBeVisible();
  await expect(metrics.getByRole("heading", { name: "草稿與正式基準差異" })).toBeVisible();
  await expect(metrics.getByText("修改：Project launch v2", { exact: true })).toBeVisible();
  const current = await projectContent.read("owner", { projectId });
  assert.equal(official.baseline.revision.version, 3);
  assert.equal(current.version, 4);

  await page.getByRole("button", { name: "查看歷史" }).click();
  await page.getByRole("button", { name: /版本 2 · create-node/ }).click();
  await expect(page.getByText("歷史版本（唯讀）：2", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "1 Project launch · 工作包", exact: true }).click();
  await expect(page.getByLabel("標題", { exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "重新載入目前版本" }).click();

  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({
      path: path.join(output, `project-wbs-${width}.png`),
      fullPage: true,
    });
  }

  await fixture.pg.query("UPDATE app_private.users SET status='paused' WHERE id='owner'");
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
  await expect(page.getByText("Later unpublished draft", { exact: true })).toHaveCount(0);
  await fixture.pg.query("UPDATE app_private.users SET status='active' WHERE id='owner'");
  await page.getByRole("button", { name: "重新載入目前版本" }).click();

  const projectView = await projectService.view("owner", projectId);
  await projectService.command("owner", {
    action: "close-project",
    requestId: randomUUID(),
    projectId,
    expectedVersion: projectView.project.version,
  });
  await page.reload();
  await expect(page.getByText("Project 已關閉，WBS 僅供讀取。", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "新增節點" })).toHaveCount(0);

  actor = "owner";
  await page.goto(`${base}/owner/Alpha/wbs`, { waitUntil: "domcontentloaded" });
  const transferRegion = page.getByRole("region", { name: "Project WBS 移轉" });
  await expect(transferRegion).toBeVisible();
  projectUnknown = true;
  await transferRegion.getByRole("button", { name: "建立 Project 與移轉請求" }).click();
  await expect(transferRegion.getByRole("alert")).toContainText("結果尚待確認");
  await transferRegion.getByRole("button", { name: "重試原操作" }).click();
  await expect(transferRegion.getByRole("status")).toContainText("移轉請求已建立");
  await expect(transferRegion).toContainText(transferPosts[0].transferId);
  await expect(transferRegion.getByRole("link", { name: "查看目標 Project" })).toHaveAttribute(
    "href",
    `/projects/${encodeURIComponent(transferPosts[0].projectId)}`,
  );
  await expect(transferRegion.getByRole("link", { name: "開啟 Project WBS" })).toHaveCount(0);
  await expect(transferRegion).toContainText("固定來源版本：1");
  await expect(transferRegion).toContainText(transferPosts[0].sourceHeadRevisionId);
  assert.equal(projectPosts.at(-1).requestId, projectPosts.at(-2).requestId);
  assert.equal(transferPosts.length, 1);
  assert.equal(transferPosts[0].repositoryId, "repo");
  assert.equal(transferPosts[0].sourceVersion, 1);
  await page.evaluate(() => sessionStorage.removeItem("wbs-transfer:repo:owner"));
  await page.reload();
  await expect(transferRegion).toContainText(transferPosts[0].transferId);

  cancelUnknown = true;
  await transferRegion.getByRole("button", { name: "撤回移轉請求" }).click();
  await expect(transferRegion.getByRole("alert")).toContainText("撤回結果尚待確認");
  await page.reload();
  await transferRegion.getByRole("button", { name: "重試撤回移轉請求" }).click();
  await expect(transferRegion.getByRole("status")).toContainText("移轉請求已撤回");
  assert.equal(cancelPosts.at(-1).requestId, cancelPosts.at(-2).requestId);

  await transferRegion.getByRole("button", { name: "建立 Project 與移轉請求" }).click();
  await expect(transferRegion.getByRole("status")).toContainText("移轉請求已建立");
  assert.equal(transferPosts.length, 2);
  assert.notEqual(transferPosts[0].transferId, transferPosts[1].transferId);
  const staleCancellation = cancelPosts[0];
  await page.evaluate(
    ({ command }) =>
      sessionStorage.setItem(
        "wbs-transfer-cancel:repo:owner",
        JSON.stringify({ actorUserId: "owner", repositoryId: "repo", command }),
      ),
    { command: staleCancellation },
  );
  await page.reload();
  await expect(transferRegion).toContainText(transferPosts[1].transferId);
  await transferRegion.getByRole("button", { name: "撤回移轉請求" }).click();
  await expect(transferRegion.getByRole("status")).toContainText("移轉請求已撤回");
  assert.equal(cancelPosts.at(-1).transferId, transferPosts[1].transferId);
  assert.notEqual(cancelPosts.at(-1).requestId, staleCancellation.requestId);

  transferUnknown = true;
  await transferRegion.getByRole("button", { name: "建立 Project 與移轉請求" }).click();
  await expect(transferRegion.getByRole("alert")).toContainText("移轉請求結果尚待確認");
  const crossTabTransfer = transferPosts.at(-1);
  await cancelWbsScopeTransfer(
    transferStore,
    "owner",
    {
      transferId: crossTabTransfer.transferId,
      repositoryId: "repo",
      requestId: randomUUID(),
    },
    Date.now(),
  );
  await transferRegion.getByRole("button", { name: "重試原操作" }).click();
  await expect(transferRegion.getByRole("status")).toContainText("移轉請求已撤回");
  await expect(transferRegion.getByRole("status")).toContainText(crossTabTransfer.transferId);
  assert.equal(transferPosts.at(-1).requestId, transferPosts.at(-2).requestId);
  const transferRows = await fixture.pg.query(
    "SELECT state,repository_id,project_id FROM app_private.wbs_scope_transfers ORDER BY requested_at",
  );
  assert.deepEqual(transferRows.rows, [
    {
      state: "CANCELLED",
      repository_id: "repo",
      project_id: transferPosts[0].projectId,
    },
    { state: "CANCELLED", repository_id: "repo", project_id: transferPosts[1].projectId },
    { state: "CANCELLED", repository_id: "repo", project_id: crossTabTransfer.projectId },
  ]);
  await page.screenshot({ path: path.join(output, "transfer-requested.png"), fullPage: true });

  // Local owner-store activation proves that a fresh legacy URL works after its content API retires.
  await transferRegion.getByRole("button", { name: "建立 Project 與移轉請求" }).click();
  await expect(transferRegion.getByRole("status")).toContainText("移轉請求已建立");
  const finalTransfer = transferPosts.at(-1);
  assert.ok(finalTransfer);
  await executeWbsScopeTransfer(
    transferStore,
    {
      transferId: finalTransfer.transferId,
      currentMainSha: "a".repeat(40),
      deployedSha: "a".repeat(40),
      providerRecoveryReady: true,
    },
    Date.now(),
  );
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  const retired = page.getByRole("region", { name: "WBS 移轉完成" });
  await expect(retired.getByRole("heading", { name: "Repository WBS 已停止使用" })).toBeVisible();
  await expect(retired.getByRole("link", { name: "開啟 Project WBS" })).toHaveAttribute(
    "href",
    `/projects/${encodeURIComponent(finalTransfer.projectId)}/wbs`,
  );
  await expect(page.getByRole("button", { name: "新增節點" })).toHaveCount(0);
  await page.screenshot({ path: path.join(output, "transfer-active.png"), fullPage: true });
  transferLookupFailure = true;
  await page.reload();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("移轉服務暫時無法使用");
  await expect(page.getByRole("link", { name: "開啟 Project WBS" })).toHaveCount(0);
  transferLookupFailure = false;
  await page.reload();
  await expect(retired.getByRole("link", { name: "開啟 Project WBS" })).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.getByRole("link", { name: "開啟 Project WBS" })).toHaveCount(0);
  await page.reload();
  await expect(retired.getByRole("link", { name: "開啟 Project WBS" })).toBeVisible();
  await retired.getByRole("link", { name: "開啟 Project WBS" }).click();
  await expect(page.getByRole("heading", { name: "Project WBS", exact: true })).toBeVisible();
  await expect(page.getByText("目前版本：1", { exact: true })).toBeVisible();
  actor = "writer";
  await page.goto(`${base}/owner/Alpha/wbs`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("main").getByRole("alert")).toContainText("User owner");
  await expect(page.getByRole("link", { name: "開啟 Project WBS" })).toHaveCount(0);
  await expect(page.getByText(finalTransfer.projectId, { exact: false })).toHaveCount(0);

  assert.deepEqual(errors, []);
  writeFileSync(
    path.join(output, "project-wbs-results.json"),
    JSON.stringify(
      {
        status: "passed",
        scope:
          "Real Next browser with synthetic LINE/API transport and real Project, Repository, WBS governance and transfer owner stores on local PGlite, including local activation; no production mutation.",
        checks: [
          "formal Project creation and Project collaborator authorization",
          "explicit Project WBS initialize and edit",
          "content and governance unknown-result exact replay",
          "WRITE review and ADMIN publication",
          "published candidate remains independent from later draft version",
          "immutable history readonly",
          "current qualification revocation clears private presentation",
          "closed Project readonly",
          "320, 390 and 1280 responsive layouts",
          "two-phase Project creation and transfer request exact replay without operator execution",
          "durable transfer recovery and exact-replay withdrawal before a replacement intent",
          "cross-tab cancelled request replay and stale cancellation reconciliation",
          "fresh legacy URL recovers the authorized Project destination after ACTIVE and HTTP 410",
          "non-owner cutover recovery never exposes the target Project",
        ],
        projectContentPosts: contentPosts.length,
        projectGovernancePosts: governancePosts.length,
        transferPosts: transferPosts.length,
        cancelPosts: cancelPosts.length,
      },
      null,
      2,
    ),
  );
  console.log("Project WBS browser checks passed.");
} catch (error) {
  await page.screenshot({ path: path.join(output, "project-wbs-failure.png"), fullPage: true });
  throw error;
} finally {
  await context.tracing.stop({ path: path.join(output, "project-wbs-trace.zip") });
  await context.close();
  await browser.close();
  await fixture.pg.close();
}
