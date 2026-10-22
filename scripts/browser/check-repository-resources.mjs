import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { startRepositoryOverviewFixture } from "./repository-overview-fixture.mjs";
import { captureShell } from "./shell-evidence.mjs";

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
const overviewFixture = await startRepositoryOverviewFixture(
  output ?? ".artifacts/browser/repository-resources",
);

const browser = await chromium.launch({
  headless: true,
  channel: process.env.NAVIGATION_BROWSER_CHANNEL || undefined,
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  serviceWorkers: "block",
});
const syntheticProofStorageKey = "synthetic-liff-proof";
const sessionGenerations = Object.freeze({
  "token-a": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "token-b": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
});
let activeSyntheticProof;
await context.addInitScript((key) => {
  if (!window.localStorage.getItem(key)) window.localStorage.setItem(key, "token-a");
  if (!window.localStorage.getItem("synthetic-liff-logged-in"))
    window.localStorage.setItem("synthetic-liff-logged-in", "1");
  window.liff = {
    init: async () => {},
    isLoggedIn: () => window.localStorage.getItem("synthetic-liff-logged-in") === "1",
    getAccessToken: () =>
      window.localStorage.getItem("synthetic-liff-logged-in") === "1"
        ? window.localStorage.getItem(key) || "token-a"
        : null,
    isInClient: () => false,
    getProfile: async () => ({
      userId: "U11111111111111111111111111111111",
      displayName: "Repository Tester",
    }),
    closeWindow: () => {},
    openWindow: () => {},
    login: () =>
      window.sessionStorage.setItem(
        "synthetic-liff-login-calls",
        String(Number(window.sessionStorage.getItem("synthetic-liff-login-calls") ?? "0") + 1),
      ),
  };
}, syntheticProofStorageKey);
if (output) await context.tracing.start({ screenshots: true, snapshots: true });

const page = await context.newPage();
const errors = [];
const requests = [];
const authRequests = [];
let delayNextPrivateLabels = false;
let releaseDelayedPrivateLabels;
let delayNextOverview = false;
let releaseDelayedOverview;
let delayNextAuthRestore = false;
let releaseDelayedAuthRestore;
let completedAuthRestores = 0;
let overviewFailure = null;
let overviewVisibility = "private";
let overviewArchived = false;
let overviewPermissions = ["admin"];
let overviewLegacyStatus = "none";
const result = {
  status: "failed",
  scope: "Repository Overview and resource URLs with synthetic LINE/API.",
  base,
  urls: [],
  requests,
  checks: [],
};

