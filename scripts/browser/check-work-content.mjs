import assert from "node:assert/strict";
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
const { createResources } = await resolvedImport(
  "@line_bot_v1/resources/application/use-cases/resources",
);
const { createPostgresResourceDependencies } = await resolvedImport(
  "@line_bot_v1/resources/composition/bootstrap/resources",
);
const { createContentPlans } = await resolvedImport(
  "@line_bot_v1/content/application/use-cases/plans",
);
const { createPostgresContentPlanDependencies } = await resolvedImport(
  "@line_bot_v1/content/composition/bootstrap/plans",
);
const { createContracts } = await resolvedImport(
  "@line_bot_v1/contract/application/use-cases/contracts",
);
const { createPostgresContractDependencies } = await resolvedImport(
  "@line_bot_v1/contract/composition/bootstrap/contracts",
);
const { createExecutions } = await resolvedImport(
  "@line_bot_v1/execution/application/use-cases/executions",
);
const { createTaskDependencies } = await resolvedImport(
  "@line_bot_v1/execution/application/use-cases/task-dependencies",
);
const { createPostgresExecutionDependencies } = await resolvedImport(
  "@line_bot_v1/execution/composition/bootstrap/executions",
);
const { createPostgresTaskDependencyDependencies } = await resolvedImport(
  "@line_bot_v1/execution/composition/bootstrap/task-dependencies",
);

const target = new URL(process.env.NAVIGATION_BASE ?? "http://127.0.0.1:4117");
if (
  target.protocol !== "http:" ||
  !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) ||
  target.pathname !== "/"
)
  throw new Error("Loopback origin required.");
const base = target.origin;
const output = process.env.NAVIGATION_ARTIFACT_DIR ?? ".artifacts/browser/work-content";
mkdirSync(output, { recursive: true });

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

let clock = 100;
const resources = createResources({
  ...createPostgresResourceDependencies(fixture.db),
  now: () => clock++,
});
const content = createContentPlans({
  ...createPostgresContentPlanDependencies(fixture.db),
  now: () => clock++,
});
const contracts = createContracts({
  ...createPostgresContractDependencies(fixture.db),
  now: () => clock++,
});
const taskDependencies = createTaskDependencies({
  ...createPostgresTaskDependencyDependencies(fixture.db),
  now: () => clock++,
});
const executions = createExecutions({
  ...createPostgresExecutionDependencies(fixture.db),
  now: () => clock++,
});

async function scope() {
  const selected = await fixture.db.transaction((sql) =>
    repositoryContentScope(sql, "owner", { ownerLogin: "alice", repositoryName: "Alpha" }),
  );
  return {
    actorUserId: "owner",
    repository: { id: selected.repository.id, ownerLogin: "alice", name: "Alpha" },
    archived: selected.archived,
    canEdit: selected.repository.permissions.some((value) =>
      ["write", "maintain", "admin"].includes(value),
    ),
    canManage: selected.repository.permissions.includes("admin"),
  };
}

function failure(error) {
  return {
    status: error && typeof error === "object" && "status" in error ? Number(error.status) : 503,
    json: {
      error: error instanceof Error ? error.message : "Synthetic owner request failed.",
      ...(error && typeof error === "object" && "code" in error ? { code: error.code } : {}),
    },
  };
}

const posts = { resources: [], content: [], contracts: [], executions: [] };
const generation = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const browserErrors = [];
const apiFailures = [];
let delayedResourceMutation = null;

function holdNextResourceMutation(mode = "fulfill") {
  assert.ok(mode === "fulfill" || mode === "abort");
  let markStarted;
  let release;
  const started = new Promise((resolve) => {
    markStarted = resolve;
  });
  const released = new Promise((resolve) => {
    release = resolve;
  });
  delayedResourceMutation = { markStarted, mode, released };
  return { started, release };
}

const browser = await chromium.launch({
  headless: true,
  channel: process.env.NAVIGATION_BROWSER_CHANNEL || undefined,
});
const context = await browser.newContext({
  viewport: { width: 1280, height: 960 },
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
      displayName: "Work Content Tester",
    }),
    login: () => {},
    closeWindow: () => {},
    openWindow: () => {},
  };
});
await context.tracing.start({ screenshots: true, snapshots: true });
const page = await context.newPage();
page.on("pageerror", (error) => browserErrors.push(error.message));
page.on("response", (response) => {
  if (response.url().startsWith(`${base}/api/`) && response.status() >= 400)
    apiFailures.push(`${response.status()} ${response.url()}`);
});

