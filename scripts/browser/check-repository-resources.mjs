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
  !["127.0.0.1", "localhost", "[::1]"].includes(target.hostname) ||
  target.pathname !== "/" ||
  target.search ||
  target.hash
) {
  throw new Error("Loopback origin required.");
}

const base = target.origin;
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
const tokenStorageKey = "repository-browser-token";
await context.addInitScript((key) => {
  if (!window.localStorage.getItem(key)) window.localStorage.setItem(key, "token-a");
}, tokenStorageKey);
if (output) await context.tracing.start({ screenshots: true, snapshots: true });

const page = await context.newPage();
const errors = [];
const requests = [];
let delayNextPrivateLabels = false;
let releaseDelayedPrivateLabels;
const result = {
  status: "failed",
  scope: "Repository Discussions, Labels, Milestones URLs with synthetic LINE/API.",
  base,
  urls: [],
  requests,
  checks: [],
};

const repository = {
  id: "repo-operations",
  ownerLogin: "acme",
  name: "Operations",
  capability: "admin",
};
const otherRepository = {
  id: "repo-operations-private",
  ownerLogin: "private",
  name: "Operations",
  capability: "read",
};
const firstDiscussion = {
  id: "discussion-alpha",
  repositoryId: repository.id,
  author: "user-alpha",
  title: "Release readiness",
  category: "General",
  body: "Cutover notes stay attached to the Repository discussion.",
  version: 1,
  createdAt: 1_780_000_001_000,
  updatedAt: 1_780_000_001_000,
};
const firstDiscussionSummary = { ...firstDiscussion };
delete firstDiscussionSummary.body;
const secondDiscussion = {
  id: "discussion-beta",
  repositoryId: repository.id,
  author: "user-beta",
  title: "Daily operations",
  category: "Q&A",
  version: 1,
  createdAt: 1_780_000_000_000,
  updatedAt: 1_780_000_000_000,
};
const comments = [
  {
    id: "comment-alpha",
    discussionId: firstDiscussion.id,
    author: "user-beta",
    body: "First comment keeps its own identity.",
    version: 1,
    createdAt: 1_780_000_002_000,
  },
  {
    id: "comment-beta",
    discussionId: firstDiscussion.id,
    author: "user-gamma",
    body: "Second comment arrives by cursor.",
    version: 1,
    createdAt: 1_780_000_003_000,
  },
];
const labels = [
  {
    id: "label-bug",
    repositoryId: repository.id,
    name: "bug",
    color: "d73a4a",
    description: "Something is not working",
    version: 1,
  },
  {
    id: "label-help",
    repositoryId: repository.id,
    name: "help wanted",
    color: "008672",
    description: "Extra attention is useful",
    version: 1,
  },
];
const milestones = [
  {
    id: "milestone-one",
    repositoryId: repository.id,
    number: 1,
    title: "v1.0",
    description: "First operational milestone",
    status: "open",
    dueAt: 1_780_086_400_000,
    version: 1,
    createdAt: 1_780_000_000_000,
    updatedAt: 1_780_000_000_000,
  },
  {
    id: "milestone-two",
    repositoryId: repository.id,
    number: 2,
    title: "v1.1",
    description: "Follow-up hardening",
    status: "closed",
    dueAt: null,
    version: 1,
    createdAt: 1_780_000_010_000,
    updatedAt: 1_780_000_010_000,
  },
];

function cursor(value) {
  return JSON.stringify(value);
}

function pageItems(items, after, cursorFor, size = 1) {
  const afterValue = after ? JSON.parse(after) : null;
  const start = afterValue?.id
    ? Math.max(items.findIndex((item) => item.id === afterValue.id) + 1, 0)
    : 0;
  const page = items.slice(start, start + size);
  const last = page.at(-1);
  return {
    items: page,
    next: last && start + page.length < items.length ? cursor(cursorFor(last)) : null,
  };
}

function readToken(request) {
  return request.headers()["x-line-token"] ?? "token-a";
}

async function setSyntheticToken(value) {
  await page.evaluate(
    ([key, token]) => window.localStorage.setItem(key, token),
    [tokenStorageKey, value],
  );
}

function routeKind(url) {
  const segments = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const last = segments.at(-1);
  const beforeLast = segments.at(-2);
  const joined = segments.join("/");
  if (joined.includes("discussions")) {
    if (beforeLast === "discussions" && last && last !== "discussions") return "discussion";
    return "discussions";
  }
  if (joined.includes("labels")) return "labels";
  if (joined.includes("milestones")) {
    if (last && /^\d+$/.test(last)) return "milestone";
    return "milestones";
  }
  return undefined;
}