const repository = {
  id: "repo-operations",
  ownerLogin: "acme",
  name: "Operations",
  permissions: ["admin"],
};
const otherRepository = {
  id: "repo-operations-private",
  ownerLogin: "private",
  name: "Operations",
  permissions: ["read"],
};
const firstDiscussion = {
  id: "discussion-alpha",
  repositoryId: repository.id,
  number: 7,
  author: "user-alpha",
  title: "Release readiness",
  category: "General",
  categoryId: null,
  body: "Cutover notes stay attached to the Repository discussion.",
  state: "OPEN",
  stateReason: null,
  locked: false,
  lockReason: null,
  deleted: false,
  version: 1,
  createdAt: 1_780_000_001_000,
  updatedAt: 1_780_000_001_000,
};
const firstDiscussionSummary = { ...firstDiscussion };
delete firstDiscussionSummary.body;
const secondDiscussion = {
  id: "discussion-beta",
  repositoryId: repository.id,
  number: null,
  author: "user-beta",
  title: "Daily operations",
  category: "Q&A",
  categoryId: null,
  state: "OPEN",
  stateReason: null,
  locked: false,
  lockReason: null,
  deleted: false,
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
    replyToId: null,
    deleted: false,
    version: 1,
    createdAt: 1_780_000_002_000,
    updatedAt: 1_780_000_002_000,
  },
  {
    id: "comment-beta",
    discussionId: firstDiscussion.id,
    author: "user-gamma",
    body: "Second comment arrives by cursor.",
    replyToId: null,
    deleted: false,
    version: 1,
    createdAt: 1_780_000_003_000,
    updatedAt: 1_780_000_003_000,
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

function readSessionGeneration(request) {
  return request.headers()["x-app-session-generation"];
}

async function setSyntheticProof(value) {
  await page.evaluate(
    ([key, proof]) => window.localStorage.setItem(key, proof),
    [syntheticProofStorageKey, value],
  );
}

async function switchServiceAccount(accessToken) {
  await gotoPath("/settings");
  await expect(page.getByText("目前已登入此服務。", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "登出此服務", exact: true }).click();
  await expect(page.getByText("目前已登出此服務。", { exact: true })).toBeVisible();
  await setSyntheticProof(accessToken);
  await page.getByRole("button", { name: "使用 LINE 重新登入", exact: true }).click();
  await expect(page.getByText("目前已登入此服務。", { exact: true })).toBeVisible();
}

function routeKind(url) {
  const segments = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const last = segments.at(-1);
  const beforeLast = segments.at(-2);
  const joined = segments.join("/");
  if (joined.includes("discussions")) {
    if (
      (beforeLast === "discussions" || beforeLast === "by-number") &&
      last &&
      last !== "discussions"
    )
      return "discussion";
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
  if (url.pathname === "/api/repository-overview") {
    assert.equal(url.searchParams.get("owner"), "acme");
    assert.equal(url.searchParams.get("name"), "Operations");
    if (overviewFailure) return overviewFailure;
    return {
      json: {
        repository: {
          id: repository.id,
          ownerLogin: repository.ownerLogin,
          name: repository.name,
          visibility: overviewVisibility,
          archived: overviewArchived,
          permissions: overviewPermissions,
        },
        legacyWbs: { status: overviewLegacyStatus },
      },
    };
  }
  const managedRepository = {
    ...repository,
    actorUserId: "user-alpha",
    ownerAccountId: "account-acme",
    ownerKind: "ORGANIZATION",
    visibility: "private",
    archived: false,
    version: 1,
    actorPermissions: repository.permissions,
    internalEnterpriseId: null,
  };
  if (url.pathname === "/api/issues") {
    return {
      json: {
        userId: "user-alpha",
        repositories: [repository],
        participants: [],
        issues: [],
        events: [],
        next: null,
      },
    };
  }
  if (url.pathname === "/api/repository-management")
    return { json: { repository: managedRepository } };
  if (url.pathname === "/api/repository-address")
    return { json: { repository: { ...managedRepository, actorIsOwner: false }, address: null } };
  if (url.pathname === "/api/repository-access")
    return { json: { repository: managedRepository, directUserGrants: [], teamGrants: [] } };
  if (url.pathname === "/api/repository-subscription")
    return { json: { repository: managedRepository, state: "UNSUBSCRIBED", version: 1 } };
  const kind = routeKind(url);
  const owner = routeOwner(url);
  const generation = readSessionGeneration(request);
  const activeRepository = owner === "private" ? otherRepository : repository;
  if (!kind) return undefined;
  if (owner === "malformed" && kind === "labels") {
    return { json: { repository: {}, labels: "bad" } };
  }
  if (owner === "missing") return { status: 404, json: { error: "找不到 Repository resource。" } };
  if (owner === "private" && generation !== sessionGenerations["token-b"]) {
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
    const locator = decodeURIComponent(url.pathname.split("/").filter(Boolean).at(-1) ?? "");
    const canonicalLocator = url.pathname.includes("/by-number/");
    if (
      canonicalLocator ? Number(locator) !== firstDiscussion.number : locator !== firstDiscussion.id
    )
      return { status: 404, json: { error: "找不到 Discussion。" } };
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
    const items =
      generation === sessionGenerations["token-b"]
        ? [{ ...labels[1], name: "private-visible" }]
        : labels;
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
    for (const name of [
      "Content",
      "Resources",
      "Contracts",
      "Executions",
      "Discussions",
      "Labels",
      "Milestones",
    ]) {
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
    for (const name of [
      "Content",
      "Resources",
      "Contracts",
      "Executions",
      "Discussions",
      "Labels",
      "Milestones",
    ]) {
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

const repositorySections = [
  "Overview",
  "Content",
  "Resources",
  "Contracts",
  "Executions",
  "Issues",
  "Discussions",
  "Wiki",
  "Insights",
  "Labels",
  "Milestones",
  "Settings",
  "Access",
];

function repositoryNavigation() {
  return page.getByRole("navigation", { name: "Repository resources" });
}

async function expectRepositoryNavigation(active, canManage) {
  const navigation = repositoryNavigation();
  await expect
    .poll(() => navigation.locator(":scope > a").allTextContents(), {
      message: "Repository navigation must be ordered and capability-filtered",
    })
    .toEqual(canManage ? repositorySections : repositorySections.slice(0, -2));
  await expect(navigation.getByRole("menu")).toHaveCount(0);
  await expect(navigation.locator("details, summary")).toHaveCount(0);
  const activeLink = navigation.getByRole("link", { name: active, exact: true });
  await expect(activeLink).toBeVisible();
  await expect(activeLink).toHaveAttribute("aria-current", "page");
  return navigation;
}

async function clickRepositorySection(section) {
  const navigation = repositoryNavigation();
  await navigation.getByRole("link", { name: section, exact: true }).click();
}

async function resetOverviewSession({ hint = false, lineLoggedIn = true } = {}) {
  assert.equal(new URL(page.url()).origin, overviewFixture.origin);
  await context.clearCookies();
  await page.evaluate(
    ({ hasHint, loggedIn }) => {
      for (const storage of [window.sessionStorage, window.localStorage]) {
        storage.removeItem("line_bot_v1:session-established");
        storage.removeItem("line_bot_v1:session-blocked");
        if (hasHint) storage.setItem("line_bot_v1:session-established", "1");
      }
      window.localStorage.setItem("synthetic-liff-logged-in", loggedIn ? "1" : "0");
      window.sessionStorage.setItem("synthetic-liff-login-calls", "0");
    },
    { hasHint: hint, loggedIn: lineLoggedIn },
  );
}

async function liffLoginCalls() {
  return page.evaluate(() =>
    Number(window.sessionStorage.getItem("synthetic-liff-login-calls") ?? "0"),
  );
}

async function seedOverviewAppCookie(accessToken = "token-a") {
  await page.evaluate(async (token) => {
    const response = await fetch("/api/auth", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken: token }),
    });
    if (!response.ok) throw new Error("Synthetic app session seed failed.");
  }, accessToken);
}

async function activatePrivateOverview() {
  await resetOverviewSession();
  await page.goto(`${overviewFixture.origin}/acme/Operations`);
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "登入後讀取 Repository", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "登入以讀取 Repository", exact: true }).click();
}

async function gotoPath(pathname) {
  const url = `${base}${pathname}`;
  result.urls.push(url);
  try {
    await page.goto(url, { waitUntil: "domcontentloaded" });
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("net::ERR_ABORTED")) throw error;
    await expect(page).toHaveURL(url);
  }
}