await context.route("**/*", async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  if (url.origin !== base) return route.abort();
  if (!url.pathname.startsWith("/api/")) return route.continue();
  if (url.pathname === "/api/auth")
    return route.fulfill({ json: { generation, sessionChanged: false } });
  assert.equal(request.headers()["x-app-session-generation"], generation);
  assert.equal(url.searchParams.get("owner"), "alice");
  assert.equal(url.searchParams.get("name"), "Alpha");
  const currentScope = await scope();
  try {
    if (url.pathname === "/api/repository-resources") {
      if (request.method() === "POST") {
        const command = request.postDataJSON();
        posts.resources.push(command);
        const result = await resources.execute("owner", command);
        const delayed = delayedResourceMutation;
        if (delayed) {
          delayedResourceMutation = null;
          delayed.markStarted();
          await delayed.released;
          if (delayed.mode === "abort") return route.abort("failed");
        }
        return route.fulfill({ json: result });
      }
      const resourceId = url.searchParams.get("resourceId");
      if (!resourceId)
        return route.fulfill({
          json: {
            ...currentScope,
            ...(await resources.list("owner", "repo", url.searchParams.get("after") ?? undefined)),
          },
        });
      return route.fulfill({
        json: {
          ...currentScope,
          revision: await resources.read("owner", {
            repositoryId: "repo",
            resourceId,
            ...(url.searchParams.has("revisionId")
              ? { revisionId: url.searchParams.get("revisionId") }
              : {}),
          }),
        },
      });
    }
    if (url.pathname === "/api/repository-content") {
      if (request.method() === "POST") {
        const command = request.postDataJSON();
        posts.content.push(command);
        return route.fulfill({ json: await content.execute("owner", command) });
      }
      try {
        return route.fulfill({
          json: {
            ...currentScope,
            revision: await content.read("owner", {
              repositoryId: "repo",
              ...(url.searchParams.has("revisionId")
                ? { revisionId: url.searchParams.get("revisionId") }
                : {}),
            }),
          },
        });
      } catch (error) {
        if (!url.searchParams.has("revisionId") && error?.code === "NOT_FOUND")
          return route.fulfill({ json: { ...currentScope, revision: null } });
        throw error;
      }
    }
    if (url.pathname === "/api/repository-contracts") {
      if (request.method() === "POST") {
        const command = request.postDataJSON();
        posts.contracts.push(command);
        return route.fulfill({ json: await contracts.execute("owner", command) });
      }
      const contractId = url.searchParams.get("contractId");
      if (!contractId)
        return route.fulfill({
          json: {
            ...currentScope,
            ...(await contracts.list("owner", "repo", url.searchParams.get("after") ?? undefined)),
          },
        });
      return route.fulfill({
        json: {
          ...currentScope,
          revision: await contracts.read("owner", {
            repositoryId: "repo",
            contractId,
            ...(url.searchParams.has("revisionId")
              ? { revisionId: url.searchParams.get("revisionId") }
              : {}),
          }),
        },
      });
    }
    if (url.pathname === "/api/repository-executions") {
      if (request.method() === "POST") {
        const command = request.postDataJSON();
        posts.executions.push(command);
        if (command.action === "replace-dependencies")
          return route.fulfill({
            json: await taskDependencies.execute("owner", { ...command, action: "replace" }),
          });
        return route.fulfill({ json: await executions.execute("owner", command) });
      }
      if (url.searchParams.get("view") === "dependencies")
        return route.fulfill({
          json: {
            ...currentScope,
            dependencies: await taskDependencies.read("owner", {
              repositoryId: "repo",
              planRevisionId: url.searchParams.get("planRevisionId"),
            }),
          },
        });
      const executionId = url.searchParams.get("executionId");
      if (executionId)
        return route.fulfill({
          json: {
            ...currentScope,
            revision: await executions.read("owner", { repositoryId: "repo", executionId }),
          },
        });
      return route.fulfill({
        json: {
          ...currentScope,
          ...(await executions.list(
            "owner",
            { repositoryId: "repo", contractId: url.searchParams.get("contractId") },
            url.searchParams.get("after") ?? undefined,
          )),
        },
      });
    }
    return route.fulfill({ status: 404, json: { error: "Synthetic route not provided." } });
  } catch (error) {
    return route.fulfill(failure(error));
  }
});

function card(title) {
  return page.locator('[data-slot="card"]').filter({ hasText: title });
}

function productAlerts() {
  return page.getByRole("main").getByRole("alert");
}

function waitForMutation(pathname) {
  return page.waitForResponse((response) => {
    const request = response.request();
    return new URL(response.url()).pathname === pathname && request.method() === "POST";
  });
}

async function waitForCompletedResponse(responsePromise) {
  const response = await responsePromise;
  await response.finished();
  return response;
}

async function selectByText(select, text) {
  const option = select.locator("option").filter({ hasText: text });
  await expect(option).toHaveCount(1);
  const value = await option.getAttribute("value");
  assert.notEqual(value, null);
  await select.selectOption(value);
}

