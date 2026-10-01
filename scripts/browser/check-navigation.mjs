import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

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
  if (artifactDir) await context.tracing.start({ screenshots: true, snapshots: true });
  const page = await context.newPage();
  const errors = [];
  const posts = [];
  const reads = [];
  let membershipLogin = "viewer";
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
    assignee: "user-2",
    title: "測試 Issue",
    criteria: "完成核對",
    status: "pending",
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

  page.on("pageerror", (error) => errors.push(error.message));
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname === "static.line-scdn.net") {
      return route.fulfill({
        contentType: "text/javascript",
        body: "window.liff={init:async()=>{window.liffInitializations=(window.liffInitializations??0)+1;const u=new URL(location.href);if(u.searchParams.has('liff.state'))history.replaceState(null,'','/settings?google=link&code=secret&state=secret')},isLoggedIn:()=>true,getAccessToken:()=> 'synthetic',isInClient:()=>false,getProfile:async()=>({userId:'U11111111111111111111111111111111',displayName:'測試使用者',statusMessage:'Ready to work'}),login:()=>{}};",
      });
    }
    if (url.origin !== base) return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();

    if (request.method() === "POST")
      posts.push({ path: url.pathname, body: request.postDataJSON() });
    else reads.push(url.pathname + url.search);

    if (url.pathname === "/api/membership") {
      return route.fulfill({
        json: {
          member: { id: "user-1", login: membershipLogin || null, status: membershipStatus },
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
        version: 1,
        membershipStatus: "active",
        isMaintainer: false,
      };
      return route.fulfill({
        json: {
          userId: "user-1",
          organizations: [{ organizationAccountId: "org-1", login: "acme" }],
          organizationAccountId: "org-1",
          organizationLogin: "acme",
          teams: [team],
          team,
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
              name: "Operations Plan",
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
    await expect(
      page.locator('script[src="https://static.line-scdn.net/liff/edge/2/sdk.js"]'),
    ).toHaveCount(1);
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
    await expect(page.getByText("Operations Plan", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Organization", exact: true }).click();
    await expect(page.getByText("Operations Plan", { exact: true })).toHaveCount(0);
    await expect(
      page.getByText("此擁有者類型目前沒有可存取的 Project。", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Personal", exact: true }).click();
    await expect(page.getByText("Operations Plan", { exact: true })).toBeVisible();
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

    await page.getByRole("link", { name: "Search repositories", exact: true }).click();
    await expect(page).toHaveURL(`${base}/search`);
    await page
      .getByRole("searchbox", { name: "Search repositories", exact: true })
      .fill("Operations");
    await expect(page.getByRole("link", { name: /acme\/Operations/ })).toHaveAttribute(
      "href",
      "/acme/Operations",
    );

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
    await page.reload();
    await expect(page.getByRole("heading", { name: "Operations Team", exact: true })).toBeVisible();
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
    await page.getByRole("heading", { name: issue.title, exact: true }).waitFor();
    const issueBackLink = page.getByRole("link", { name: "← 返回 Issues", exact: true });
    await expect(issueBackLink).toHaveAttribute("href", "/acme/Operations/issues");
    await issueBackLink.click();
    await expect(page).toHaveURL(`${base}/acme/Operations/issues`);

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