page.on("pageerror", (error) => errors.push(error.message));
await context.route("**/*", async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  if (url.origin !== base && url.origin !== overviewFixture.origin) return route.abort();
  if (!url.pathname.startsWith("/api/")) return route.continue();

  if (url.pathname === "/api/auth") {
    authRequests.push({
      method: request.method(),
      action:
        request.method() === "POST"
          ? request.postDataJSON().action === "restore"
            ? "restore"
            : "exchange"
          : request.method().toLowerCase(),
    });
    if (
      request.method() === "GET" ||
      (request.method() === "POST" && request.postDataJSON().action === "restore")
    ) {
      if (request.method() === "POST")
        assert.deepEqual(request.postDataJSON(), { action: "restore" });
      if (
        request.method() === "POST" &&
        request.postDataJSON().action === "restore" &&
        delayNextAuthRestore
      ) {
        delayNextAuthRestore = false;
        await new Promise((resolve) => {
          releaseDelayedAuthRestore = resolve;
        });
      }
      const cookies = request.headers().cookie ?? "";
      const proof = Object.keys(sessionGenerations).find((candidate) =>
        cookies
          .split(";")
          .some((part) => part.trim() === `__Host-line_bot_v1_session=synthetic-${candidate}`),
      );
      if (!proof) {
        await route.fulfill({
          status: 401,
          json: { error: "服務登入已失效，請重新登入。" },
        });
        if (request.method() === "POST") completedAuthRestores += 1;
        return;
      }
      await route.fulfill({
        json: { generation: sessionGenerations[proof] },
        ...(request.method() === "POST"
          ? {
              headers: {
                "Set-Cookie": `__Host-line_bot_v1_session=synthetic-${proof}; Path=/; HttpOnly; Secure; SameSite=Lax`,
              },
            }
          : {}),
      });
      if (request.method() === "POST") completedAuthRestores += 1;
      return;
    }
    if (request.method() === "POST") {
      const body = request.postDataJSON();
      assert.equal(typeof body.accessToken, "string");
      assert.ok(
        Object.hasOwn(sessionGenerations, body.accessToken),
        "Expected a synthetic LINE proof.",
      );
      const accessToken = body.accessToken;
      const sessionChanged = activeSyntheticProof !== accessToken;
      activeSyntheticProof = accessToken;
      return route.fulfill({
        json: {
          generation: sessionGenerations[accessToken],
          sessionChanged,
        },
        headers: {
          "Set-Cookie": `__Host-line_bot_v1_session=synthetic-${accessToken}; Path=/; HttpOnly; Secure; SameSite=Lax`,
        },
      });
    }
    if (request.method() === "PATCH") {
      const generation = readSessionGeneration(request);
      assert.ok(Object.values(sessionGenerations).includes(generation));
      assert.match(request.headers().cookie ?? "", /__Host-line_bot_v1_session=/);
      return route.fulfill({ json: { generation } });
    }
    if (request.method() === "DELETE")
      return route.fulfill({
        status: 204,
        headers: {
          "Set-Cookie":
            "__Host-line_bot_v1_session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax",
        },
      });
    return route.fulfill({ status: 405 });
  }

  assert.ok(readSessionGeneration(request), `Missing app session generation for ${url.pathname}.`);
  assert.equal(request.headers()["x-line-token"], undefined);
  assert.match(request.headers().cookie ?? "", /__Host-line_bot_v1_session=/);

  const matched = payloadFor(url, request);
  if (url.pathname === "/api/repository-overview" && delayNextOverview) {
    delayNextOverview = false;
    await new Promise((resolve) => {
      releaseDelayedOverview = resolve;
    });
  }
  if (
    routeKind(url) === "labels" &&
    routeOwner(url) === "private" &&
    readSessionGeneration(request) === sessionGenerations["token-b"] &&
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
    generation: readSessionGeneration(request),
    status: matched ? (matched.status ?? 200) : 404,
  });
  if (!matched) return route.fulfill({ status: 404, json: { error: "synthetic route not found" } });
  return route.fulfill({ status: matched.status ?? 200, json: matched.json });
});

