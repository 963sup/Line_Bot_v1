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
const { repositoryContentScope } = await resolvedImport(
  "@line_bot_v1/repository/postgres/content-scope",
);
const { createObjects } = await resolvedImport("@line_bot_v1/object/application/use-cases/objects");
const { createPostgresObjectDependencies } = await resolvedImport(
  "@line_bot_v1/object/composition/bootstrap/objects",
);
const { createIssues } = await resolvedImport("@line_bot_v1/issue/application/issues");
const { PostgresIssueStore } = await resolvedImport("@line_bot_v1/issue/postgres");
const { createIssueCollaboration } = await resolvedImport(
  "@line_bot_v1/issue/application/collaboration",
);
const { createPostgresIssueCollaborationStore } = await resolvedImport(
  "@line_bot_v1/issue/composition/bootstrap/collaboration",
);

const fixture = await postgresFixture();
for (const [userId, login] of [
  ["owner", "alice"],
  ["other", "bob"],
]) {
  await fixture.db.transaction(async (sql) => {
    await sql.query(
      "INSERT INTO users(id,status,status_version,\"createdAt\") VALUES($1,'active',1,1)",
      [userId],
    );
    await sql.query("SELECT app_private.claim_account_login($1,'USER',$2,1)", [userId, login]);
  });
}
await fixture.pg.query(
  "SELECT * FROM app_private.provision_repository('repo','owner','owner','USER','Alpha','private')",
);
await fixture.pg.query(
  "INSERT INTO app_private.repository_access(repository_id,principal_id,capability,version) VALUES('repo','other','write',1)",
);

