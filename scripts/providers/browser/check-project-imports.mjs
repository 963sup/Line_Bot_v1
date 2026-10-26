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
const resolved = (specifier) => import(pathToFileURL(webRequire.resolve(specifier)).href);
const { postgresFixture } = await resolved("@line_bot_v1/platform/testing/postgres");
const { createProjectManagement } = await resolved("@line_bot_v1/project/application/management");
const { createPostgresProjectLifecycle, createPostgresProjectManagementStore } = await resolved(
  "@line_bot_v1/project/composition/bootstrap/postgres-project-management-store",
);
const { createProjectRepositoryImports } = await resolved(
  "@line_bot_v1/project/composition/bootstrap/repository-imports",
);
const { PostgresIssueStore } = await resolved("@line_bot_v1/issue/postgres");
const fixture = await postgresFixture();
for (const id of ["owner", "reader"]) {
  await fixture.db.transaction(async (sql) => {
    await sql.query(
      "INSERT INTO users(id,status,status_version,\"createdAt\") VALUES($1,'active',1,1)",
      [id],
    );
    await sql.query("SELECT claim_account_login($1,'USER',$1,1)", [id]);
  });
}
await fixture.pg.query(
  "SELECT * FROM app_private.provision_repository('repo','owner','owner','USER','ImportRepo','private')",
);
const issues = new PostgresIssueStore(fixture.db);
const addIssue = (title) =>
  issues.execute(
    { userId: "owner" },
    {
      action: "create",
      requestId: randomUUID(),
      repositoryId: "repo",
      title,
      body: "",
      criteria: "",
      assigneeIds: [],
    },
    Date.now(),
  );
await addIssue("Open source");
const closed = await addIssue("Closed source");
await issues.execute(
  { userId: "owner" },
  {
    action: "close",
    requestId: randomUUID(),
    repositoryId: "repo",
    issueId: closed.id,
    expectedVersion: closed.version,
    stateReason: "COMPLETED",
    note: "",
  },
  Date.now(),
);
const projects = createProjectManagement({
  activeUser: async (subject) => ({ id: subject }),
  store: () => createPostgresProjectManagementStore(fixture.db),
  lifecycle: () => createPostgresProjectLifecycle(fixture.db),
  now: Date.now,
});
const worker = createProjectRepositoryImports(fixture.db);
const target = new URL(process.env.NAVIGATION_BASE ?? "http://127.0.0.1:4117");
if (
  target.protocol !== "http:" ||
  !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) ||
  target.pathname !== "/"
)
  throw new Error("Loopback origin required.");