function routeOwner(url) {
  const values = [url.searchParams.get("owner"), url.searchParams.get("login")].filter(Boolean);
  const segments = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  for (let index = 0; index < segments.length - 1; index++) {
    if (segments[index].toLowerCase() === "repositories") {
      values.push(segments[index + 1]);
    }
  }
  values.push(
    ...segments.filter((segment) =>
      ["acme", "malformed", "missing", "private", "source-down"].includes(segment),
    ),
  );
  return values[0] ?? repository.ownerLogin;
}

function payloadFor(url, request) {
  const kind = routeKind(url);
  const owner = routeOwner(url);
  const token = readToken(request);
  const activeRepository = owner === "private" ? otherRepository : repository;
  if (!kind) return undefined;
  if (owner === "malformed" && kind === "labels") {
    return { json: { repository: {}, labels: "bad" } };
  }
  if (owner === "missing") return { status: 404, json: { error: "找不到 Repository resource。" } };
  if (owner === "private" && token !== "token-b") {
    return { status: 403, json: { error: "沒有 Repository 存取權限。" } };
  }
  if (owner === "source-down")
    return { status: 503, json: { error: "Repository source unavailable." } };

  const after = url.searchParams.get("after") ?? url.searchParams.get("commentsAfter") ?? undefined;
  if (kind === "discussions") {
    const page = pageItems([firstDiscussionSummary, secondDiscussion], after, (item) => ({
      at: item.createdAt,
      id: item.id,
    }));
    return {
      json: {
        repository: activeRepository,
        discussions: page.items,
        next: page.next,
      },
    };
  }
  if (kind === "discussion") {
    const id = decodeURIComponent(url.pathname.split("/").filter(Boolean).at(-1) ?? "");
    if (id !== firstDiscussion.id) return { status: 404, json: { error: "找不到 Discussion。" } };
    const page = pageItems(comments, after, (item) => ({ at: item.createdAt, id: item.id }));
    return {
      json: {
        repository: activeRepository,
        discussion: firstDiscussion,
        comments: page.items,
        next: page.next,
      },
    };
  }
  if (kind === "labels") {
    const items = token === "token-b" ? [{ ...labels[1], name: "private-visible" }] : labels;
    const page = pageItems(
      items,
      after,
      (item) => ({ name: item.name, id: item.id }),
      items.length,
    );
    return {
      json: {
        repository: activeRepository,
        labels: page.items,
        next: page.next,
      },
    };
  }
  if (kind === "milestones") {
    const status = url.searchParams.get("status");
    const items = status ? milestones.filter((item) => item.status === status) : milestones;
    const page = pageItems(
      items,
      after,
      (item) => ({ number: item.number, id: item.id }),
      items.length,
    );
    return {
      json: {
        repository: activeRepository,
        milestones: page.items,
        next: page.next,
      },
    };
  }
  if (kind === "milestone") {
    const number = Number(url.pathname.split("/").filter(Boolean).at(-1));
    const milestone = milestones.find((item) => item.number === number);
    if (!milestone) return { status: 404, json: { error: "找不到 Milestone。" } };
    return { json: { repository: activeRepository, milestone } };
  }
  return undefined;
}

async function clickLoadMore() {
  const button = page.getByRole("button", { name: "載入更多", exact: true });
  await expect(button).toBeEnabled();
  await button.click();
}

async function expectPageState(title, message) {
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { name: title, exact: true })).toBeVisible();
  await expect(main.getByText(message, { exact: false })).toBeVisible();
}

function linkWithText(text) {
  return page.getByRole("link").filter({ has: page.getByText(text, { exact: true }) });
}

async function expectSingleLinkHref(link, href) {
  await expect(link).toHaveCount(1);
  await expect(link.first()).toHaveAttribute("href", href);
}