const objectOwner = createObjects({
  ...createPostgresObjectDependencies(fixture.db),
  now: Date.now,
});
const issues = createIssues({
  activeUser: async (subject) => ({ id: subject }),
  store: () => new PostgresIssueStore(fixture.db),
  now: Date.now,
});
const issue = await issues.command("owner", {
  action: "create",
  requestId: randomUUID(),
  repositoryId: "repo",
  title: "設備異常",
  body: "追蹤設備 A 的異常。",
  criteria: "確認固定內容版本並完成處理。",
  assigneeIds: [],
});
const issueCollaboration = createIssueCollaboration({
  activeUser: async (subject) => ({ id: subject }),
  store: () => createPostgresIssueCollaborationStore(fixture.db),
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
const output = process.env.NAVIGATION_ARTIFACT_DIR ?? ".artifacts/browser/objects";
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
      displayName: "Object Tester",
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
const objectPosts = [];
const issueReferencePosts = [];
let objectResultUnknown = false;
let issueReferenceResultUnknown = false;
let actor = "owner";

async function scope() {
  const selected = await fixture.db.transaction((sql) =>
    repositoryContentScope(sql, actor, {
      ownerLogin: "alice",
      repositoryName: "Alpha",
    }),
  );
  const permissions = selected.repository.permissions;
  return {
    actorUserId: actor,
    repository: {
      id: selected.repository.id,
      ownerLogin: "alice",
      name: selected.repository.name,
    },
    archived: selected.archived,
    canEdit: permissions.some((value) => ["write", "maintain", "admin"].includes(value)),
    canManageTypes: permissions.includes("admin"),
    canManageRepository: permissions.includes("admin"),
  };
}

function failure(error, fallback) {
  return {
    status: error && typeof error === "object" && "status" in error ? Number(error.status) : 503,
    json: {
      error: error instanceof Error && error.message ? error.message : fallback,
    },
  };
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

  if (
    [
      "/api/repository-object-types",
      "/api/repository-objects",
      "/api/repository-object-relationships",
    ].includes(url.pathname)
  ) {
    try {
      assert.equal(url.searchParams.get("owner"), "alice");
      assert.equal(url.searchParams.get("name"), "Alpha");
      const currentScope = await scope();
      if (request.method() === "POST") {
        const command = request.postDataJSON();
        assert.equal(command.repositoryId, "repo");
        objectPosts.push(command);
        const family =
          url.pathname === "/api/repository-object-types"
            ? "types"
            : url.pathname === "/api/repository-objects"
              ? "objects"
              : "relationships";
        const receipt =
          family === "types"
            ? await objectOwner.executeType(actor, command)
            : family === "objects"
              ? await objectOwner.executeObject(actor, command)
              : await objectOwner.executeRelationship(actor, command);
        if (objectResultUnknown) {
          objectResultUnknown = false;
          return route.fulfill({
            status: 503,
            json: { error: "Object 儲存結果未知，請重試原操作。" },
          });
        }
        return route.fulfill({ json: receipt });
      }
      if (url.pathname === "/api/repository-object-types") {
        return route.fulfill({
          json: {
            ...currentScope,
            ...(await objectOwner.listTypes(actor, {
              repositoryId: "repo",
              ...(url.searchParams.has("after") ? { after: url.searchParams.get("after") } : {}),
            })),
          },
        });
      }
      if (url.pathname === "/api/repository-object-relationships") {
        if ((url.searchParams.get("view") ?? "list") === "history") {
          const relationshipId = url.searchParams.get("relationshipId");
          assert.ok(relationshipId);
          return route.fulfill({
            json: {
              ...currentScope,
              ...(await objectOwner.relationshipHistory(actor, {
                repositoryId: "repo",
                relationshipId,
                ...(url.searchParams.has("before")
                  ? { before: url.searchParams.get("before") }
                  : {}),
              })),
            },
          });
        }
        const objectId = url.searchParams.get("objectId");
        assert.ok(objectId);
        return route.fulfill({
          json: {
            ...currentScope,
            ...(await objectOwner.listRelationships(actor, {
              repositoryId: "repo",
              objectId,
            })),
          },
        });
      }
      const objectId = url.searchParams.get("objectId");
      const view = url.searchParams.get("view") ?? (objectId ? "object" : "list");
      if (view === "list") {
        return route.fulfill({
          json: {
            ...currentScope,
            ...(await objectOwner.listObjects(actor, {
              repositoryId: "repo",
              ...(url.searchParams.has("after") ? { after: url.searchParams.get("after") } : {}),
              ...(url.searchParams.has("typeId") ? { typeId: url.searchParams.get("typeId") } : {}),
              ...(url.searchParams.has("archived")
                ? { archived: url.searchParams.get("archived") === "true" }
                : {}),
            })),
          },
        });
      }
      assert.ok(objectId);
      if (view === "history") {
        return route.fulfill({
          json: {
            ...currentScope,
            ...(await objectOwner.history(actor, {
              repositoryId: "repo",
              objectId,
              ...(url.searchParams.has("before") ? { before: url.searchParams.get("before") } : {}),
            })),
          },
        });
      }
      if (view === "compare") {
        return route.fulfill({
          json: {
            ...currentScope,
            differences: await objectOwner.compareRevisions(actor, {
              repositoryId: "repo",
              objectId,
              beforeId: url.searchParams.get("beforeId"),
              afterId: url.searchParams.get("afterId"),
            }),
          },
        });
      }
      return route.fulfill({
        json: {
          ...currentScope,
          revision: await objectOwner.readObject(actor, {
            repositoryId: "repo",
            objectId,
            ...(url.searchParams.has("revisionId")
              ? { revisionId: url.searchParams.get("revisionId") }
              : {}),
          }),
        },
      });
    } catch (error) {
      return route.fulfill(failure(error, "Object 服務暫時不可用。"));
    }
  }

  if (url.pathname === `/api/issues/${issue.number}`) {
    try {
      assert.equal(url.searchParams.get("owner"), "alice");
      assert.equal(url.searchParams.get("name"), "Alpha");
      return route.fulfill({
        json: await issues.detail(actor, issue.number, {
          ownerLogin: "alice",
          repositoryName: "Alpha",
        }),
      });
    } catch (error) {
      return route.fulfill(failure(error, "Issue 讀取失敗。"));
    }
  }

  if (url.pathname === "/api/issue-collaboration") {
    try {
      if (request.method() === "GET") {
        return route.fulfill({
          json: await issueCollaboration.view(
            actor,
            url.searchParams.get("repositoryId"),
            url.searchParams.get("issueId"),
          ),
        });
      }
      const command = request.postDataJSON();
      issueReferencePosts.push(command);
      const receipt = await issueCollaboration.command(actor, command);
      if (issueReferenceResultUnknown) {
        issueReferenceResultUnknown = false;
        return route.fulfill({
          status: 503,
          json: { error: "Object reference 結果尚未確認，請重試原操作。" },
        });
      }
      return route.fulfill({ json: receipt });
    } catch (error) {
      return route.fulfill(failure(error, "Object references 存取失敗。"));
    }
  }

  return route.fulfill({ status: 404, json: { error: "Synthetic route not provided." } });
});

try {
  await page.goto(`${base}/alice/Alpha/objects`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Object Types" })).toBeVisible();
  await expect(page.getByText("尚無 Object Type。", { exact: true })).toBeVisible();

  await expect(page.locator("#object-type-description")).toHaveAttribute("maxlength", "2000");
  await page.getByLabel("Type 名稱").fill("設備");
  await page.getByLabel("Type 說明").fill("可持續演進的設備內容");
  await page.getByRole("button", { name: "建立 Object Type", exact: true }).click();
  await expect(page.getByText(/設備 · 版本 1/)).toBeVisible();

  await page.getByLabel("Object Type").selectOption({ label: "設備" });
  await page.getByLabel("名稱", { exact: true }).fill("Object A");
  await page.getByLabel("內容", { exact: true }).fill("設備 A 初版內容");
  objectResultUnknown = true;
  await page.getByRole("button", { name: "建立 Object", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("結果未知");
  await expect(page.getByRole("button", { name: "重試原操作", exact: true })).toBeVisible();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "重試原操作", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "重試原操作", exact: true }).click();
  await expect(page.getByRole("link", { name: "Object A", exact: true })).toBeVisible();
  assert.deepEqual(objectPosts.at(-1), objectPosts.at(-2));
  const objectAId = objectPosts.at(-1).objectId;
  const objectAInitial = await objectOwner.readObject("owner", {
    repositoryId: "repo",
    objectId: objectAId,
  });

  await page.getByLabel("Object Type").selectOption({ label: "設備" });
  await page.getByLabel("名稱", { exact: true }).fill("Object B");
  await page.getByLabel("內容", { exact: true }).fill("設備 B 初版內容");
  await page.getByRole("button", { name: "建立 Object", exact: true }).click();
  await expect(page.getByRole("link", { name: "Object B", exact: true })).toBeVisible();
  const objectBId = objectPosts.at(-1).objectId;

  await page.getByLabel("名稱", { exact: true }).fill("不可跨 session 保留的名稱");
  await page.getByLabel("內容", { exact: true }).fill("不可跨 session 保留的私有草稿");
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  await expect(page.getByTestId("object-list")).toHaveCount(0);
  await page.getByTestId("objects-refresh").click();
  await expect(page.getByTestId("object-list")).toBeVisible();
  await expect(page.getByLabel("名稱", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("內容", { exact: true })).toHaveValue("");

  await page.getByRole("link", { name: "Object A", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Object A", exact: true })).toBeVisible();
  await page.getByLabel("關係名稱").fill("depends on");
  await page.getByLabel("Target Object ID").fill(objectBId);
  await page.getByRole("button", { name: "建立關係", exact: true }).click();
  await expect(page.getByText(/Outgoing:/)).toContainText("depends on");
  const relationshipId = objectPosts.at(-1).relationshipId;

  await page.goto(`${base}/alice/Alpha/issues/${issue.number}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByRole("heading", { name: `#${issue.number} 設備異常` })).toBeVisible();
  await expect(page.getByText("此 Issue 尚未引用 Object。", { exact: true })).toBeVisible();
  await page.getByLabel("引用目前 Object Revision").selectOption({ label: "Object A · 設備" });
  issueReferenceResultUnknown = true;
  await page.getByRole("button", { name: "新增引用", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("結果尚未確認");
  actor = "other";
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.getByText("Object A", { exact: true })).toHaveCount(0);
  await expect(
    page.getByText("上一筆 Object reference 操作結果尚未確認。", { exact: false }),
  ).toHaveCount(0);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.getByText("設備 · 固定 Revision v1", { exact: true })).toBeVisible();
  actor = "owner";
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.getByText("Object A", { exact: true })).toHaveCount(0);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.getByRole("button", { name: "重試原操作", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "重試原操作", exact: true }).click();
  await expect(page.getByText("設備 · 固定 Revision v1", { exact: true })).toBeVisible();
  assert.deepEqual(issueReferencePosts.at(-1), issueReferencePosts.at(-2));
  const initialReference = (await issueCollaboration.view("owner", "repo", issue.id))
    .objectReferences[0];
  assert.equal(initialReference.revisionId, objectAInitial.id);

  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(page.getByText("設備 · 固定 Revision v1", { exact: true })).toBeVisible();

  await page.goto(`${base}/alice/Alpha/objects/${objectAId}`, {
    waitUntil: "domcontentloaded",
  });
  await page.locator("#object-detail-content").fill("設備 A 第二版內容");
  await page.getByRole("button", { name: "儲存內容", exact: true }).click();
  await expect(page.getByText(/設備 · 版本 2/)).toBeVisible();
  const objectAEdited = await objectOwner.readObject("owner", {
    repositoryId: "repo",
    objectId: objectAId,
  });
  assert.notEqual(objectAEdited.id, objectAInitial.id);
  await page.getByRole("button", { name: "查看版本歷史", exact: true }).click();
  const versionOne = page.getByTestId("object-history").getByRole("listitem").filter({
    hasText: "版本 1 · create",
  });
  await versionOne.getByRole("button", { name: "與目前版本比較", exact: true }).click();
  await expect(page.getByTestId("object-comparison")).toContainText("設備 A 初版內容");
  await expect(page.getByTestId("object-comparison")).toContainText("設備 A 第二版內容");
  await versionOne.getByRole("button", { name: "查看", exact: true }).click();
  await expect(page.getByText(/設備 · 版本 1 · 歷史版本/)).toBeVisible();
  await page.getByRole("button", { name: "還原為新版本", exact: true }).click();
  await expect(page.getByText(/設備 · 版本 3/)).toBeVisible();
  await expect(page.getByTestId("object-history")).toHaveCount(0);
  await expect(page.getByTestId("object-comparison")).toHaveCount(0);
  const objectACurrent = await objectOwner.readObject("owner", {
    repositoryId: "repo",
    objectId: objectAId,
  });
  assert.equal(objectACurrent.version, 3);
  assert.equal(objectACurrent.content, "設備 A 初版內容");

  await page.goto(`${base}/alice/Alpha/issues/${issue.number}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByText("設備 · 固定 Revision v1", { exact: true })).toBeVisible();
  await expect(page.getByText("Object 已有較新 Revision v3。", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "更新至目前 Revision", exact: true }).click();
  await expect(page.getByText("設備 · 固定 Revision v3", { exact: true })).toBeVisible();
  await expect(page.getByText(/Object 已有較新 Revision/)).toHaveCount(0);
  const updatedReference = (await issueCollaboration.view("owner", "repo", issue.id))
    .objectReferences[0];
  assert.equal(updatedReference.revisionId, objectACurrent.id);

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      `Issue Object references overflow at ${width}`,
    );
    await page.screenshot({
      path: path.join(output, `issue-object-reference-${width}.png`),
      fullPage: true,
    });
  }

  await fixture.pg.query(
    "UPDATE app_private.repository_access SET capability='read',version=version+1 WHERE repository_id='repo' AND principal_id='other'",
  );
  actor = "other";
  await page.goto(`${base}/alice/Alpha/objects/${objectAId}`, {
    waitUntil: "domcontentloaded",
  });
  const relationshipPanel = page.getByTestId("object-relationships");
  await expect(relationshipPanel).toContainText("depends on");
  await expect(
    relationshipPanel.getByRole("button", { name: "重新命名", exact: true }),
  ).toHaveCount(0);
  await expect(relationshipPanel.getByRole("button", { name: "移除", exact: true })).toHaveCount(0);
  await relationshipPanel.getByRole("button", { name: "查看關係歷史", exact: true }).click();
  await expect(page.getByTestId("object-relationship-history")).toContainText(
    "版本 1 · create · depends on",
  );
  assert.equal(
    (
      await objectOwner.relationshipHistory("other", {
        repositoryId: "repo",
        relationshipId,
      })
    ).items[0]?.relationshipId,
    relationshipId,
  );
  actor = "owner";

  await page.goto(`${base}/alice/Alpha/objects/${objectAId}`, {
    waitUntil: "domcontentloaded",
  });
  await page.getByRole("button", { name: "封存 Object", exact: true }).click();
  await expect(page.getByText(/設備 · 版本 4 · 已封存/)).toBeVisible();
  await expect(page.locator("#object-detail-content")).toBeDisabled();
  await page.getByRole("link", { name: "返回 Objects", exact: true }).click();
  await expect(page.getByRole("link", { name: "Object A", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Object B", exact: true })).toBeVisible();
  await page.getByLabel("顯示已封存 Objects", { exact: true }).check();
  await expect(page.getByRole("link", { name: "Object A", exact: true })).toBeVisible();
  await expect(page.getByTestId("object-list")).toContainText("Object A · 設備 · 版本 4 · 已封存");
  await page.getByRole("link", { name: "Object A", exact: true }).click();
  await page.getByRole("button", { name: "取消封存", exact: true }).click();
  await expect(page.getByText(/設備 · 版本 5/)).toBeVisible();
  await expect(page.getByRole("button", { name: "封存 Object", exact: true })).toBeVisible();

  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      `Object detail overflow at ${width}`,
    );
    await page.screenshot({
      path: path.join(output, `objects-${width}.png`),
      fullPage: true,
    });
  }

  await fixture.pg.query("UPDATE app_private.users SET status='paused' WHERE id='owner'");
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.getByText("設備 A 初版內容", { exact: true })).toHaveCount(0);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.getByRole("main").getByRole("alert")).toContainText("資格不可用");
  await expect(page.getByTestId("object-detail")).toHaveCount(0);

  const rows = await fixture.pg.query(
    `SELECT
       (SELECT count(*)::int FROM app_private.object_types) AS types,
       (SELECT count(*)::int FROM app_private.objects) AS objects,
       (SELECT count(*)::int FROM app_private.object_relationships WHERE active) AS relationships,
       (SELECT count(*)::int FROM app_private.issue_object_references) AS issue_references`,
  );
  assert.deepEqual(rows.rows, [{ types: 1, objects: 2, relationships: 1, issue_references: 1 }]);
  assert.deepEqual(errors, []);
  writeFileSync(
    path.join(output, "objects-results.json"),
    JSON.stringify(
      {
        status: "passed",
        scope:
          "Real Next production/browser with synthetic LINE/API transport and real Object and Issue owner use cases on isolated local PGlite; no production mutation.",
        checks: [
          "Object Type and two Object instances",
          "unknown-result exact replay keeps one Object identity",
          "pagehide clears unsubmitted private Object drafts",
          "directed Object relationship",
          "read-only actor can inspect Relationship history without mutation controls",
          "Issue fixed Object revision exact replay remains bound to its actor",
          "Object history comparison and restore clear derived panels",
          "Object edit and restore leave the Issue revision pinned until explicit update",
          "Object archive filter and unarchive lifecycle",
          "320 and 390 mobile layouts plus desktop Object detail",
          "current qualification loss clears private Object state",
        ],
        objectPosts: objectPosts.length,
        issueReferencePosts: issueReferencePosts.length,
      },
      null,
      2,
    ),
  );
  console.log("Object browser checks passed.");
} catch (error) {
  await page.screenshot({ path: path.join(output, "objects-failure.png"), fullPage: true });
  throw error;
} finally {
  await context.tracing.stop({ path: path.join(output, "objects-trace.zip") });
  await context.close();
  await browser.close();
  await fixture.pg.close();
}