const base = target.origin;
const output = process.env.NAVIGATION_ARTIFACT_DIR ?? ".artifacts/browser/project-imports";
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
      displayName: "Import Tester",
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
const posts = [];
let actor = "owner";
let unknown = true;
const generation = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
await context.route("**/*", async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  if (url.origin !== base) return route.abort();
  if (!url.pathname.startsWith("/api/")) return route.continue();
  if (url.pathname === "/api/auth")
    return route.fulfill({ json: { generation, sessionChanged: false } });
  assert.equal(request.headers()["x-app-session-generation"], generation);
  if (url.pathname === "/api/membership")
    return route.fulfill({ json: { member: { id: actor, login: actor, status: "active" } } });
  if (url.pathname === "/api/organization") return route.fulfill({ json: { items: [] } });
  if (url.pathname === "/api/repositories")
    return route.fulfill({
      json: {
        items: actor === "owner" ? [{ id: "repo", ownerLogin: "owner", name: "ImportRepo" }] : [],
      },
    });
  if (url.pathname === "/api/project-management/users")
    return route.fulfill({
      json: { users: url.searchParams.getAll("userId").map((id) => ({ id, login: id })) },
    });
  if (url.pathname === "/api/project-management") {
    try {
      if (request.method() === "POST") {
        const command = request.postDataJSON();
        posts.push(command);
        const receipt = await projects.command(actor, command);
        if (unknown && command.action === "create-project") {
          unknown = false;
          return route.fulfill({ status: 503, json: { error: "建立結果尚待確認。" } });
        }
        return route.fulfill({ json: receipt });
      }
      return route.fulfill({ json: await projects.view(actor, url.searchParams.get("projectId")) });
    } catch (error) {
      return route.fulfill({
        status: typeof error?.status === "number" ? error.status : 503,
        json: { error: error instanceof Error ? error.message : "Project 暫時不可用。" },
      });
    }
  }
  return route.fulfill({ status: 404, json: { error: "Synthetic route unavailable" } });
});
try {
  await page.goto(`${base}/projects/new`);
  await page.getByLabel("Project 名稱", { exact: true }).fill("Imported engineering plan");
  await page.getByRole("checkbox", { name: "從儲存庫匯入項目" }).check();
  await page.getByLabel("儲存庫", { exact: true }).selectOption("repo");
  await expect(page.getByLabel("要匯入的項目", { exact: true })).toHaveValue("OPEN");
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      true,
    );
    await page.screenshot({
      path: path.join(output, `project-import-create-${width}.png`),
      fullPage: true,
    });
  }
  await page.getByRole("button", { name: "建立 Project", exact: true }).click();
  await expect(page.getByRole("button", { name: "重試原操作" })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "重試原操作" }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+$/);
  const projectId = new URL(page.url()).pathname.split("/").pop();
  assert.deepEqual(posts[1], posts[0]);
  assert.equal(posts[0].repositoryId, "repo");
  assert.equal(posts[0].importIssues, "OPEN");
  assert.equal(
    (await fixture.pg.query("SELECT COUNT(*)::int AS count FROM app_private.projects")).rows[0]
      .count,
    1,
  );
  await expect(page.getByText("#1 Open source", { exact: true })).toBeVisible();
  await expect(page.getByText("#2 Closed source", { exact: true })).toHaveCount(0);
  await addIssue("Future source");
  assert.equal((await worker.once(20)).importedItems, 1);
  await page.reload();
  await expect(page.getByText("#3 Future source", { exact: true })).toBeVisible();
  await page.getByLabel("儲存庫", { exact: true }).selectOption("repo");
  await page.getByLabel("要匯入的項目", { exact: true }).selectOption("ALL");
  await page.getByRole("button", { name: "從儲存庫匯入", exact: true }).click();
  await expect(page.getByText("#2 Closed source", { exact: true })).toBeVisible();
  await page.screenshot({
    path: path.join(output, "project-import-items-320.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "停用此儲存庫匯入" }).click();
  await expect(page.getByText("全部 Issues · 已停用", { exact: true })).toBeVisible();
  await addIssue("Not admitted after disable");
  assert.equal((await worker.once(20)).importedItems, 0);
  let view = await projects.view("owner", projectId);
  await projects.command("owner", {
    action: "update-collaborators",
    requestId: randomUUID(),
    projectId,
    expectedVersion: view.project.version,
    collaborators: [{ role: "READER", userId: "reader" }],
  });
  actor = "reader";
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Imported engineering plan", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "從儲存庫匯入", exact: true })).toHaveCount(0);
  await expect(page.getByText("#1 Open source", { exact: true })).toHaveCount(0);
  assert.deepEqual(errors, []);
  writeFileSync(
    path.join(output, "project-import-results.json"),
    JSON.stringify(
      {
        status: "passed",
        scope:
          "Real Next production/browser, synthetic LINE/API transport and real Project/Issue owner runtimes on isolated PGlite",
        checks: [
          "create repository import picker at 1280/390/320",
          "unknown-result reload and exact create retry",
          "Open/All filtering and existing Project configuration",
          "future Issue admission and explicit disable",
          "read-only Project visibility does not grant source Repository access",
        ],
        posts: posts.length,
      },
      null,
      2,
    ),
  );
  console.log("Project repository import browser checks passed.");
} catch (error) {
  await page.screenshot({ path: path.join(output, "project-import-failure.png"), fullPage: true });
  throw error;
} finally {
  await context.tracing.stop({ path: path.join(output, "project-import-trace.zip") });
  await context.close();
  await browser.close();
  await fixture.pg.close();
}