async function addResource(kind, name, description) {
  const editor = card("新增 Resource").last();
  await editor.locator("select").selectOption(kind);
  await editor.locator("input").fill(name);
  await editor.locator("textarea").fill(description);
  await editor.getByRole("button", { name: "建立", exact: true }).click();
  await expect(page.getByRole("button", { name: new RegExp(name) })).toBeVisible();
}

async function addNode(kind, parent, title) {
  const editor = card("新增節點");
  await editor.locator("select").nth(0).selectOption(kind);
  const parentSelect = editor.locator("select").nth(1);
  if (parent) {
    await expect(parentSelect).toBeEnabled();
    await parentSelect.selectOption({ label: parent });
  } else {
    await expect(parentSelect).toBeDisabled();
    await expect(parentSelect.locator('option[value=""]')).toHaveText("根節點");
    await expect(parentSelect).toHaveValue("");
  }
  await editor.locator("input").fill(title);
  await editor.locator("textarea").fill(`${title} 內容`);
  await editor.getByRole("button", { name: "加入", exact: true }).click();
  await expect(page.locator("strong", { hasText: `${kind}: ${title}` })).toBeVisible();
}

function nodeEditor(kind, title) {
  return page.locator("strong", { hasText: `${kind}: ${title}` }).locator("xpath=../..");
}