try {
  for (const retired of [
    "/api/repository-objects",
    "/api/repository-object-types",
    "/api/repository-object-measures",
    "/api/repository-object-relationships",
    "/acme/Operations/objects",
    "/acme/Operations/objects/retired-object",
  ]) {
    const response = await context.request.get(`${base}${retired}`);
    assert.equal(response.status(), 404, `${retired} must be retired without an alias.`);
  }
  result.checks.push("Retired Object routes return 404 without compatibility aliases.");
  const sections = [
    "Overview",
    "Issues",
    "Discussions",
    "Labels",
    "Milestones",
    "Settings",
    "Access",
  ];
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    const expectedGeometry = new Map();
    for (const section of sections) {
      const suffix = section === "Overview" ? "" : `/${section.toLowerCase()}`;
      if (section === "Overview") {
        await context.clearCookies();
        await page.goto(`${overviewFixture.origin}/acme/Operations?public`);
      } else await gotoPath(`/acme/Operations${suffix}`);
      const main = page.getByRole("main");
      await expect(main.getByRole("heading", { name: section, exact: true })).toBeVisible();
      const navigation = await expectRepositoryNavigation(section, section !== "Overview");
      await expect(main.locator(".back-link")).toHaveAttribute(
        "href",
        section === "Overview" ? "/acme" : "/acme/Operations",
      );
      for (const [name, href] of [
        ["Content", "/acme/Operations/content"],
        ["Resources", "/acme/Operations/resources"],
        ["Contracts", "/acme/Operations/contracts"],
        ["Executions", "/acme/Operations/executions"],
      ]) {
        await expect(navigation.getByRole("link", { name, exact: true })).toHaveAttribute(
          "href",
          href,
        );
      }
      await expect(
        navigation.getByRole("link", { name: "Objects (Legacy)", exact: true }),
      ).toHaveCount(0);
      await expect(navigation.getByRole("link", { name: "Wiki", exact: true })).toHaveAttribute(
        "href",
        "/acme/Operations/wiki",
      );
      await expect(navigation.getByRole("link", { name: "Insights", exact: true })).toHaveAttribute(
        "href",
        "/acme/Operations/insights",
      );
      const metrics = await main.evaluate((element) => {
        const heading = element.querySelector(".page-heading");
        const nav = element.querySelector('nav[aria-label="Repository resources"]');
        const headingBox = heading.getBoundingClientRect();
        const navBox = nav.getBoundingClientRect();
        const links = Array.from(nav.querySelectorAll("a"), (link) => {
          const box = link.getBoundingClientRect();
          return { left: box.left, right: box.right, width: box.width, height: box.height };
        }).filter((link) => link.width > 0 && link.height > 0);
        return {
          geometry: [
            headingBox.x,
            headingBox.y,
            headingBox.width,
            navBox.x,
            navBox.y,
            navBox.width,
            navBox.height,
          ],
          overflow: document.documentElement.scrollWidth - innerWidth,
          links,
          shell: Boolean(element.closest(".app-shell")),
        };
      });
      assert.equal(metrics.shell, true, `${section} must use AppShell`);
      assert.ok(metrics.overflow <= 1, `${section} overflows at ${width}px`);
      for (const link of metrics.links) {
        assert.ok(
          link.width >= 44 && link.height >= 44,
          `${section} has a small navigation target`,
        );
        assert.ok(link.left >= -1 && link.right <= width + 1, `${section} navigation is clipped`);
      }
      const previousGeometry = expectedGeometry.get(metrics.links.length);
      if (previousGeometry)
        assert.deepEqual(
          metrics.geometry,
          previousGeometry,
          `${section} header differs at ${width}px`,
        );
      expectedGeometry.set(metrics.links.length, metrics.geometry);
      if (section === "Settings") {
        await expect(
          main.getByRole("heading", { name: "acme/Operations", exact: true }),
        ).toBeVisible();
        const cardGap = await main.evaluate((element) => {
          const cards = element.querySelectorAll("section.crud-detail");
          return cards[1].getBoundingClientRect().top - cards[0].getBoundingClientRect().bottom;
        });
        assert.ok(cardGap >= 18, "Settings command families must have consistent card spacing");
      }
      if (output && (width === 390 || section === "Overview" || section === "Labels"))
        await page.screenshot({
          path: path.join(output, `repository-${section.toLowerCase()}-${width}.png`),
          fullPage: true,
        });
      if (output && width === 390 && section === "Settings")
        await navigation.screenshot({ path: path.join(output, "repository-navigation-390.png") });
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await context.clearCookies();
  const beforePublicReads = requests.length;
  const beforePublicAuth = authRequests.length;
  await page.goto(`${overviewFixture.origin}/acme/Operations?public`);
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
  await captureShell(page, output, "repository-public", 1);
  await expect(page.getByRole("main").locator(".back-link")).toHaveAttribute("href", "/acme");
  await expectRepositoryNavigation("Overview", false);
  await expect(repositoryNavigation().getByRole("link")).toHaveCount(11);
  const deliveryRegion = page.getByRole("region", { name: "工作交付" });
  await expect(deliveryRegion).toBeVisible();
  for (const [name, href] of [
    ["Content", "/acme/Operations/content"],
    ["Resources", "/acme/Operations/resources"],
    ["Contracts", "/acme/Operations/contracts"],
    ["Executions", "/acme/Operations/executions"],
  ]) {
    await expect(
      deliveryRegion.getByRole("link", { name: new RegExp(`^${name}`) }),
    ).toHaveAttribute("href", href);
  }
  const collaborationRegion = page.getByRole("region", { name: "協作與知識" });
  await expect(collaborationRegion).toBeVisible();
  for (const [name, href] of [
    ["Issues", "/acme/Operations/issues"],
    ["Discussions", "/acme/Operations/discussions"],
    ["Wiki", "/acme/Operations/wiki"],
    ["Insights", "/acme/Operations/insights"],
  ]) {
    await expect(
      collaborationRegion.getByRole("link", { name: new RegExp(`^${name}`) }),
    ).toHaveAttribute("href", href);
  }
  await expect(page.getByRole("region", { name: "Legacy" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^Projects/ })).toHaveAttribute("href", "/projects");
  await expect(page.getByRole("heading", { name: "Public Repository", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /WBS/i })).toHaveCount(0);
  assert.equal(
    requests.length,
    beforePublicReads,
    "Public Overview must stay passive before interaction",
  );
  assert.equal(
    authRequests.length,
    beforePublicAuth,
    "Public Overview must not establish a service session before explicit interaction",
  );
  assert.equal(
    requests.filter((request) => request.path.startsWith("/api/repository-subscription?")).length,
    0,
    "Public Overview must not read Watch state before explicit interaction",
  );
  await page.getByRole("button", { name: "設定追蹤偏好", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Subscription", exact: true })).toHaveValue(
    "UNSUBSCRIBED",
  );
  assert.equal(
    requests.filter((request) => request.path.startsWith("/api/repository-subscription?")).length,
    1,
    "Watch activation must read the real Repository subscription selector once",
  );
  await resetOverviewSession();
  activeSyntheticProof = undefined;
  result.checks.push(
    "public Overview renders content entries without forced login; Watch loads only after explicit interaction",
  );

  await page.evaluate(() => sessionStorage.removeItem("public-lookup-retried"));
  const beforeUnavailableReads = requests.length;
  const beforeUnavailableAuth = authRequests.length;
  await page.goto(`${overviewFixture.origin}/acme/Operations?source-unavailable`);
  await expect(
    page.getByRole("heading", { name: "公開 Repository 資訊暫時無法確認", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("目前無法確認這個 Repository 是否公開。你仍可登入以讀取有權限的 Repository。", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "登入後讀取 Repository", exact: true }),
  ).toHaveCount(0);
  assert.equal(
    requests.length,
    beforeUnavailableReads,
    "Public lookup failure must not be reclassified through the authenticated API",
  );
  assert.equal(
    authRequests.length,
    beforeUnavailableAuth,
    "Public lookup retry must remain passive before explicit login",
  );
  await page.getByRole("button", { name: "重試公開資訊", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Public Repository", exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "公開 Repository 資訊暫時無法確認", exact: true }),
  ).toHaveCount(0);
  assert.equal(requests.length, beforeUnavailableReads);
  assert.equal(authRequests.length, beforeUnavailableAuth);
  result.checks.push(
    "public lookup source failure stays distinct from private/not-found and refreshes to public metadata without login",
  );

  await resetOverviewSession({ hint: true, lineLoggedIn: false });
  const beforeStaleHintAuth = authRequests.length;
  const beforeStaleHintCompletion = completedAuthRestores;
  const beforeStaleHintOverview = requests.filter((request) =>
    request.path.startsWith("/api/repository-overview?"),
  ).length;
  await page.goto(`${overviewFixture.origin}/acme/Operations?public`);
  await expect(page.getByRole("heading", { name: "Public Repository", exact: true })).toBeVisible();
  await expect.poll(() => authRequests.length).toBeGreaterThan(beforeStaleHintAuth);
  await expect.poll(() => completedAuthRestores).toBeGreaterThan(beforeStaleHintCompletion);
  assert.equal(await liffLoginCalls(), 0, "A stale session hint must never redirect to LINE login");
  assert.equal(
    requests.filter((request) => request.path.startsWith("/api/repository-overview?")).length,
    beforeStaleHintOverview,
    "An expired app cookie must not authorize an Overview request",
  );

  await resetOverviewSession({ hint: true, lineLoggedIn: false });
  await seedOverviewAppCookie();
  delayNextAuthRestore = true;
  const beforeDelayedAuthCompletion = completedAuthRestores;
  const beforeDelayedAuthOverview = requests.filter((request) =>
    request.path.startsWith("/api/repository-overview?"),
  ).length;
  await page.goto(`${overviewFixture.origin}/acme/Operations`);
  await expect.poll(() => (releaseDelayedAuthRestore ? "delayed" : "pending")).toBe("delayed");
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  releaseDelayedAuthRestore();
  releaseDelayedAuthRestore = undefined;
  await expect.poll(() => completedAuthRestores).toBeGreaterThan(beforeDelayedAuthCompletion);
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve(undefined))),
      ),
  );
  await expect(
    page.getByRole("heading", { name: "登入後讀取 Repository", exact: true }),
  ).toBeVisible();
  assert.equal(await liffLoginCalls(), 0);
  assert.equal(
    requests.filter((request) => request.path.startsWith("/api/repository-overview?")).length,
    beforeDelayedAuthOverview,
    "A late passive auth response after pagehide must not start an Overview request",
  );
  result.checks.push(
    "stale hints never redirect or read Overview; pagehide rejects delayed passive authentication",
  );

  overviewVisibility = "private";
  overviewArchived = false;
  overviewPermissions = ["admin"];
  overviewLegacyStatus = "none";
  overviewFailure = null;
  await activatePrivateOverview();
  await expect(page.getByRole("heading", { name: "Repository 狀態", exact: true })).toBeVisible();
  await expect(page.getByText("Private", { exact: true })).toBeVisible();
  await expect(page.getByText("Active", { exact: true })).toBeVisible();
  await expect(page.getByText("admin", { exact: true })).toBeVisible();
  await expectRepositoryNavigation("Overview", true);
  await expect(page.getByRole("link", { name: "開啟舊 WBS 與移轉", exact: true })).toHaveCount(0);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.getByRole("heading", { name: "Repository 狀態", exact: true })).toHaveCount(0);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.getByRole("heading", { name: "Repository 狀態", exact: true })).toBeVisible();

  const beforePrivateRestore = requests.filter((request) =>
    request.path.startsWith("/api/repository-overview?"),
  ).length;
  await page.goto(`${overviewFixture.origin}/acme/Operations`);
  await expect(page.getByRole("heading", { name: "Repository 狀態", exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "登入以讀取 Repository", exact: true }),
  ).toHaveCount(0);
  await expect
    .poll(
      () =>
        requests.filter((request) => request.path.startsWith("/api/repository-overview?")).length,
    )
    .toBeGreaterThan(beforePrivateRestore);

  const beforePublicEnrichment = requests.filter((request) =>
    request.path.startsWith("/api/repository-overview?"),
  ).length;
  await page.goto(`${overviewFixture.origin}/acme/Operations?public`);
  await expect(page.getByRole("heading", { name: "Repository 狀態", exact: true })).toBeVisible();
  await expect
    .poll(
      () =>
        requests.filter((request) => request.path.startsWith("/api/repository-overview?")).length,
    )
    .toBeGreaterThan(beforePublicEnrichment);
  await expectRepositoryNavigation("Overview", true);

  overviewFailure = { status: 401, json: { error: "服務登入已失效，請重新登入。" } };
  const beforeExplicitExchanges = authRequests.filter(
    (request) => request.action === "exchange",
  ).length;
  await page.goto(`${overviewFixture.origin}/acme/Operations?public`);
  await expect(page.getByRole("heading", { name: "工作交付", exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Repository 資訊讀取失敗", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Repository 狀態", exact: true })).toHaveCount(0);
  await expect(repositoryNavigation().locator(":scope > a")).toHaveCount(11);
  overviewFailure = null;
  await page.getByRole("button", { name: "重新登入並重試", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Repository 狀態", exact: true })).toBeVisible();
  await expect
    .poll(() => authRequests.filter((request) => request.action === "exchange").length)
    .toBeGreaterThan(beforeExplicitExchanges);
  result.checks.push(
    "valid private session restores without a click; public hint verifies rights and API 401 requires explicit relogin",
  );

  overviewLegacyStatus = "available";
  await activatePrivateOverview();
  await expect(page.getByRole("link", { name: "開啟舊 WBS 與移轉", exact: true })).toHaveAttribute(
    "href",
    "/acme/Operations/wbs",
  );

  overviewVisibility = "internal";
  overviewArchived = true;
  overviewPermissions = ["read"];
  overviewLegacyStatus = "none";
  await activatePrivateOverview();
  await expect(page.getByText("Internal", { exact: true })).toBeVisible();
  await expect(page.getByText("Archived", { exact: true })).toBeVisible();
  await expect(page.getByText("read", { exact: true })).toBeVisible();
  await expectRepositoryNavigation("Overview", false);
  await expect(repositoryNavigation().locator(":scope > a")).toHaveCount(11);

  overviewArchived = false;
  overviewPermissions = ["admin"];
  overviewLegacyStatus = "unavailable";
  await activatePrivateOverview();
  const legacyAlert = page.getByRole("alert").filter({
    has: page.getByText("舊 WBS 狀態暫時無法確認。", { exact: true }),
  });
  await expect(legacyAlert).toBeVisible();
  overviewLegacyStatus = "none";
  await legacyAlert.getByRole("button", { name: "重試 Repository 資訊", exact: true }).click();
  await expect(legacyAlert).toHaveCount(0);

  overviewFailure = { status: 503, json: { error: "Repository source unavailable." } };
  await activatePrivateOverview();
  await expect(
    page.getByRole("heading", { name: "Repository 資訊讀取失敗", exact: true }),
  ).toBeVisible();
  overviewFailure = null;
  await page.getByRole("button", { name: "重試 Repository 資訊", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Repository 狀態", exact: true })).toBeVisible();

  overviewFailure = { status: 403, json: { error: "沒有 Repository 存取權限。" } };
  await activatePrivateOverview();
  await expect(
    page.getByRole("heading", { name: "無法讀取 Repository", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("沒有 Repository 存取權限。", { exact: true })).toBeVisible();

  overviewFailure = null;
  overviewLegacyStatus = "available";
  delayNextOverview = true;
  await activatePrivateOverview();
  await expect.poll(() => (releaseDelayedOverview ? "delayed" : "pending")).toBe("delayed");
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  releaseDelayedOverview();
  releaseDelayedOverview = undefined;
  await expect(page.getByRole("heading", { name: "Repository 狀態", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "開啟舊 WBS 與移轉", exact: true })).toHaveCount(0);
  result.checks.push(
    "private admin, reader/archive, legacy states, source retry, authorization denial, hidden/pagehide and late response clearing",
  );

  overviewVisibility = "private";
  overviewArchived = false;
  overviewPermissions = ["admin"];
  overviewLegacyStatus = "none";
  // Controlled local navigation experiment, not production Web Vitals.
  if (process.env.REPOSITORY_BENCHMARK === "1") {
    await gotoPath("/acme/Operations/labels");
    await expect(page.getByText("bug", { exact: true })).toBeVisible();
    const samples = [];
    let responses = [];
    const recordResponse = (response) => {
      const request = response.request();
      if (
        request.resourceType() === "script" ||
        response.headers()["content-type"]?.includes("text/x-component")
      ) {
        responses.push(
          response
            .body()
            .then((body) => ({ type: request.resourceType(), decodedBytes: body.length }))
            .catch(() => ({ type: request.resourceType(), decodedBytes: 0 })),
        );
      }
    };
    page.on("response", recordResponse);
    const ready = {
      Issues: () => page.getByRole("heading", { name: "目前沒有 Issues", exact: true }),
      Discussions: () => linkWithText(firstDiscussion.title),
      Labels: () => page.getByText("bug", { exact: true }),
      Milestones: () => linkWithText("#1 v1.0"),
      Settings: () => page.getByRole("heading", { name: "acme/Operations", exact: true }),
      Access: () => page.getByRole("heading", { name: "Direct User access", exact: true }),
    };
    for (let cycle = 0; cycle <= 20; cycle++) {
      for (const section of sections.slice(1)) {
        await page
          .locator(".app-shell")
          .evaluate((element) => (element.dataset.benchmarkShell = "retained"));
        const before = requests.length;
        responses = [];
        const started = performance.now();
        await clickRepositorySection(section);
        await expect(ready[section]()).toBeVisible();
        await expectRepositoryNavigation(section, true);
        const readyMs = performance.now() - started;
        const retained = await page
          .locator(".app-shell")
          .evaluate((element) => element.dataset.benchmarkShell === "retained");
        const bodies = await Promise.all(responses);
        if (cycle)
          samples.push({
            section,
            readyMs,
            retained,
            apiRequests: requests.length - before,
            decodedScriptBytes: bodies
              .filter((item) => item.type === "script")
              .reduce((sum, item) => sum + item.decodedBytes, 0),
            decodedRscBytes: bodies
              .filter((item) => item.type !== "script")
              .reduce((sum, item) => sum + item.decodedBytes, 0),
          });
      }
    }
    page.off("response", recordResponse);
    result.navigationBenchmark = {
      scope:
        "120 warmed soft navigations, 20 per section; synthetic immediate APIs; browser routing disables HTTP cache; client router cache/prefetch unchanged; excludes database-backed Overview; timings include Playwright click/assertion overhead and are not Web Vitals",
      samples,
    };
  }
  result.checks.push(
    "Repository sections share shell/header/navigation geometry per available link count at 1280, 390 and 320px; flat ordered links, no disclosure, 44px targets and no overflow",
  );
  const firstDiscussionPath = `/acme/Operations/discussions/number/${firstDiscussion.number}`;
  const secondDiscussionPath = `/acme/Operations/discussions/${secondDiscussion.id}`;
  const firstMilestonePath = "/acme/Operations/milestones/1";
  await gotoPath("/acme/Operations/discussions");
  await expect(page.getByRole("heading", { name: "Discussions", exact: true })).toBeVisible();
  await expectSingleLinkHref(
    linkWithText(`#${firstDiscussion.number} ${firstDiscussion.title}`),
    firstDiscussionPath,
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Discussions", exact: true })).toBeVisible();
  await expectSingleLinkHref(
    linkWithText(`#${firstDiscussion.number} ${firstDiscussion.title}`),
    firstDiscussionPath,
  );
  await clickLoadMore();
  await expectSingleLinkHref(linkWithText(secondDiscussion.title), secondDiscussionPath);
  await expect(linkWithText(secondDiscussion.title)).not.toContainText(/^#\d+\s/);
  await expectSingleLinkHref(
    linkWithText(`#${firstDiscussion.number} ${firstDiscussion.title}`),
    firstDiscussionPath,
  );
  await linkWithText(`#${firstDiscussion.number} ${firstDiscussion.title}`).click();
  await expect(page).toHaveURL(`${base}${firstDiscussionPath}`);
  await expect(
    page.getByRole("heading", {
      name: `#${firstDiscussion.number} ${firstDiscussion.title}`,
      exact: true,
    }),
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

  await page
    .locator(".app-shell")
    .evaluate((element) => (element.dataset.sharedLayoutCheck = "retained"));
  await clickRepositorySection("Labels");
  await expect(page.getByRole("heading", { name: "Labels", exact: true })).toBeVisible();
  await expect(page.getByText("bug", { exact: true })).toBeVisible();
  assert.equal(
    await page.locator(".app-shell").evaluate((element) => element.dataset.sharedLayoutCheck),
    "retained",
    "Sibling soft navigation must preserve the Repository layout",
  );
  await expect(page.getByText("help wanted", { exact: true })).toBeVisible();
  await page.getByRole("main").locator(".back-link").click();
  await expect(page).toHaveURL(`${base}/acme/Operations`);
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Labels", exact: true })).toBeVisible();
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

  await switchServiceAccount("token-b");
  delayNextPrivateLabels = true;
  await gotoPath("/private/Operations/labels");
  await expect.poll(() => (releaseDelayedPrivateLabels ? "delayed" : "pending")).toBe("delayed");
  await switchServiceAccount("token-a");
  releaseDelayedPrivateLabels();
  await gotoPath("/private/Operations/labels");
  await expectPageState("沒有可讀取的儲存庫資源", "沒有 Repository 存取權限");
  await expect(page.getByText("private-visible", { exact: true })).toHaveCount(0);

  await switchServiceAccount("token-b");
  await gotoPath("/private/Operations/labels");
  await expect(page.getByText("private-visible", { exact: true })).toBeVisible();
  await expect(page.getByText("bug", { exact: true })).toHaveCount(0);
  const readerNavigation = page.getByRole("navigation", { name: "Repository resources" });
  await expectRepositoryNavigation("Labels", false);
  await expect(readerNavigation.getByRole("link")).toHaveCount(11);
  await expect(readerNavigation.getByRole("link", { name: "Settings", exact: true })).toHaveCount(
    0,
  );
  await expect(readerNavigation.getByRole("link", { name: "Access", exact: true })).toHaveCount(0);
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
  await overviewFixture.close();
}