async function expectRepositoryResourceMobileLayout() {
  const original = page.viewportSize() ?? { width: 390, height: 844 };
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: original.height });
    await expect(page.getByRole("heading", { name: "Discussions", exact: true })).toBeVisible();
    for (const name of ["Discussions", "Labels", "Milestones"]) {
      await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
    }
    const metrics = await page.evaluate(() => {
      const heading = Array.from(document.querySelectorAll("h1")).find(
        (item) => item.textContent?.trim() === "Discussions",
      );
      const links = Array.from(
        document.querySelectorAll('nav[aria-label="Repository resources"] a'),
      ).map((item) => {
        const box = item.getBoundingClientRect();
        return {
          text: item.textContent?.trim() ?? "",
          left: box.left,
          right: box.right,
          top: box.top,
          width: box.width,
          height: box.height,
        };
      });
      const headingBox = heading?.getBoundingClientRect();
      return {
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        heading: headingBox
          ? {
              width: headingBox.width,
              height: headingBox.height,
            }
          : null,
        links,
      };
    });
    assert.ok(metrics.heading, `Discussions heading is missing at ${width}px.`);
    assert.ok(
      metrics.heading.width >= 120,
      `Discussions heading is squeezed at ${width}px: ${metrics.heading.width}px.`,
    );
    assert.ok(
      metrics.heading.height <= 72,
      `Discussions heading wraps excessively at ${width}px: ${metrics.heading.height}px.`,
    );
    assert.ok(
      metrics.documentWidth <= metrics.viewportWidth + 1 &&
        metrics.bodyWidth <= metrics.viewportWidth + 1,
      `Repository resources overflow horizontally at ${width}px: document ${metrics.documentWidth}px, body ${metrics.bodyWidth}px.`,
    );
    for (const name of ["Discussions", "Labels", "Milestones"]) {
      const link = metrics.links.find((item) => item.text === name);
      assert.ok(link, `${name} nav link is missing at ${width}px.`);
      assert.ok(
        link.width >= 64 && link.height >= 32,
        `${name} nav link is collapsed at ${width}px.`,
      );
      assert.ok(
        link.left >= -1 && link.right <= metrics.viewportWidth + 1,
        `${name} nav link is clipped at ${width}px.`,
      );
    }
  }
  await page.setViewportSize(original);
}

async function gotoPath(pathname) {
  const url = `${base}${pathname}`;
  result.urls.push(url);
  await page.goto(url, { waitUntil: "domcontentloaded" });
}

page.on("pageerror", (error) => errors.push(error.message));
await context.route("**/*", async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  if (url.hostname === "static.line-scdn.net") {
    return route.fulfill({
      contentType: "text/javascript",
      body: `window.liff={init:async()=>{},isLoggedIn:()=>true,getAccessToken:()=>window.localStorage.getItem(${JSON.stringify(tokenStorageKey)})||'token-a',isInClient:()=>false,getProfile:async()=>({displayName:'Repository Tester'}),login:()=>{}};`,
    });
  }
  if (url.origin !== base) return route.abort();
  if (!url.pathname.startsWith("/api/")) return route.continue();

  const matched = payloadFor(url, request);
  if (
    routeKind(url) === "labels" &&
    routeOwner(url) === "private" &&
    readToken(request) === "token-b" &&
    delayNextPrivateLabels
  ) {
    delayNextPrivateLabels = false;
    await new Promise((resolve) => {
      releaseDelayedPrivateLabels = resolve;
    });
  }
  requests.push({
    method: request.method(),
    path: `${url.pathname}${url.search}`,
    kind: routeKind(url) ?? "other",
    token: readToken(request),
    status: matched?.status ?? 404,
  });
  if (!matched) return route.fulfill({ status: 404, json: { error: "synthetic route not found" } });
  return route.fulfill({ status: matched.status ?? 200, json: matched.json });
});

