import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fulfillLineSessionMock } from "./line-session-mock.mjs";
import { captureShell, measureShellNavigation } from "./shell-evidence.mjs";

const require = createRequire(import.meta.url);
const packagePath = process.env.PLAYWRIGHT_PACKAGE_PATH;
const loadPlaywright = packagePath
  ? (name) => require(path.join(path.resolve(packagePath), name))
  : require;
const { chromium } = loadPlaywright("playwright");
const { expect } = loadPlaywright("playwright/test");

const configuredBase = process.env.NAVIGATION_BASE ?? "http://127.0.0.1:4117";
const baseUrl = new URL(configuredBase);
if (
  baseUrl.protocol !== "http:" ||
  !new Set(["127.0.0.1", "localhost", "[::1]"]).has(baseUrl.hostname) ||
  baseUrl.pathname !== "/" ||
  baseUrl.search ||
  baseUrl.hash
) {
  throw new Error("NAVIGATION_BASE must be a loopback HTTP origin.");
}
const base = baseUrl.origin;
const artifactDir = process.env.NAVIGATION_ARTIFACT_DIR;
if (artifactDir) mkdirSync(artifactDir, { recursive: true });

async function run() {
  const browser = await chromium.launch({
    channel: process.env.NAVIGATION_BROWSER_CHANNEL || undefined,
    headless: true,
  });
  const context = await browser.newContext({
    serviceWorkers: "block",
    viewport: { width: 390, height: 844 },
  });
  await context.addInitScript(() => {
    window.liff = {
      init: async () => {
        window.liffInitializations = (window.liffInitializations ?? 0) + 1;
        const current = new URL(location.href);
        if (current.searchParams.has("liff.state"))
          history.replaceState(null, "", "/settings?google=link&code=secret&state=secret");
      },
      isLoggedIn: () => true,
      getAccessToken: () => "synthetic",
      isInClient: () => false,
      getProfile: async () => ({
        userId: "U11111111111111111111111111111111",
        displayName: "測試使用者",
        statusMessage: "Ready to work",
      }),
      closeWindow: () => {},
      openWindow: () => {},
      login: () => {},
    };
  });
  if (artifactDir) await context.tracing.start({ screenshots: true, snapshots: true });
  const page = await context.newPage();
  const errors = [];
  const posts = [];
  const reads = [];
  let membershipLogin = "viewer";
  let teamCreationAllowed = false;
  const membershipStatus = "active";
  const repositoryId = "repo-1";
  const viewerRepositoryId = "repo-2";
  const issueId = "11111111-1111-4111-8111-111111111111";
  const issueNumber = 1;
  const notificationId = "22222222-2222-4222-8222-222222222222";
  const starListId = "33333333-3333-4333-8333-333333333333";
  const issue = {
    id: issueId,
    repositoryId,
    number: issueNumber,
    publisher: "user-1",
    assignees: ["user-2"],
    title: "測試 Issue",
    body: "測試 Issue body",
    criteria: "完成核對",
    state: "OPEN",
    stateReason: null,
    workflowStatus: "pending",
    version: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const starList = {
    id: starListId,
    ownerLogin: "viewer",
    name: "Operations Toolkit",
    description: "Curated operations repositories",
    visibility: "public",
    version: 3,
    visibleRepositoryCount: 1,
    createdAt: Date.now() - 5 * 24 * 60 * 60 * 1000,
    updatedAt: Date.now() - 24 * 60 * 60 * 1000,
  };
  const notification = {
    id: notificationId,
    recipient: "user-1",
    sourceType: "issue",
    sourceId: issueId,
    sourceVersion: "1",
    kind: "issue",
    title: "Issue 已更新",
    body: "請查看最新 Issue。",
    createdAt: Date.now(),
    readAt: null,
    version: 1,
  };

  page.on("pageerror", (error) => {
    errors.push(error.message);
    console.error("PAGEERROR", error.stack);
  });
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== base) return route.abort();
    if (await fulfillLineSessionMock(route)) return;
    if (!url.pathname.startsWith("/api/")) return route.continue();

    if (request.method() === "POST")
      posts.push({ path: url.pathname, body: request.postDataJSON() });
    else reads.push(url.pathname + url.search);

    if (url.pathname === "/api/membership") {
      return route.fulfill({
        json: {
          member: {
            id: "user-1",
            login: membershipLogin,
            status: membershipStatus,
            createdAt: 1,
            googleEmail: null,
          },
        },
      });
    }
    if (url.pathname === "/api/team") {
      if (
        url.searchParams.get("organizationLogin") !== "acme" ||
        url.searchParams.get("teamSlug") !== "operations"
      ) {
        return route.fulfill({ status: 403, json: { error: "無法存取此組織團隊。" } });
      }
      const team = {
        id: "team-1",
        organizationAccountId: "org-1",
        name: "Operations Team",
        slug: "operations",
        parentTeamId: null,
        privacy: "VISIBLE",
        notificationSetting: "NOTIFICATIONS_DISABLED",
        version: 1,
        membershipStatus: "active",
        membershipType: "IMMEDIATE",
        isMaintainer: false,
        canManage: false,
      };
      return route.fulfill({
        json: {
          userId: "user-1",
          organizations: [{ organizationAccountId: "org-1", login: "acme" }],
          organizationAccountId: "org-1",
          organizationLogin: "acme",
          viewerCanCreateTeams: teamCreationAllowed,
          teams: [team],
          team,
          childTeams: [],
          members: [],
        },
      });
    }
    if (url.pathname === "/api/profile/achievements") {
      return route.fulfill({
        json: {
          items: [
            {
              id: "first-repository",
              name: "First Repository",
              description: "Created the first Repository.",
              iconRef: null,
              sourceKind: "repository",
              sourceId: viewerRepositoryId,
              awardedAt: Date.now(),
            },
          ],
        },
      });
    }
    if (url.pathname === "/api/profile") {
      return route.fulfill({
        json: {
          profile: {
            userId: "user-1",
            displayName: "測試使用者",
            bio: null,
            avatarRef: null,
            visibility: "private",
            version: 1,
            createdAt: 1,
            updatedAt: 1,
          },
        },
      });
    }
    if (url.pathname === "/api/organization") {
      return route.fulfill({
        json: {
          items: [
            {
              id: "org-1",
              login: "acme-org",
              name: "Acme",
              status: "active",
              version: 1,
              actorMembershipStatus: "active",
              actorDirectMembershipVersion: 1,
              actorInvitationStatus: null,
              actorInvitationVersion: null,
              actorIsOwner: false,
              actorMemberRole: "MEMBER",
              actorCanCreateProjectV2: false,
            },
          ],
          next: null,
        },
      });
    }
    if (url.pathname === "/api/repositories/starred") {
      return route.fulfill({
        json: {
          items: [
            {
              id: repositoryId,
              ownerLogin: "acme",
              name: "Operations",
              visibility: "private",
              starredAt: Date.now(),
              starCount: 3,
            },
          ],
        },
      });
    }
    if (url.pathname === "/api/repositories/lists/discover") {
      return route.fulfill({
        json: {
          items: [
            {
              id: starListId,
              ownerLogin: "viewer",
              name: starList.name,
              description: starList.description,
              visibleRepositoryCount: 1,
              updatedAt: starList.updatedAt,
              repositories: [{ id: repositoryId, ownerLogin: "acme", name: "Operations" }],
            },
          ],
        },
      });
    }
    if (url.pathname === "/api/repositories/lists") {
      return route.fulfill({ json: { items: [starList] } });
    }
    if (url.pathname === `/api/repositories/lists/${starListId}`) {
      return route.fulfill({
        json: {
          item: {
            ...starList,
            editable: true,
            repositories: [
              {
                id: repositoryId,
                ownerLogin: "acme",
                name: "Operations",
                visibility: "private",
              },
            ],
          },
        },
      });
    }
    if (url.pathname === "/api/projects") {
      return route.fulfill({
        json: {
          items: [
            {
              id: "project-1",
              ownerLogin: "viewer",
              ownerKind: "USER",
              number: 1,
              name: "Operations Plan",
              public: false,
              closed: false,
              role: "ADMIN",
              version: 1,
            },
            {
              id: "project-legacy",
              ownerLogin: "viewer",
              ownerKind: "USER",
              number: null,
              name: "Legacy Plan",
              public: false,
              closed: false,
              role: "ADMIN",
              version: 1,
            },
          ],
        },
      });
    }
    if (url.pathname === "/api/repositories") {
      return route.fulfill({
        json: {
          items: [
            { id: repositoryId, ownerLogin: "acme", name: "Operations", permissions: ["admin"] },
            {
              id: viewerRepositoryId,
              ownerLogin: "viewer",
              name: "Personal",
              permissions: ["admin"],
            },
          ],
        },
      });
    }
    if (url.pathname === "/api/repositories/explore") {
      if (request.method() === "POST") return route.fulfill({ json: { ok: true } });
      if (url.searchParams.get("view") === "activity")
        return route.fulfill({
          json: {
            activity: [
              {
                id: `${issueId}:1`,
                occurredAt: Date.now() - 3 * 24 * 60 * 60 * 1000,
                actorLogin: "viewer",
                action: "create",
                repository: { id: repositoryId, ownerLogin: "acme", name: "Operations" },
                issue: { number: issueNumber, title: issue.title },
              },
            ],
          },
        });
      return route.fulfill({
        json: {
          items: [
            {
              id: repositoryId,
              ownerLogin: "acme",
              name: "Operations",
              visibility: "private",
              permissions: ["admin"],
              recentStarCount: 2,
              starCount: 3,
              starred: false,
            },
            {
              id: viewerRepositoryId,
              ownerLogin: "viewer",
              name: "Personal",
              visibility: "private",
              permissions: ["admin"],
              recentStarCount: 1,
              starCount: 2,
              starred: false,
            },
          ],
          activity: [
            {
              id: `${issueId}:1`,
              occurredAt: Date.now() - 3 * 24 * 60 * 60 * 1000,
              actorLogin: "viewer",
              action: "create",
              repository: { id: repositoryId, ownerLogin: "acme", name: "Operations" },
              issue: { number: issueNumber, title: issue.title },
            },
          ],
        },
      });
    }
    if (url.pathname === "/api/issues") {
      if (request.method() === "POST") return route.fulfill({ json: { issue } });
      return route.fulfill({
        json: {
          userId: "user-1",
          repositories: [
            { id: repositoryId, ownerLogin: "acme", name: "Operations", permissions: ["admin"] },
          ],
          participants: [
            { userId: "user-1", name: "使用者一" },
            { userId: "user-2", name: "使用者二" },
          ],
          issues: [issue],
          events: [],
          next: null,
        },
      });
    }
    if (url.pathname === `/api/issues/${issueNumber}`) {
      return route.fulfill({
        json: {
          userId: "user-1",
          repositories: [
            { id: repositoryId, ownerLogin: "acme", name: "Operations", permissions: ["admin"] },
          ],
          participants: [
            { userId: "user-1", name: "使用者一" },
            { userId: "user-2", name: "使用者二" },
          ],
          issues: [issue],
          events: [],
        },
      });
    }
    if (url.pathname === "/api/notifications") {
      if (request.method() === "POST") {
        return route.fulfill({
          json: { notification: { ...notification, readAt: Date.now(), version: 2 } },
        });
      }
      return route.fulfill({ json: { items: [notification] } });
    }
    return route.fulfill({ status: 404, json: { error: "synthetic route not found" } });
  });

  try {
    await page.goto(`${base}/`);
    await page.getByRole("heading", { name: "Line_Bot_v1", exact: true }).waitFor();
    await expect(page.getByRole("link", { name: "使用 LINE 進入", exact: true })).toHaveAttribute(
      "href",
      "/home",
    );
    await expect(page.getByRole("link", { name: "建立會員資格", exact: true })).toHaveAttribute(
      "href",
      "/membership/register",
    );
    await expect(page.getByRole("heading", { name: "讓每天的工作，更有條理。" })).toHaveCount(0);

    await page.goto(`${base}/?liff.state=%3Fmembership%3D1`);
    await expect(page).toHaveURL(`${base}/settings?google=link`);
    await page.getByRole("heading", { name: "Settings", exact: true }).waitFor();
    await expect(page.getByRole("heading", { name: "讓每天的工作，更有條理。" })).toHaveCount(0);

    await page.goto(`${base}/home`);
    await page.getByRole("heading", { name: "Home", exact: true }).waitFor();
    await expect(page.locator(".member-avatar")).toHaveCount(1);
    await expect(page.getByRole("link", { name: "個人檔案", exact: true })).toHaveAttribute(
      "href",
      "/viewer",
    );

    membershipLogin = "";
    await page.goto(`${base}/home`);
    await page.getByRole("heading", { name: "Home", exact: true }).waitFor();
    await expect(page.getByRole("link", { name: "設定登入名稱", exact: true })).toHaveCount(0);
    await expect(page.getByLabel("個人檔案目前不可用", { exact: true })).toBeVisible();

    await page.goto(`${base}/profile`);
    await expect(page.getByRole("main").getByRole("alert")).toHaveText(
      "帳號識別資料不完整，個人檔案目前無法使用。請聯絡管理者。",
    );

    membershipLogin = "viewer";
    await page.goto(`${base}/home`);
    await page.getByRole("heading", { name: "Home", exact: true }).waitFor();
    await expect(page.getByRole("link", { name: "個人檔案", exact: true })).toHaveAttribute(
      "href",
      "/viewer",
    );
    await expect(
      page.getByRole("link", { name: "Search repositories", exact: true }),
    ).toHaveAttribute("href", "/search");

    await page.goto(`${base}/home`);
    await expect(page.getByRole("button", { name: "Refresh Home", exact: true })).toBeVisible();
    await Promise.all([
      page.waitForEvent("domcontentloaded"),
      page.getByRole("button", { name: "Refresh Home", exact: true }).click(),
    ]);
    await expect(page).toHaveURL(`${base}/home`);
    await expect(page.getByRole("link", { name: "個人檔案", exact: true })).toHaveAttribute(
      "href",
      "/viewer",
    );
    await expect(page.getByRole("heading", { name: "My Work", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Shortcuts", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Recent", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Popular", exact: true })).toHaveCount(0);
    await expect(
      page
        .getByRole("region", { name: "Starred repositories", exact: true })
        .getByRole("link", { name: /acme\/Operations/ }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: new RegExp(issue.title) })).toHaveAttribute(
      "href",
      "/acme/Operations/issues/1",
    );
    assert.equal(await page.evaluate(() => window.liffInitializations), 1);
    await captureShell(page, artifactDir, "home", 1);
    const shellNavigation = await measureShellNavigation(page, artifactDir, [
      {
        label: "Explore",
        pathname: "/explore",
        heading: "Explore",
        ready: () =>
          expect(page.getByRole("link", { name: new RegExp(issue.title) })).toBeVisible(),
      },
      {
        label: "Inbox",
        pathname: "/notifications",
        heading: "Inbox",
        ready: () =>
          expect(page.getByRole("link", { name: new RegExp(notification.title) })).toBeVisible(),
      },
      {
        label: "Home",
        pathname: "/home",
        heading: "Home",
        ready: () =>
          expect(
            page
              .getByRole("region", { name: "Starred repositories", exact: true })
              .getByRole("link", { name: /acme\/Operations/ }),
          ).toBeVisible(),
      },
    ]);
    assert.ok(
      shellNavigation.samples.every((sample) => sample.retained),
      "tabs navigation must preserve the shared shell",
    );
    await page.goto(`${base}/settings`);
    await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
    await captureShell(page, artifactDir, "settings", 0);
    await page.locator(".app-shell").evaluate((element) => {
      element.dataset.secondaryEvidence = "retained";
    });
    await page.getByRole("link", { name: /Account & Connections/ }).click();
    await expect(page).toHaveURL(`${base}/settings/account`);
    await expect(
      page.getByRole("heading", { name: "Account & Connections", exact: true }),
    ).toBeVisible();
    assert.equal(
      await page.locator(".app-shell").getAttribute("data-secondary-evidence"),
      "retained",
      "secondary navigation preserves its shared shell",
    );
    await expect(page.getByRole("navigation", { name: "主要導覽", exact: true })).toHaveCount(0);
    await page.goBack();
    await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
    assert.equal(
      await page.locator(".app-shell").getAttribute("data-secondary-evidence"),
      "retained",
    );
    const secondaryInitializations = await page.evaluate(() => window.liffInitializations);
    await page.locator(".back-link").click();
    await expect(page).toHaveURL(`${base}/home`);
    await expect(page.getByRole("navigation", { name: "主要導覽", exact: true })).toHaveCount(1);
    assert.equal(
      await page.evaluate(() => window.liffInitializations),
      secondaryInitializations,
      "cross-group navigation does not initialize LIFF again",
    );
    await page.goto(`${base}/home`);
    await expect(
      page
        .getByRole("region", { name: "Starred repositories", exact: true })
        .getByRole("link", { name: /acme\/Operations/ }),
    ).toBeVisible();
    await expect(
      page.locator('script[src="https://static.line-scdn.net/liff/edge/2/sdk.js"]'),
    ).toHaveCount(0);
    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        true,
        `Home fits ${width}px`,
      );
    }
    await page.setViewportSize({ width: 390, height: 844 });
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      for (const position of ["top", "scrolled"]) {
        await page.evaluate((position) => {
          window.scrollTo({
            top: position === "top" ? 0 : document.documentElement.scrollHeight,
            behavior: "instant",
          });
        }, position);
        await expect(page.getByRole("navigation", { name: "主要導覽", exact: true })).toHaveCount(
          1,
        );
        const layout = await page.evaluate(() => {
          const navigation = document.querySelector(".work-navigation");
          const toolbar = document.querySelector(".home-toolbar");
          return {
            position: getComputedStyle(navigation).position,
            bottom: navigation.getBoundingClientRect().bottom,
            viewportHeight: window.innerHeight,
            toolbarTop: toolbar.getBoundingClientRect().top,
            scrollY: window.scrollY,
          };
        });
        assert.equal(layout.position, "fixed");
        assert.ok(
          Math.abs(layout.bottom - layout.viewportHeight) <= 1,
          `navigation stays at viewport bottom: ${width}px ${position}`,
        );
        if (position === "scrolled") {
          assert.ok(layout.scrollY > 0);
          assert.ok(Math.abs(layout.toolbarTop) <= 1, "Home toolbar stays at viewport top");
        }
        if (artifactDir && width === 390) {
          await page.screenshot({ path: path.join(artifactDir, `home-${position}.png`) });
        }
      }
    }
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.getByText("More", { exact: true }).click();
    await expect(page.getByRole("link", { name: /Admin/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Issues/ })).toHaveAttribute("href", "/issues");
    await expect(page.getByRole("link", { name: /Discussions/ })).toHaveAttribute(
      "href",
      "/repositories?resource=discussions",
    );
    await expect(page.getByRole("link", { name: /Organizations/ })).toHaveAttribute(
      "href",
      "/organizations",
    );
    await expect(page.getByRole("link", { name: /Starred/ })).toHaveAttribute("href", "/stars");
    await page.getByRole("link", { name: /Starred/ }).click();
    await expect(page).toHaveURL(`${base}/stars`);
    await expect(
      page.getByRole("heading", { name: "Starred Repositories", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /acme\/Operations/ })).toHaveAttribute(
      "href",
      "/acme/Operations",
    );
    await page.reload();
    await expect(page.getByRole("link", { name: /acme\/Operations/ })).toBeVisible();
    if (artifactDir) {
      await page.screenshot({ path: path.join(artifactDir, "stars.png"), fullPage: true });
    }
    await page.goto(`${base}/home`);
    await expect(page.getByRole("link", { name: /Projects/ })).toHaveAttribute("href", "/projects");
    await page.getByRole("link", { name: /Projects/ }).click();
    await expect(page).toHaveURL(`${base}/projects`);
    await expect(page.getByRole("heading", { name: "Projects", exact: true })).toBeVisible();
    await expect(page.getByText("#1 Operations Plan", { exact: true })).toBeVisible();
    const legacyProjectLink = page.getByRole("link", { name: /Legacy Plan/ });
    await expect(legacyProjectLink).toHaveAttribute("href", "/projects/project-legacy");
    await expect(legacyProjectLink).not.toContainText(/^#\d+\s/);
    await page.getByRole("button", { name: "Organization", exact: true }).click();
    await expect(page.getByText("#1 Operations Plan", { exact: true })).toHaveCount(0);
    await expect(legacyProjectLink).toHaveCount(0);
    await expect(
      page.getByText("此擁有者類型目前沒有可存取的 Project。", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Personal", exact: true }).click();
    await expect(page.getByText("#1 Operations Plan", { exact: true })).toBeVisible();
    await expect(legacyProjectLink).toBeVisible();
    await page.getByRole("button", { name: "All projects", exact: true }).click();
    if (artifactDir) {
      await page.screenshot({ path: path.join(artifactDir, "projects.png"), fullPage: true });
    }
    await page.goto(`${base}/home`);
    await expect(page.getByRole("link", { name: /Settings/ })).toHaveCount(0);
    await page.locator('summary[aria-label="Create"]').click();
    await expect(page.getByRole("link", { name: /Create Issue/ })).toHaveAttribute(
      "href",
      "/repositories?intent=create-issue",
    );

    await page.locator('summary[aria-label="Create"]').press("Enter");
    await expect(page.getByRole("link", { name: /Create Issue/ })).not.toBeVisible();
    await page.locator('summary[aria-label="Create"]').press("Enter");
    await expect(page.getByRole("link", { name: /New Repository/ })).toHaveAttribute(
      "href",
      "/repositories/new",
    );

    let releaseSearchRead;
    const blockedSearchRead = new Promise((resolve) => {
      releaseSearchRead = resolve;
    });
    let searchReply = async (route) => {
      await blockedSearchRead;
      await route.fallback();
    };
    await page.route("**/api/repositories", (route) =>
      searchReply ? searchReply(route) : route.fallback(),
    );

    await page.getByRole("link", { name: "Search repositories", exact: true }).click();
    await expect(page).toHaveURL(`${base}/search`);
    const searchStatus = page.getByRole("status").filter({ hasText: "正在讀取 Repository…" });
    await expect(searchStatus).toBeVisible();
    releaseSearchRead();
    searchReply = undefined;

    const searchbox = page.getByRole("searchbox", {
      name: "Search repositories",
      exact: true,
    });
    const searchGroup = page.locator('[data-slot="input-group"]');
    const searchPrompt = page.getByRole("heading", { name: "Find your stuff.", level: 2 });
    const searchEmpty = page.locator('[data-slot="empty"]');
    const searchResult = page.getByRole("link", { name: /acme\/Operations/ });
    await expect(searchPrompt).toBeVisible();
    await expect(searchbox).toBeFocused();
    await expect(searchbox).toHaveAttribute("type", "search");
    await expect(searchbox).toHaveAttribute("autocapitalize", "none");
    await expect(searchbox).toHaveAttribute("autocorrect", "off");
    await expect(
      searchGroup.getByRole("searchbox", { name: "Search repositories", exact: true }),
    ).toBeVisible();
    await expect(searchGroup).toHaveCSS("height", "44px");
    await expect(
      page.getByText("搜尋你目前有權存取的 Repositories。", { exact: true }),
    ).toBeVisible();

    const searchReads = reads.filter((value) => value === "/api/repositories").length;
    await searchbox.fill("  oPeRaTiOnS  ");
    await expect(searchResult).toHaveAttribute("href", "/acme/Operations");
    await expect(searchResult).toContainText("admin");
    await searchbox.press("Enter");
    await expect(page).toHaveURL(`${base}/search`);
    await searchbox.fill("工程計畫");
    await expect(
      page.getByText("找不到符合「工程計畫」的 Repository。", { exact: true }),
    ).toBeVisible();
    await expect(searchbox).toHaveValue("工程計畫");
    await searchbox.fill("");
    await expect(searchPrompt).toBeVisible();
    assert.equal(reads.filter((value) => value === "/api/repositories").length, searchReads);

    await searchbox.fill("Operations");
    await searchbox.press("Tab");
    await expect(searchResult).toBeFocused();
    await searchResult.press("Enter");
    await expect(page).toHaveURL(`${base}/acme/Operations`);
    await page.goBack();
    await expect(page).toHaveURL(`${base}/search`);
    await expect(searchbox).toBeVisible();
    await page.goto(`${base}/search`);
    await expect(searchPrompt).toBeVisible();
    await page.reload();
    await expect(searchPrompt).toBeVisible();
    await expect(searchbox).toHaveValue("");

    searchReply = (route) => route.fulfill({ status: 503, json: { error: "搜尋來源暫不可用。" } });
    await page.goto(`${base}/search`);
    await expect(page.getByRole("alert").filter({ hasText: "搜尋來源暫不可用。" })).toHaveText(
      "搜尋來源暫不可用。",
    );
    await expect(searchPrompt).toHaveCount(0);
    await expect(searchResult).toHaveCount(0);
    await expect(page.getByText(/找不到符合/)).toHaveCount(0);

    const longRepository = {
      id: "long-repository",
      ownerLogin: "long-owner-abcdefghijklmnopqrst",
      name: `engineering-${"long-name-".repeat(7)}plan`,
      permissions: ["read"],
    };
    searchReply = (route) => route.fulfill({ json: { items: [longRepository] } });
    await page.reload();
    await expect(searchPrompt).toBeVisible();
    const longResult = page.getByRole("link", {
      name: new RegExp(`${longRepository.ownerLogin}/${longRepository.name}`),
    });
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      await searchbox.fill("");
      await expect(searchPrompt).toBeVisible();
      const emptyHeight = await searchEmpty.evaluate(
        (element) => element.getBoundingClientRect().height,
      );
      assert.ok(emptyHeight >= 844 * 0.52 - 1, `search empty state keeps 52vh at ${width}px`);
      await expect(searchGroup).toHaveCSS("height", "44px");
      if (artifactDir) {
        await page.screenshot({
          path: path.join(artifactDir, `search-empty-${width}.png`),
          fullPage: true,
        });
      }

      await searchbox.fill("engineering");
      await expect(longResult).toBeVisible();
      await expect(longResult).toHaveAttribute(
        "href",
        `/${longRepository.ownerLogin}/${longRepository.name}`,
      );
      await searchbox.press("Tab");
      await expect(longResult).toBeFocused();
      await longResult.press("Shift+Tab");
      await expect(searchbox).toBeFocused();
      assert.equal(await searchbox.evaluate((element) => element.matches(":focus-visible")), true);
      const layout = await page.evaluate(() => ({
        viewport: window.innerWidth,
        document: document.documentElement.scrollWidth,
        body: document.body.scrollWidth,
      }));
      assert.ok(
        layout.document <= layout.viewport && layout.body <= layout.viewport,
        `search results overflow at ${width}px: ${JSON.stringify(layout)}`,
      );
      if (artifactDir) {
        await page.screenshot({
          path: path.join(artifactDir, `search-results-${width}.png`),
          fullPage: true,
        });
      }
    }

    let releaseLateSearchRead;
    const blockedLateSearchRead = new Promise((resolve) => {
      releaseLateSearchRead = resolve;
    });
    searchReply = async (route) => {
      await blockedLateSearchRead;
      await route.fulfill({ json: { items: [longRepository] } });
    };
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(longResult).toHaveCount(0);
    const refreshingSearch = page.waitForRequest(
      (request) => new URL(request.url()).pathname === "/api/repositories",
    );
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await refreshingSearch;
    await expect(searchStatus).toBeVisible();
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    const staleSearchResponse = page.waitForResponse(
      (response) => new URL(response.url()).pathname === "/api/repositories",
    );
    releaseLateSearchRead();
    const staleResponse = await staleSearchResponse;
    await staleResponse.finished();
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(resolve));
        }),
    );
    await expect(longResult).toHaveCount(0);
    await expect(searchStatus).toHaveCount(0);

    searchReply = undefined;
    await page.reload();
    await expect(searchPrompt).toBeVisible();
    await searchbox.fill("Operations");
    await expect(searchResult).toBeVisible();
    const sessionReload = page.waitForEvent("load");
    await page.evaluate(() => {
      const channel = new BroadcastChannel("line_bot_v1:session");
      channel.postMessage({ type: "session-changed" });
      channel.close();
    });
    await sessionReload;
    const sessionChangedError = "登入狀態已在其他分頁更新，請選擇「使用 LINE 重新登入」。";
    const sessionChangedAlert = page.getByRole("alert").filter({ hasText: sessionChangedError });
    await expect(sessionChangedAlert).toHaveText(sessionChangedError);
    await expect(searchResult).toHaveCount(0);
    await expect(searchbox).toBeVisible();
    await expect(searchbox).toHaveValue("");
    await searchbox.fill("Operations");
    await expect(searchResult).toHaveCount(0);
    await expect(sessionChangedAlert).toHaveText(sessionChangedError);
    await page.evaluate(() => sessionStorage.removeItem("line_bot_v1:session-blocked"));
    await page.unroute("**/api/repositories");
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto(`${base}/explore`);
    await page.getByRole("heading", { name: "Explore", exact: true }).waitFor();
    await expect(page.getByRole("heading", { name: "Discover", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /Trending Repositories/ })).toHaveAttribute(
      "href",
      "/trending",
    );
    await expect(page.getByRole("link", { name: /Awesome Lists/ })).toHaveAttribute(
      "href",
      "/repositories/lists/discover",
    );
    await expect(page.getByRole("heading", { name: "Activity", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: new RegExp(issue.title) })).toHaveAttribute(
      "href",
      "/acme/Operations/issues/1",
    );

    await page.goto(`${base}/trending`);
    await page.getByRole("heading", { name: "Top Repositories", exact: true }).waitFor();
    await expect(page.getByText("最近 7 天", { exact: true })).toBeVisible();
    await expect(page.getByText("目前可存取", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Trending Repositories", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "acme/Operations", exact: true })).toHaveAttribute(
      "href",
      "/acme/Operations",
    );
    await page.getByRole("button", { name: "Star", exact: true }).first().click();
    await page.getByText("已加入 Star。", { exact: true }).waitFor();
    if (artifactDir) {
      await page.screenshot({
        path: path.join(artifactDir, "trending.png"),
        fullPage: true,
      });
    }

    await page.goto(`${base}/repositories/lists/discover`);
    await page.getByRole("heading", { name: "Awesome Lists", exact: true }).waitFor();
    const discoveredList = page.getByRole("link", { name: starList.name, exact: true });
    await expect(discoveredList).toHaveAttribute("href", `/repositories/lists/${starListId}`);
    await expect(page.getByRole("link", { name: "acme/Operations", exact: true })).toHaveAttribute(
      "href",
      "/acme/Operations",
    );
    if (artifactDir) {
      await page.screenshot({
        path: path.join(artifactDir, "awesome-lists.png"),
        fullPage: true,
      });
    }

    await page.goto(`${base}/repositories/lists`);
    await page.getByRole("heading", { name: "Lists", exact: true }).waitFor();
    await expect(page.getByRole("heading", { name: "My Lists", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /Operations Toolkit/ })).toHaveAttribute(
      "href",
      `/repositories/lists/${starListId}`,
    );
    await expect(page.getByRole("link", { name: "New List", exact: true })).toHaveAttribute(
      "href",
      "/repositories/lists/new",
    );

    await page.goto(`${base}/repositories/lists/${starListId}`);
    await page.getByRole("heading", { name: "List", exact: true }).waitFor();
    await page.getByRole("heading", { name: starList.name, exact: true }).waitFor();
    await expect(page.getByRole("button", { name: "設為 Private", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /acme\/Operations/ })).toHaveAttribute(
      "href",
      "/acme/Operations",
    );

    await page.goto(`${base}/repositories/lists/new`);
    await page.getByRole("heading", { name: "New List", exact: true }).waitFor();
    await expect(page.getByLabel("List name", { exact: true })).toBeVisible();
    await expect(page.getByText(/private 建立/)).toBeVisible();

    await page.goto(`${base}/repositories?intent=create-issue`);
    await page.getByRole("heading", { name: "Choose Repository", exact: true }).waitFor();
    const createRepositoryLink = page.getByRole("link", { name: /acme\/Operations/ });
    await expect(createRepositoryLink).toHaveAttribute("href", "/acme/Operations/issues?create=1");
    await createRepositoryLink.click();
    await expect(page).toHaveURL(`${base}/acme/Operations/issues?create=1`);
    await expect(page.getByRole("button", { name: "收起建立表單", exact: true })).toBeVisible();
    await expect(page.getByLabel("標題", { exact: true })).toBeVisible();

    await page.goto(`${base}/repositories?resource=issues`);
    await page.getByRole("heading", { name: "Choose Repository", exact: true }).waitFor();
    await expect(page.getByRole("link", { name: /acme\/Operations/ })).toHaveAttribute(
      "href",
      "/acme/Operations/issues",
    );
    await page.goto(`${base}/issues`);
    await expect(page.getByRole("heading", { name: "Issues", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /acme\/Operations/ })).toHaveAttribute(
      "href",
      "/acme/Operations/issues",
    );
    await page.goto(`${base}/orgs/acme/teams/operations`);
    await expect(page.getByRole("heading", { name: "Operations Team", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "重新載入", exact: true })).toBeEnabled();
    await expect(page.getByRole("button", { name: "新增團隊", exact: true })).toBeDisabled();
    await expect(page.getByText(/目前帳號沒有此組織的建立團隊資格/)).toBeVisible();
    teamCreationAllowed = true;
    await page.reload();
    await expect(page.getByRole("heading", { name: "Operations Team", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "重新載入", exact: true })).toBeEnabled();
    await expect(page.getByRole("button", { name: "新增團隊", exact: true })).toBeEnabled();
    await expect(page.getByText(/目前帳號沒有此組織的建立團隊資格/)).toHaveCount(0);
    const publishedTeamResponse = await page.goto(`${base}/organizations/acme/teams/operations`);
    assert.equal(publishedTeamResponse?.status(), 200);
    assert.equal(publishedTeamResponse?.request().redirectedFrom(), null);
    await expect(page.getByRole("heading", { name: "Operations Team", exact: true })).toBeVisible();
    await page.goto(`${base}/orgs/other/teams/operations`);
    await expect(page.getByText("無法存取此組織團隊。", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Operations Team", exact: true })).toHaveCount(
      0,
    );

    await page.goto(`${base}/repositories?resource=discussions`);
    await page.getByRole("heading", { name: "Choose Repository", exact: true }).waitFor();
    await expect(page.getByRole("link", { name: /acme\/Operations/ })).toHaveAttribute(
      "href",
      "/acme/Operations/discussions",
    );

    await page.goto(`${base}/repositories`);
    await page.getByRole("heading", { name: "Repositories", exact: true }).waitFor();
    await expect(page.locator(".member-avatar")).toHaveCount(0);
    const repositoryLink = page.getByRole("link", { name: /acme\/Operations/ });
    await expect(repositoryLink).toHaveAttribute("href", "/acme/Operations");
    await page.locator('summary[aria-label="Repository actions"]').click();
    await expect(page.getByRole("link", { name: "Manage Settings", exact: true })).toHaveAttribute(
      "href",
      "/repositories?intent=manage-settings",
    );
    await expect(page.getByRole("link", { name: "New Repository", exact: true })).toHaveAttribute(
      "href",
      "/repositories/new",
    );
    await page.locator('summary[aria-label="Repository actions"]').click();
    await expect(page.getByText("admin", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Explore", exact: true })).toHaveCount(1);
    if (artifactDir) {
      await page.screenshot({ path: path.join(artifactDir, "repositories.png"), fullPage: true });
    }

    await page.goto(`${base}/acme/Operations/issues/${issueNumber}`);
    await page.getByRole("heading", { name: "Issue", exact: true }).waitFor();
    await page
      .getByRole("heading", { name: `#${issue.number} ${issue.title}`, exact: true })
      .waitFor();
    const issueBackLink = page.getByRole("link", { name: "← 返回 Issues", exact: true });
    await expect(issueBackLink).toHaveAttribute("href", "/acme/Operations/issues");
    await issueBackLink.click();
    await expect(page).toHaveURL(`${base}/acme/Operations/issues`);
    await expect(
      page.getByRole("link", { name: new RegExp(`^#${issue.number} ${issue.title}`) }),
    ).toBeVisible();

    await page.goto(`${base}/notifications`);
    await page.getByRole("heading", { name: "Inbox", exact: true }).waitFor();
    await expect(page.locator(".member-avatar")).toHaveCount(0);
    await page.getByRole("link", { name: /Issue 已更新/ }).click();
    await expect(page).toHaveURL(`${base}/notifications/${notificationId}`);
    await page.getByRole("heading", { name: notification.title, exact: true }).waitFor();
    await page.getByRole("button", { name: "標示為已讀", exact: true }).click();
    await page.getByText("已讀", { exact: true }).waitFor();

    assert.ok(reads.some((value) => value.startsWith("/api/repositories")));
    assert.ok(reads.some((value) => value.startsWith("/api/issues")));
    assert.ok(reads.some((value) => value.startsWith("/api/notifications")));
    assert.deepEqual(
      posts.map((value) => value.path),
      ["/api/repositories/explore", "/api/notifications"],
    );
    assert.deepEqual(errors, []);

    if (artifactDir) {
      await page.screenshot({
        path: path.join(artifactDir, "repository-notifications.png"),
        fullPage: true,
      });
    }
    const rowAcceptancePosts = posts.length;
    const rowCases = [
      {
        pathname: "/home",
        scope: ".home-starred",
        title: "acme/Operations",
        description: "private · 3 Stars",
        href: "/acme/Operations",
      },
      {
        pathname: "/stars",
        scope: ".starred-repositories",
        title: "acme/Operations",
        description: "private · 3 Stars",
        href: "/acme/Operations",
      },
      {
        pathname: "/repositories/lists",
        scope: ".crud-manager",
        title: starList.name,
        description: "@viewer · public · 1 repositories",
        href: `/repositories/lists/${starListId}`,
      },
    ];
    for (const rowCase of rowCases) {
      await page.goto(`${base}${rowCase.pathname}`);
      const row = page.locator(rowCase.scope).getByRole("link", { name: rowCase.title });
      await expect(row).toHaveAccessibleName(`${rowCase.title} ${rowCase.description}`);
      await expect(row.locator("strong")).toHaveText(rowCase.title);
      await expect(row.locator("small")).toHaveText(rowCase.description);
      await expect(row).toHaveAttribute("href", rowCase.href);
      await row.focus();
      await expect(row).toBeFocused();
      await row.press("Enter");
      await expect(page).toHaveURL(`${base}${rowCase.href}`);
      await page.goBack();
      await expect(page).toHaveURL(`${base}${rowCase.pathname}`);
      if (artifactDir) {
        await page.screenshot({
          path: path.join(artifactDir, `action-row-${rowCase.pathname.split("/").at(-1)}.png`),
          fullPage: true,
        });
      }
    }

    const longStarredRepository = {
      id: repositoryId,
      ownerLogin: "long-owner-abcdefghijklmnopqrst",
      name: `engineering-${"long-name-".repeat(7)}plan`,
      visibility: "private",
      starredAt: Date.now(),
      starCount: 3,
    };
    const longStarList = { ...starList, name: "Operations Toolkit ".repeat(4).trim() };
    await page.route("**/api/repositories/starred", (route) =>
      route.fulfill({ json: { items: [longStarredRepository] } }),
    );
    await page.route("**/api/repositories/lists", (route) =>
      route.fulfill({ json: { items: [longStarList] } }),
    );
    for (const rowCase of rowCases) {
      const isList = rowCase.pathname === "/repositories/lists";
      const title = isList
        ? longStarList.name
        : `${longStarredRepository.ownerLogin}/${longStarredRepository.name}`;
      const href = isList
        ? rowCase.href
        : `/${longStarredRepository.ownerLogin}/${longStarredRepository.name}`;
      await page.goto(`${base}${rowCase.pathname}`);
      const row = page.locator(rowCase.scope).getByRole("link", { name: title });
      await expect(row).toHaveAccessibleName(`${title} ${rowCase.description}`);
      await expect(row.locator("strong")).toHaveText(title);
      await expect(row.locator("small")).toHaveText(rowCase.description);
      await expect(row).toHaveAttribute("href", href);
      for (const width of [320, 390, 1280]) {
        await page.setViewportSize({ width, height: 844 });
        await row.scrollIntoViewIfNeeded();
        await expect(row).toBeVisible();
        await expect(row.locator(".action-chevron")).toBeInViewport();
        await row.focus();
        await row.press("Shift+Tab");
        await page.keyboard.press("Tab");
        await expect(row).toBeFocused();
        assert.equal(await row.evaluate((element) => element.matches(":focus-visible")), true);
        const layout = await row.evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          const arrow = element.querySelector(".action-chevron").getBoundingClientRect();
          return {
            viewport: innerWidth,
            document: document.documentElement.scrollWidth,
            body: document.body.scrollWidth,
            left: bounds.left,
            right: bounds.right,
            arrowLeft: arrow.left,
            arrowRight: arrow.right,
          };
        });
        assert.ok(
          layout.document <= layout.viewport + 1 && layout.body <= layout.viewport + 1,
          `action row document overflow: ${JSON.stringify(layout)}`,
        );
        assert.ok(
          layout.arrowLeft >= layout.left && layout.arrowRight <= layout.right + 1,
          `action row chevron overflow: ${JSON.stringify(layout)}`,
        );
        if (artifactDir) {
          await page.screenshot({
            path: path.join(
              artifactDir,
              `action-row-${rowCase.pathname.split("/").at(-1)}-long-${width}.png`,
            ),
            fullPage: true,
          });
        }
      }
    }
    await page.unroute("**/api/repositories/starred");
    await page.unroute("**/api/repositories/lists");
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto(`${base}/stars`);
    const freshStarredResult = page
      .locator(".starred-repositories")
      .getByRole("link", { name: "acme/Operations" });
    await expect(freshStarredResult).toBeVisible();
    let releaseLateStarredRead;
    const blockedLateStarredRead = new Promise((resolve) => {
      releaseLateStarredRead = resolve;
    });
    await page.route("**/api/repositories/starred", async (route) => {
      await blockedLateStarredRead;
      await route.fulfill({ json: { items: [longStarredRepository] } });
    });
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(freshStarredResult).toHaveCount(0);
    const refreshingStarred = page.waitForRequest(
      (request) => new URL(request.url()).pathname === "/api/repositories/starred",
    );
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await refreshingStarred;
    const starredStatus = page.locator(".starred-repositories").getByRole("status");
    await expect(starredStatus).toBeVisible();
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    const lateStarredResponse = page.waitForResponse(
      (response) => new URL(response.url()).pathname === "/api/repositories/starred",
    );
    releaseLateStarredRead();
    await (await lateStarredResponse).finished();
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    await expect(page.locator(".starred-repositories").getByRole("link")).toHaveCount(0);
    await expect(starredStatus).toHaveCount(0);
    await page.unroute("**/api/repositories/starred");
    const resumedStarred = page.waitForRequest(
      (request) => new URL(request.url()).pathname === "/api/repositories/starred",
    );
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await resumedStarred;
    await expect(freshStarredResult).toBeVisible();
    if (artifactDir) {
      await page.screenshot({
        path: path.join(artifactDir, "starred-resumed-after-late-response.png"),
        fullPage: true,
      });
    }
    assert.equal(
      posts.length,
      rowAcceptancePosts,
      "result-row navigation must not issue business commands",
    );
    assert.deepEqual(errors, []);

    console.log(
      "PASS: Home/Profile IA, Explore Activity, dedicated Trending, Awesome Lists, Star List management, scoped Repository resources and Notifications navigation; real Next.js/browser with synthetic LIFF/API.",
    );
  } finally {
    if (artifactDir) await context.tracing.stop({ path: path.join(artifactDir, "trace.zip") });
    await context.close();
    await browser.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