try {
  await page.goto(`${base}/alice/Alpha/resources`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText("實體資源", { exact: true })).toBeVisible();
  await addResource("LOCATION", "機房 A", "主幹光纖起點");
  await page.getByRole("button", { name: "新增 Resource", exact: true }).click();
  await addResource("EQUIPMENT", "熔接機 A", "施工設備");
  const locationCommand = posts.resources.find((command) => command.kind === "LOCATION");
  const equipmentCommand = posts.resources.find((command) => command.kind === "EQUIPMENT");
  assert.ok(locationCommand && equipmentCommand);
  const location = await resources.read("owner", {
    repositoryId: "repo",
    resourceId: locationCommand.resourceId,
  });
  const equipment = await resources.read("owner", {
    repositoryId: "repo",
    resourceId: equipmentCommand.resourceId,
  });

  await page.goto(`${base}/alice/Alpha/content`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText("工作階層", { exact: true })).toBeVisible();
  await addNode("SUBJECT", null, "光纖網路");
  await addNode("OBJECT", "光纖網路", "25P1");
  await addNode("SUBOBJECT", "25P1", "主幹段");
  await addNode("WORK", "主幹段", "主幹光纖施工");
  for (const task of ["施工準備", "管路確認", "光纜佈放", "光纖熔接", "測試驗收"])
    await addNode("TASK", "主幹光纖施工", task);

  const measures = card("計量基準與 Resources");
  await measures.getByLabel("計量名稱").fill("施工長度");
  await measures.getByLabel("計量主題").fill("完成光纜佈放長度");
  await measures.getByLabel("計量單位").selectOption("m");
  await measures.getByRole("button", { name: "新增 measure", exact: true }).click();
  for (const [kind, title] of [
    ["WORK", "主幹光纖施工"],
    ["TASK", "管路確認"],
    ["TASK", "光纜佈放"],
  ]) {
    const editor = nodeEditor(kind, title);
    await editor.getByLabel("計量基準").selectOption({ label: "施工長度 (m)" });
    await editor.getByLabel("計畫數量").fill("100");
  }
  await measures.locator("select").nth(1).selectOption({ label: "主幹光纖施工" });
  await measures.locator("select").nth(2).selectOption({ label: "LOCATION: 機房 A" });
  await measures.getByRole("button", { name: "固定 Resource", exact: true }).click();
  await measures.locator("select").nth(1).selectOption({ label: "光纜佈放" });
  await measures.locator("select").nth(2).selectOption({ label: "EQUIPMENT: 熔接機 A" });
  await measures.getByRole("button", { name: "固定 Resource", exact: true }).click();
  const savePlan = card("新增節點").getByRole("button", { name: "儲存版本", exact: true });
  const initialPlanResponse = waitForMutation("/api/repository-content");
  await savePlan.click();
  await waitForCompletedResponse(initialPlanResponse);
  await expect(savePlan).toBeEnabled();
  await expect(page.getByRole("button", { name: /^(?:重試原命令|原命令重試)$/ })).toHaveCount(0);
  await expect(page.getByText("尚未初始化，可新增第一個 Subject。")).toHaveCount(0);
  const initialPlan = await content.read("owner", { repositoryId: "repo" });
  assert.equal(initialPlan.version, 1);
  assert.equal(initialPlan.document.nodes.length, 9);
  assert.equal(initialPlan.document.resourcePins.length, 2);
  const prerequisiteTask = initialPlan.document.nodes.find(
    (node) => node.kind === "TASK" && node.title === "管路確認",
  );
  assert.ok(prerequisiteTask);

  await page.goto(`${base}/alice/Alpha/contracts`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText("工作承諾", { exact: true })).toBeVisible();
  const contractEditor = card("新增 Contract").last();
  await contractEditor.locator("input").first().fill("主幹光纖合約");
  await contractEditor.locator("textarea").fill("25P1 正式承諾");
  await selectByText(contractEditor.locator("select"), /WORK: 主幹光纖施工/);
  await contractEditor.locator('input[placeholder="約定數量"]').fill("100");
  await contractEditor.getByRole("button", { name: "加入", exact: true }).click();
  await contractEditor.getByRole("button", { name: "建立草稿", exact: true }).click();
  await expect(page.getByRole("button", { name: /主幹光纖合約/ })).toBeVisible();
  const contractCreate = posts.contracts.find((command) => command.action === "create");
  assert.ok(contractCreate);

  await page.goto(`${base}/alice/Alpha/content`, { waitUntil: "domcontentloaded" });
  const taskEditor = nodeEditor("TASK", "光纜佈放");
  await taskEditor.getByLabel("節點標題").fill("光纜佈放（核准版）");
  const revisedPlanResponse = waitForMutation("/api/repository-content");
  await savePlan.click();
  await waitForCompletedResponse(revisedPlanResponse);
  await expect(savePlan).toBeEnabled();
  await expect(nodeEditor("TASK", "光纜佈放（核准版）")).toBeVisible();
  await expect(page.getByRole("button", { name: /^(?:重試原命令|原命令重試)$/ })).toHaveCount(0);
  const currentPlan = await content.read("owner", { repositoryId: "repo" });
  assert.equal(currentPlan.version, 2);

  await page.goto(`${base}/alice/Alpha/contracts`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /主幹光纖合約/ }).click();
  await expect(page.getByRole("button", { name: "啟用", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "啟用", exact: true }).click();
  await expect(page.getByRole("button", { name: /主幹光纖合約.*ACTIVE/ })).toBeVisible();
  const activeContract = await contracts.read("owner", {
    repositoryId: "repo",
    contractId: contractCreate.contractId,
  });
  assert.equal(activeContract.state, "ACTIVE");
  assert.equal(activeContract.lines[0].content.planRevisionId, initialPlan.revisionId);

  await page.goto(`${base}/alice/Alpha/executions`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Task actuals", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /主幹光纖合約.*ACTIVE/ }).click();
  const executionEditor = card("提交 Execution");
  await selectByText(executionEditor.locator("select").nth(0), /主幹光纖施工/);
  await selectByText(executionEditor.locator("select").nth(1), /光纜佈放 · 100 m/);
  await executionEditor.locator("select").nth(2).selectOption({ label: "光纜佈放" });
  await executionEditor.locator("select").nth(3).selectOption({ label: "管路確認" });
  await executionEditor.getByRole("button", { name: "新增 prerequisite", exact: true }).click();
  const saveDependencies = executionEditor.getByRole("button", {
    name: "儲存 Task dependencies",
    exact: true,
  });
  const dependencyResponse = waitForMutation("/api/repository-executions");
  await saveDependencies.click();
  await waitForCompletedResponse(dependencyResponse);
  await expect(saveDependencies).toBeEnabled();
  await expect(page.getByRole("button", { name: /^(?:重試原命令|原命令重試)$/ })).toHaveCount(0);
  const savedDependency = await taskDependencies.read("owner", {
    repositoryId: "repo",
    planRevisionId: initialPlan.revisionId,
  });
  assert.equal(savedDependency.version, 1);
  assert.equal(savedDependency.edges.length, 1);
  await executionEditor.getByText("LOCATION: 機房 A").locator("input").check();
  await executionEditor.getByText("EQUIPMENT: 熔接機 A").locator("input").check();
  await executionEditor.locator("input").last().fill("50");
  await executionEditor.locator("textarea").fill("光纜佈放完成 50m");
  const submitExecution = executionEditor.getByRole("button", {
    name: "提交實績",
    exact: true,
  });
  await expect(submitExecution).toBeEnabled();
  await submitExecution.click();
  await expect(page.getByRole("button", { name: /50.*SUBMITTED/ })).toBeVisible();
  const submit = posts.executions.find((command) => command.action === "submit");
  assert.ok(submit);
  assert.equal(submit.observedDependencyVersion, savedDependency.version);
  await page.getByRole("button", { name: /50.*SUBMITTED/ }).click();
  const reviewEditor = card("審查 Execution");
  await expect(reviewEditor).toContainText("Task: 光纜佈放 (TASK)");
  await expect(reviewEditor).toContainText("實績：50 m");
  await expect(reviewEditor).toContainText("Contract agreed：100 m");
  await expect(reviewEditor).toContainText("Task planned：100 m");
  await expect(reviewEditor).toContainText("備註：光纜佈放完成 50m");
  await expect(reviewEditor).toContainText("Resources：LOCATION: 機房 A、EQUIPMENT: 熔接機 A");
  await expect(reviewEditor).toContainText("Dependency v1：");
  await expect(reviewEditor).toContainText(prerequisiteTask.id);
  await reviewEditor.getByRole("button", { name: "接受", exact: true }).click();
  await expect(page.getByRole("button", { name: /50.*ACCEPTED/ })).toBeVisible();

  const dependency = await taskDependencies.read("owner", {
    repositoryId: "repo",
    planRevisionId: initialPlan.revisionId,
  });
  const execution = await executions.read("owner", {
    repositoryId: "repo",
    executionId: submit.executionId,
  });
  assert.equal(dependency.version, 1);
  assert.equal(dependency.edges.length, 1);
  assert.equal(execution.state, "ACCEPTED");
  assert.equal(execution.task.planRevisionId, initialPlan.revisionId);
  assert.deepEqual(
    execution.resources.map((resource) => [resource.resourceId, resource.resourceRevisionId]),
    [
      [location.resourceId, location.revisionId],
      [equipment.resourceId, equipment.revisionId],
    ],
  );
  assert.equal((await content.history("owner", { repositoryId: "repo" })).revisions.length, 2);
  assert.equal(
    (
      await contracts.history("owner", {
        repositoryId: "repo",
        contractId: contractCreate.contractId,
      })
    ).revisions.length,
    2,
  );
  assert.equal(
    (await executions.history("owner", { repositoryId: "repo", executionId: submit.executionId }))
      .revisions.length,
    2,
  );
  await expect(productAlerts()).toHaveCount(0);
  assert.deepEqual(browserErrors, []);
  assert.deepEqual(apiFailures, []);
  await page.getByRole("button", { name: /50.*ACCEPTED/ }).click();
  const acceptedReview = card("審查 Execution");
  await expect(acceptedReview).toContainText("Task: 光纜佈放 (TASK)");
  await expect(acceptedReview).toContainText("Contract agreed：100 m");
  await expect(acceptedReview).toContainText("Resources：LOCATION: 機房 A、EQUIPMENT: 熔接機 A");
  await expect(acceptedReview).toContainText("Dependency v1：");
  await page.screenshot({ path: path.join(output, "accepted-execution.png"), fullPage: true });

  async function submitAdditionalExecution(quantityValue, noteValue) {
    await page.getByRole("button", { name: /主幹光纖合約.*ACTIVE/ }).click();
    const editor = card("提交 Execution");
    await selectByText(editor.locator("select").nth(0), /主幹光纖施工/);
    await selectByText(editor.locator("select").nth(1), /光纜佈放 · 100 m/);
    await editor.getByText("LOCATION: 機房 A").locator("input").check();
    await editor.locator("input").last().fill(quantityValue);
    await editor.locator("textarea").fill(noteValue);
    const commandIndex = posts.executions.length;
    const response = waitForMutation("/api/repository-executions");
    const button = editor.getByRole("button", { name: "提交實績", exact: true });
    await expect(button).toBeEnabled();
    await button.click();
    await waitForCompletedResponse(response);
    await expect(
      page.getByRole("button", { name: new RegExp(`${quantityValue}.*SUBMITTED`) }),
    ).toBeVisible();
    const command = posts.executions[commandIndex];
    assert.ok(command && command.action === "submit");
    return command;
  }

  const stillSubmittedCommand = await submitAdditionalExecution("25", "結案後仍需審查");
  await page.getByRole("button", { name: /25.*SUBMITTED/ }).click();
  const submittedReview = card("審查 Execution");
  await expect(submittedReview).toContainText("備註：結案後仍需審查");
  await submittedReview.locator("textarea").fill("SUBMITTED 不可作廢");
  await expect(submittedReview.getByRole("button", { name: "作廢", exact: true })).toBeDisabled();

  const rejectedCommand = await submitAdditionalExecution("10", "退回後不可作廢");
  await page.getByRole("button", { name: /10.*SUBMITTED/ }).click();
  const rejectReview = card("審查 Execution");
  await rejectReview.locator("textarea").fill("資料需補正");
  await expect(rejectReview.getByRole("button", { name: "作廢", exact: true })).toBeDisabled();
  const rejectResponse = waitForMutation("/api/repository-executions");
  await rejectReview.getByRole("button", { name: "退回", exact: true }).click();
  await waitForCompletedResponse(rejectResponse);
  await expect(page.getByRole("button", { name: /10.*REJECTED/ })).toBeVisible();
  const rejectedExecution = await executions.read("owner", {
    repositoryId: "repo",
    executionId: rejectedCommand.executionId,
  });
  assert.equal(rejectedExecution.state, "REJECTED");
  await page.getByRole("button", { name: /10.*REJECTED/ }).click();
  const rejectedReview = card("審查 Execution");
  await rejectedReview.locator("textarea").fill("REJECTED 不可作廢");
  await expect(rejectedReview.getByRole("button", { name: "作廢", exact: true })).toBeDisabled();

  const closedContract = (
    await contracts.execute("owner", {
      action: "close",
      repositoryId: "repo",
      contractId: activeContract.contractId,
      requestId: "77777777-7777-4777-8777-777777777777",
      expectedVersion: activeContract.version,
    })
  ).revision;
  assert.equal(closedContract.state, "CLOSED");
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByText("Task actuals", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /主幹光纖合約.*CLOSED/ }).click();

  await page.getByRole("button", { name: /25.*SUBMITTED/ }).click();
  const closedSubmittedReview = card("審查 Execution");
  await expect(closedSubmittedReview).toContainText("Task: 光纜佈放 (TASK)");
  await expect(closedSubmittedReview).toContainText("備註：結案後仍需審查");
  await expect(closedSubmittedReview).toContainText("Contract agreed：100 m");
  await closedSubmittedReview.locator("textarea").fill("CLOSED 後 SUBMITTED 仍不可作廢");
  await expect(
    closedSubmittedReview.getByRole("button", { name: "作廢", exact: true }),
  ).toBeDisabled();

  await page.getByRole("button", { name: /主幹光纖合約.*CLOSED/ }).click();
  const closedSubmitEditor = card("提交 Execution");
  await selectByText(closedSubmitEditor.locator("select").nth(0), /主幹光纖施工/);
  await selectByText(closedSubmitEditor.locator("select").nth(1), /光纜佈放 · 100 m/);
  await closedSubmitEditor.locator("input").last().fill("1");
  const submittedCommandCount = posts.executions.filter(
    (command) => command.action === "submit",
  ).length;
  await expect(
    closedSubmitEditor.getByRole("button", { name: "提交實績", exact: true }),
  ).toBeDisabled();
  assert.equal(
    posts.executions.filter((command) => command.action === "submit").length,
    submittedCommandCount,
  );

  await page.getByRole("button", { name: /50.*ACCEPTED/ }).click();
  const closedAcceptedReview = card("審查 Execution");
  await expect(closedAcceptedReview).toContainText("Task: 光纜佈放 (TASK)");
  await closedAcceptedReview.locator("textarea").fill("合約結案後撤銷誤登實績");
  const voidButton = closedAcceptedReview.getByRole("button", { name: "作廢", exact: true });
  await expect(voidButton).toBeEnabled();
  const voidResponse = waitForMutation("/api/repository-executions");
  await voidButton.click();
  await waitForCompletedResponse(voidResponse);
  await expect(page.getByRole("button", { name: /50.*VOIDED/ })).toBeVisible();
  const voidedExecution = await executions.read("owner", {
    repositoryId: "repo",
    executionId: submit.executionId,
  });
  assert.equal(voidedExecution.state, "VOIDED");
  assert.equal(
    (
      await contracts.history("owner", {
        repositoryId: "repo",
        contractId: activeContract.contractId,
      })
    ).revisions.length,
    3,
  );
  assert.equal(
    (await executions.history("owner", { repositoryId: "repo", executionId: submit.executionId }))
      .revisions.length,
    3,
  );
  await page.getByRole("button", { name: /50.*VOIDED/ }).click();
  const voidedReview = card("審查 Execution");
  await voidedReview.locator("textarea").fill("VOIDED 不可再次作廢");
  await expect(voidedReview.getByRole("button", { name: "作廢", exact: true })).toBeDisabled();
  assert.equal(
    (
      await executions.read("owner", {
        repositoryId: "repo",
        executionId: stillSubmittedCommand.executionId,
      })
    ).state,
    "SUBMITTED",
  );
  await expect(productAlerts()).toHaveCount(0);

  const mobileRoutes = [
    {
      section: "content",
      heading: "Content",
      ready: () => page.getByText("工作階層", { exact: true }),
    },
    {
      section: "resources",
      heading: "Resources",
      ready: () => page.getByText("實體資源", { exact: true }),
    },
    {
      section: "contracts",
      heading: "Contracts",
      ready: () => page.getByText("工作承諾", { exact: true }),
    },
    {
      section: "executions",
      heading: "Executions",
      ready: () => page.getByText("Task actuals", { exact: true }),
    },
  ];
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const route of mobileRoutes) {
      await page.goto(`${base}/alice/Alpha/${route.section}`, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: route.heading, exact: true })).toBeVisible();
      await expect(page.getByText("alice/Alpha", { exact: true })).toBeVisible();
      await expect(route.ready()).toBeVisible();
      const layout = await page.evaluate(() => ({
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: innerWidth,
      }));
      assert.ok(
        layout.documentWidth <= layout.viewportWidth,
        `${route.heading} overflows at ${width}px: document ${layout.documentWidth}px, viewport ${layout.viewportWidth}px.`,
      );
      await page.screenshot({
        path: path.join(output, `${route.section}-${width}.png`),
        fullPage: true,
      });
    }
  }
  await page.setViewportSize({ width: 1280, height: 960 });

  await page.goto(`${base}/alice/Alpha/resources`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText("實體資源", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "新增 Resource", exact: true }).click();
  const staleEditor = card("新增 Resource").last();
  const staleName = "不可跨 session 保留的材料";
  const staleDescription = "延遲回應不得恢復的私有說明";
  await staleEditor.locator("select").selectOption("MATERIAL");
  await staleEditor.locator("input").fill(staleName);
  await staleEditor.locator("textarea").fill(staleDescription);
  const heldMutation = holdNextResourceMutation();
  const delayedResponse = page.waitForResponse(
    (response) =>
      response.url().startsWith(`${base}/api/repository-resources?`) &&
      response.request().method() === "POST",
  );
  await staleEditor.getByRole("button", { name: "建立", exact: true }).click();
  await heldMutation.started;
  const staleOriginal = posts.resources.at(-1);
  assert.ok(staleOriginal);
  const staleCommitted = await resources.read("owner", {
    repositoryId: "repo",
    resourceId: staleOriginal.resourceId,
  });
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(staleEditor.locator("input")).toHaveValue("");
  await expect(staleEditor.locator("textarea")).toHaveValue("");
  await expect(page.getByRole("button", { name: /^(?:重試原命令|原命令重試)$/ })).toHaveCount(0);
  await expect(productAlerts()).toHaveCount(0);
  heldMutation.release();
  const completedDelayedResponse = await delayedResponse;
  await completedDelayedResponse.finished();
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      }),
  );
  await expect(staleEditor.locator("input")).toHaveValue("");
  await expect(staleEditor.locator("textarea")).toHaveValue("");
  await expect(page.getByRole("button", { name: /^(?:重試原命令|原命令重試)$/ })).toHaveCount(0);
  await expect(productAlerts()).toHaveCount(0);
  const visibleReload = page.waitForResponse(
    (response) =>
      response.url().startsWith(`${base}/api/repository-resources?`) &&
      response.request().method() === "GET" &&
      !new URL(response.url()).searchParams.has("resourceId"),
  );
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await visibleReload;
  await expect(page.getByRole("button", { name: new RegExp(staleName) })).toBeVisible();
  await expect(staleEditor.locator("input")).toHaveValue("");
  await expect(staleEditor.locator("textarea")).toHaveValue("");
  const retryOriginal = page.getByRole("button", {
    name: /^(?:重試原命令|原命令重試)$/,
  });
  await expect(retryOriginal).toBeVisible();
  await expect(productAlerts()).toHaveCount(0);
  const staleRetryIndex = posts.resources.length;
  const staleRetryResponse = page.waitForResponse(
    (response) =>
      response.url().startsWith(`${base}/api/repository-resources?`) &&
      response.request().method() === "POST",
  );
  await retryOriginal.click();
  const completedStaleRetry = await staleRetryResponse;
  await completedStaleRetry.finished();
  await expect(retryOriginal).toHaveCount(0);
  const staleRetry = posts.resources[staleRetryIndex];
  assert.ok(staleRetry);
  assert.equal(staleRetry.requestId, staleOriginal.requestId);
  assert.equal(staleRetry.resourceId, staleOriginal.resourceId);
  const staleAfterRetry = await resources.read("owner", {
    repositoryId: "repo",
    resourceId: staleOriginal.resourceId,
  });
  assert.equal(staleAfterRetry.revisionId, staleCommitted.revisionId);
  assert.equal(
    (
      await resources.history("owner", {
        repositoryId: "repo",
        resourceId: staleOriginal.resourceId,
      })
    ).revisions.length,
    1,
  );
  assert.equal(
    (await resources.list("owner", "repo")).resources.filter(
      (resource) => resource.resourceId === staleOriginal.resourceId,
    ).length,
    1,
  );

  await page.getByRole("button", { name: "新增 Resource", exact: true }).click();
  const rejectedName = "拒絕舊回應後可重新讀取的材料";
  const rejectedDescription = "舊 fetch rejection 不得恢復的私有說明";
  await staleEditor.locator("select").selectOption("MATERIAL");
  await staleEditor.locator("input").fill(rejectedName);
  await staleEditor.locator("textarea").fill(rejectedDescription);
  const rejectedMutation = holdNextResourceMutation("abort");
  const failedRequest = page.waitForEvent(
    "requestfailed",
    (request) =>
      request.url().startsWith(`${base}/api/repository-resources?`) && request.method() === "POST",
  );
  await staleEditor.getByRole("button", { name: "建立", exact: true }).click();
  await rejectedMutation.started;
  const rejectedOriginal = posts.resources.at(-1);
  assert.ok(rejectedOriginal);
  const rejectedCommitted = await resources.read("owner", {
    repositoryId: "repo",
    resourceId: rejectedOriginal.resourceId,
  });
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(staleEditor.locator("input")).toHaveValue("");
  await expect(staleEditor.locator("textarea")).toHaveValue("");
  rejectedMutation.release();
  await failedRequest;
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      }),
  );
  await expect(staleEditor.locator("input")).toHaveValue("");
  await expect(staleEditor.locator("textarea")).toHaveValue("");
  await expect(page.getByRole("button", { name: /^(?:重試原命令|原命令重試)$/ })).toHaveCount(0);
  await expect(productAlerts()).toHaveCount(0);
  const rejectedVisibleReload = page.waitForResponse(
    (response) =>
      response.url().startsWith(`${base}/api/repository-resources?`) &&
      response.request().method() === "GET" &&
      !new URL(response.url()).searchParams.has("resourceId"),
  );
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await rejectedVisibleReload;
  await expect(page.getByRole("button", { name: new RegExp(rejectedName) })).toBeVisible();
  await expect(staleEditor.locator("input")).toHaveValue("");
  await expect(staleEditor.locator("textarea")).toHaveValue("");
  await expect(retryOriginal).toBeVisible();
  await expect(productAlerts()).toHaveCount(0);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByText("實體資源", { exact: true })).toBeVisible();
  const remountedEditor = card("新增 Resource").last();
  await expect(remountedEditor.locator("input")).toHaveValue("");
  await expect(remountedEditor.locator("textarea")).toHaveValue("");
  await expect(retryOriginal).toBeVisible();
  await expect(productAlerts()).toHaveCount(0);
  const rejectedRetryIndex = posts.resources.length;
  const rejectedRetryResponse = page.waitForResponse(
    (response) =>
      response.url().startsWith(`${base}/api/repository-resources?`) &&
      response.request().method() === "POST",
  );
  await retryOriginal.click();
  const completedRejectedRetry = await rejectedRetryResponse;
  await completedRejectedRetry.finished();
  await expect(retryOriginal).toHaveCount(0);
  const rejectedRetry = posts.resources[rejectedRetryIndex];
  assert.ok(rejectedRetry);
  assert.equal(rejectedRetry.requestId, rejectedOriginal.requestId);
  assert.equal(rejectedRetry.resourceId, rejectedOriginal.resourceId);
  const rejectedAfterRetry = await resources.read("owner", {
    repositoryId: "repo",
    resourceId: rejectedOriginal.resourceId,
  });
  assert.equal(rejectedAfterRetry.revisionId, rejectedCommitted.revisionId);
  assert.equal(
    (
      await resources.history("owner", {
        repositoryId: "repo",
        resourceId: rejectedOriginal.resourceId,
      })
    ).revisions.length,
    1,
  );
  assert.equal(
    (await resources.list("owner", "repo")).resources.filter(
      (resource) => resource.resourceId === rejectedOriginal.resourceId,
    ).length,
    1,
  );
  assert.deepEqual(browserErrors, []);
  assert.deepEqual(apiFailures, []);
  writeFileSync(
    path.join(output, "evidence.json"),
    `${JSON.stringify(
      {
        synthetic: true,
        remote: false,
        repositoryId: "repo",
        resourceIds: [location.resourceId, equipment.resourceId],
        initialPlanRevisionId: initialPlan.revisionId,
        currentPlanRevisionId: currentPlan.revisionId,
        contractId: activeContract.contractId,
        executionId: execution.executionId,
        dependencyRevisionId: dependency.revisionId,
        acceptedStateAtCapture: execution.state,
        finalExecutionState: voidedExecution.state,
        closedContractState: closedContract.state,
        submittedAfterClosureState: "SUBMITTED",
        rejectedExecutionState: rejectedExecution.state,
        staleResourceResponseDiscarded: true,
        staleResourceRejectionDiscarded: true,
        resourceExactReplayKeptSingleRevision: true,
        resourcePendingRecoveredAfterReload: true,
      },
      null,
      2,
    )}\n`,
  );
} catch (error) {
  await page
    .screenshot({ path: path.join(output, "work-content-failure.png"), fullPage: true })
    .catch(() => {});
  throw error;
} finally {
  await context.tracing.stop({ path: path.join(output, "trace.zip") }).catch(() => {});
  await browser.close();
  await fixture.pg.close();
}