try {
  const firstDiscussionPath = `/acme/Operations/discussions/${firstDiscussion.id}`;
  const secondDiscussionPath = `/acme/Operations/discussions/${secondDiscussion.id}`;
  const firstMilestonePath = "/acme/Operations/milestones/1";
  await gotoPath("/acme/Operations/discussions");
  await expect(page.getByRole("heading", { name: "Discussions", exact: true })).toBeVisible();
  await expectSingleLinkHref(linkWithText(firstDiscussion.title), firstDiscussionPath);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Discussions", exact: true })).toBeVisible();
  await expectSingleLinkHref(linkWithText(firstDiscussion.title), firstDiscussionPath);
  await clickLoadMore();
  await expectSingleLinkHref(linkWithText(secondDiscussion.title), secondDiscussionPath);
  await expectSingleLinkHref(linkWithText(firstDiscussion.title), firstDiscussionPath);
  await linkWithText(firstDiscussion.title).click();
  await expect(page).toHaveURL(`${base}/acme/Operations/discussions/${firstDiscussion.id}`);
  await expect(
    page.getByRole("heading", { name: firstDiscussion.title, exact: true }),
  ).toBeVisible();
  await expect(page.getByText(comments[0].body, { exact: true })).toBeVisible();
  await clickLoadMore();
  await expect(page.getByText(comments[1].body, { exact: true })).toBeVisible();
  assert.equal(await page.getByText(comments[0].body, { exact: true }).count(), 1);
  if (output) {
    await page.screenshot({
      path: path.join(output, "repository-discussions.png"),
      fullPage: true,
    });
  }
  await page.getByRole("link", { name: "← 返回 Discussions", exact: true }).click();
  await expect(page).toHaveURL(`${base}/acme/Operations/discussions`);
  await expectRepositoryResourceMobileLayout();
  result.checks.push(
    "discussions direct load, reload, detail, back, pagination, no duplicate data, mobile layout",
  );

  await gotoPath("/acme/Operations/labels");
  await expect(page.getByRole("heading", { name: "Labels", exact: true })).toBeVisible();
  await expect(page.getByText("bug", { exact: true })).toBeVisible();
  await expect(page.getByText("help wanted", { exact: true })).toBeVisible();
  result.checks.push("labels direct load");

  await gotoPath("/acme/Operations/milestones");
  await expect(page.getByRole("heading", { name: "Milestones", exact: true })).toBeVisible();
  await expectSingleLinkHref(linkWithText("#1 v1.0"), firstMilestonePath);
  await linkWithText("#1 v1.0").click();
  await expect(page).toHaveURL(`${base}/acme/Operations/milestones/1`);
  await expect(page.getByRole("heading", { name: "#1 v1.0", exact: true })).toBeVisible();
  await expect(page.getByText("First operational milestone", { exact: true })).toBeVisible();
  result.checks.push("milestones direct load and detail");

  for (const [pathname, title, message] of [
    ["/missing/Operations/discussions", "Repository 資源讀取失敗", "找不到"],
    ["/malformed/Operations/labels", "Repository 資源讀取失敗", "回應格式不正確"],
    ["/private/Operations/labels", "沒有可讀取的儲存庫資源", "沒有 Repository 存取權限"],
    [
      "/source-down/Operations/milestones",
      "Repository 資源讀取失敗",
      "Repository source unavailable",
    ],
  ]) {
    await gotoPath(pathname);
    await expectPageState(title, message);
  }
  result.checks.push("missing, forbidden and unavailable source stay distinct");

  delayNextPrivateLabels = true;
  await setSyntheticToken("token-b");
  await gotoPath("/private/Operations/labels");
  await expect.poll(() => (releaseDelayedPrivateLabels ? "delayed" : "pending")).toBe("delayed");
  await page.evaluate((key) => {
    window.localStorage.setItem(key, "token-a");
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  }, tokenStorageKey);
  releaseDelayedPrivateLabels();
  await expectPageState("沒有可讀取的儲存庫資源", "沒有 Repository 存取權限");
  await expect(page.getByText("private-visible", { exact: true })).toHaveCount(0);

  await page.evaluate((key) => {
    window.localStorage.setItem(key, "token-b");
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  }, tokenStorageKey);
  await gotoPath("/private/Operations/labels");
  await expect(page.getByText("private-visible", { exact: true })).toBeVisible();
  await expect(page.getByText("bug", { exact: true })).toHaveCount(0);
  result.checks.push("identity and visibility changes isolate private state and late responses");

  assert.deepEqual(errors, []);
  assert.ok(requests.some((request) => request.kind === "discussions"));
  assert.ok(requests.some((request) => request.kind === "discussion"));
  assert.ok(requests.some((request) => request.kind === "labels"));
  assert.ok(requests.some((request) => request.kind === "milestones"));
  assert.ok(requests.some((request) => request.kind === "milestone"));

  if (output) {
    await page.screenshot({
      path: path.join(output, "repository-resources.png"),
      fullPage: true,
    });
  }
  result.status = "passed";
  console.log("Repository resources browser checks passed.");
} catch (error) {
  if (output) {
    await page.screenshot({
      path: path.join(output, "repository-resources-failure.png"),
      fullPage: true,
    });
  }
  result.error = error.message;
  throw error;
} finally {
  if (output) {
    await context.tracing.stop({ path: path.join(output, "repository-resources-trace.zip") });
    writeFileSync(
      path.join(output, "repository-resources-results.json"),
      `${JSON.stringify(result, null, 2)}\n`,
    );
  }
  await context.close();
  await browser.close();
}
