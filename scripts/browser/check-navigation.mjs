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
  const repositoryId = "repo-1";
  const issueId = "11111111-1111-4111-8111-111111111111";
  const issueNumber = 1;
  const notificationId = "22222222-2222-4222-8222-222222222222";
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
        body: "window.liff={init:async()=>{const u=new URL(location.href);if(u.searchParams.has('liff.state'))history.replaceState(null,'','/settings?google=link&code=secret&state=secret')},isLoggedIn:()=>true,getAccessToken:()=> 'synthetic',isInClient:()=>false,getProfile:async()=>({displayName:'測試使用者'}),login:()=>{}};",
      });
    }
    if (url.origin !== base) return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();

    if (request.method() === "POST")
      posts.push({ path: url.pathname, body: request.postDataJSON() });
    else reads.push(url.pathname + url.search);

    if (url.pathname === "/api/repositories") {
      return route.fulfill({
        json: {
          items: [
            { id: repositoryId, ownerLogin: "acme", name: "Operations", capability: "admin" },
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
            { id: repositoryId, ownerLogin: "acme", name: "Operations", capability: "admin" },
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
            { id: repositoryId, ownerLogin: "acme", name: "Operations", capability: "admin" },
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
    await page.getByRole("heading", { name: "LINE 工作助手", exact: true }).waitFor();
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
    await expect(page.getByRole("link", { name: "Search repositories", exact: true })).toHaveAttribute(
      "href",
      "/search",
    );
    await expect(page.getByRole("button", { name: "Refresh Home", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await expect(page.getByRole("link", { name: /Create Issue/ })).toHaveAttribute(
      "href",
      "/repositories?intent=create-issue",
    );

    await page.getByRole("link", { name: "Search repositories", exact: true }).click();
    await expect(page).toHaveURL(`${base}/search`);
    await page.getByRole("searchbox", { name: "Search repositories", exact: true }).fill("Operations");
    await expect(page.getByRole("link", { name: /acme\/Operations/ })).toHaveAttribute(
      "href",
      "/acme/Operations",
    );

    await page.goto(`${base}/repositories?intent=create-issue`);
    await page.getByRole("heading", { name: "Choose Repository", exact: true }).waitFor();
    const createRepositoryLink = page.getByRole("link", { name: /acme\/Operations/ });
    await expect(createRepositoryLink).toHaveAttribute("href", "/acme/Operations/issues?create=1");
    await createRepositoryLink.click();
    await expect(page).toHaveURL(`${base}/acme/Operations/issues?create=1`);
    await expect(page.getByRole("button", { name: "收起建立表單", exact: true })).toBeVisible();
    await expect(page.getByLabel("標題", { exact: true })).toBeVisible();

    await page.goto(`${base}/repositories`);
    await page.getByRole("heading", { name: "Repositories", exact: true }).waitFor();
    await expect(page.locator(".member-avatar")).toHaveCount(0);
    const repositoryLink = page.getByRole("link", { name: /acme\/Operations/ });
    await expect(repositoryLink).toHaveAttribute("href", "/acme/Operations");

    await page.goto(`${base}/acme/Operations/issues/${issueNumber}`);
    await page.getByRole("heading", { name: "Issue", exact: true }).waitFor();
    await page.getByRole("heading", { name: issue.title, exact: true }).waitFor();
    const issueBackLink = page.getByRole("link", { name: "← 返回 Issues", exact: true });
    await expect(issueBackLink).toHaveAttribute("href", "/acme/Operations/issues");
    await issueBackLink.click();
    await expect(page).toHaveURL(`${base}/acme/Operations/issues`);

    await page.goto(`${base}/notifications`);
    await page.getByRole("heading", { name: "通知", exact: true }).waitFor();
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
      ["/api/notifications"],
    );
    assert.deepEqual(errors, []);

    if (artifactDir) {
      await page.screenshot({
        path: path.join(artifactDir, "repository-notifications.png"),
        fullPage: true,
      });
    }
    console.log(
      "PASS: Repository/Issue and Notifications navigation; real Next.js/browser with synthetic LIFF/API.",
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
