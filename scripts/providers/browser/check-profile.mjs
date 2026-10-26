// Real Profile client components with synthetic LINE/API and minimal Next delivery adapters.
// This does not replace the separate Next route or database tests.
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fulfillLineSessionMock } from "./line-session-mock.mjs";
import { captureShell } from "./shell-evidence.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const web = path.join(root, "apps/web");
const require = createRequire(path.join(web, "package.json"));
const { build } = createRequire(require.resolve("tsx"))("esbuild");
const playwrightRoot = process.env.PLAYWRIGHT_PACKAGE_PATH;
const loadPlaywright = playwrightRoot
  ? (name) => require(path.join(path.resolve(playwrightRoot), name))
  : require;
const { chromium } = loadPlaywright("playwright");
const { expect } = loadPlaywright("playwright/test");
const output = process.env.NAVIGATION_ARTIFACT_DIR
  ? path.join(process.env.NAVIGATION_ARTIFACT_DIR, "profile")
  : path.join(root, ".artifacts/browser/profile-component");
mkdirSync(output, { recursive: true });

const adapters = {
  "next/link": `import React from 'react'; export default function Link({children,href,...props}) { return <a href={href} {...props}>{children}</a>; }`,
  "next/script": `import {useEffect} from 'react'; export default function Script({onReady}) { useEffect(()=>{onReady()},[]); return null; }`,
  "next/navigation": `const router={replace:(href)=>{window.resolvedTarget=href}}; export function usePathname(){return '/viewer'} export function useRouter(){return router} export function notFound(){throw Error('not-found')}`,
};
await build({
  stdin: {
    contents: `import React from 'react';
      import {createRoot} from 'react-dom/client';
      import ProfileViewerShell from '../../apps/web/src/app/(public)/_components/profile-viewer-shell.tsx';
      import ProfilePage from '../../apps/web/src/app/(public)/[login]/page.tsx';
      import ProfileEntry from '../../apps/web/src/app/(mobile)/profile/profile-entry.tsx';
      import MemberAvatar from '../../apps/web/src/modules/account/member-avatar.tsx';
      import NetworkPanel from '../../apps/web/src/modules/account/network-panel.tsx';
      import '../../apps/web/src/app/globals.css';
      import {startLineMiniAppBoot} from '../../apps/web/src/shared/browser/liff-bootstrap.ts';
      const root = createRoot(document.getElementById('root'));
      startLineMiniAppBoot();
      window.renderProfile=async(props)=>{
        const page=await ProfilePage({params:Promise.resolve({login:'viewer'})});
        const popular=page.props.children.props.children;
        const content=await popular.type(popular.props);
        root.render(<ProfileViewerShell key={props.instance} liffId="test" profileKind="USER" profileLogin="viewer" profileUserId="user-1" profileTitle="Public viewer" {...props}>{content}</ProfileViewerShell>);
      };
      window.renderEntry=(instance)=>{window.resolvedTarget=null;root.render(<ProfileEntry key={instance} liffId="test"/>)};
      window.renderAvatar=(instance)=>root.render(<MemberAvatar key={instance} liffId="test"/>);
      window.renderNetwork=(instance)=>root.render(<NetworkPanel key={instance} liffId="test"/>);
      window.renderProfile({instance:0});`,
    resolveDir: fileURLToPath(new URL(".", import.meta.url)),
    loader: "tsx",
  },
  bundle: true,
  outfile: path.join(output, "profile.js"),
  platform: "browser",
  conditions: ["style"],
  nodePaths: [path.join(web, "node_modules")],
  jsx: "automatic",
  loader: { ".css": "css" },
  define: {
    "process.env.NODE_ENV": '"production"',
    "process.env.NEXT_PUBLIC_BROWSER_TEST_HARNESS": '"true"',
  },
  plugins: [
    {
      name: "next-test-delivery",
      setup(builder) {
        const publicQueries = {
          "mini-app": "export const lineMiniApp=()=>({liffId:'test'});",
          "account.server":
            "export const publicUserById=async()=>({login:'viewer'}); export const profiles={publicByUserId:async()=>null};",
          "account-status.server": "export const profileStatuses={publicByUserId:async()=>null};",
          "namespace.server":
            "export const resolveAccountNamespace=async()=>({id:'user-1',login:'viewer',kind:'USER'});",
          "directory.server":
            "export const publicOrganizations=()=>({byLogin:async()=>({name:'Organization'})});",
          "repository.server":
            "export const publicRepositories=()=>({popularByOwner:async()=>({totalCount:2,items:[{id:'repo-1',ownerLogin:'viewer',name:'Operations',starCount:3},{id:'repo-2',ownerLogin:'viewer',name:'Field work',starCount:1}]})});",
        };
        builder.onResolve(
          {
            filter:
              /(?:mini-app|account\.server|account-status\.server|namespace\.server|directory\.server|repository\.server)$/,
          },
          ({ path: specifier }) => ({
            path: specifier.split("/").at(-1),
            namespace: "profile-public-queries",
          }),
        );
        builder.onLoad({ filter: /.*/, namespace: "profile-public-queries" }, ({ path: key }) => ({
          contents: publicQueries[key],
          loader: "js",
        }));
        builder.onLoad({ filter: /\.module\.css$/ }, (args) => ({
          contents: readFileSync(args.path, "utf8"),
          loader: "local-css",
          resolveDir: path.dirname(args.path),
        }));
        builder.onResolve({ filter: /^next\/(link|script|navigation)$/ }, (args) => ({
          path: args.path,
          namespace: "next-test-delivery",
        }));
        builder.onLoad({ filter: /.*/, namespace: "next-test-delivery" }, (args) => ({
          contents: adapters[args.path],
          loader: "jsx",
          resolveDir: web,
        }));
      },
    },
  ],
});

const server = createServer((request, response) => {
  const name =
    request.url === "/profile.js"
      ? "profile.js"
      : request.url === "/profile.css"
        ? "profile.css"
        : null;
  response.setHeader(
    "Content-Type",
    name?.endsWith(".js") ? "text/javascript" : name ? "text/css" : "text/html",
  );
  response.end(
    name
      ? readFileSync(path.join(output, name))
      : '<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/profile.css"><div id="root"></div><script src="/profile.js"></script></html>',
  );
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
let context;
const results = [];
// Exercise the real server page with held owner queries, without a database or credentials.
await build({
  entryPoints: [path.join(web, "src/app/(public)/[login]/page.tsx")],
  outfile: path.join(output, "profile-page.cjs"),
  bundle: true,
  platform: "node",
  format: "cjs",
  jsx: "automatic",
  packages: "external",
  plugins: [
    {
      name: "profile-owner-queries",
      setup(builder) {
        const stubs = {
          "next/link": "exports.default = () => null;",
          "next/navigation": "exports.notFound = () => { throw Error('not-found'); };",
          "resource-navigation": "exports.repositoryPath = () => '/repository';",
          "mini-app": "exports.lineMiniApp = () => ({liffId:'test'});",
          "account.server":
            "exports.publicUserById = async () => ({login:'viewer'}); exports.profiles = {publicByUserId:async()=>null};",
          "account-status.server": "exports.profileStatuses={publicByUserId:async()=>null};",
          "namespace.server":
            "exports.resolveAccountNamespace = async () => ({id:'user-1',login:'viewer',kind:'USER'});",
          "directory.server":
            "exports.publicOrganizations = () => ({byLogin:async()=>({name:'Organization'})});",
          "repository.server":
            "exports.publicRepositories = () => ({popularByOwner:()=>{globalThis.repositoryReads++;return globalThis.profileRepositories;}});",
          "profile-viewer-shell": "exports.default = () => null;",
          "profile.module.css": "exports.default = {};",
        };
        builder.onResolve({ filter: /.*/ }, ({ path: specifier }) => {
          if (specifier === "react" || specifier.startsWith("react/"))
            return { path: require.resolve(specifier), external: true };
          const key = Object.keys(stubs).find(
            (key) => specifier === key || specifier.endsWith("/" + key),
          );
          return key ? { path: key, namespace: "profile-owner-queries" } : undefined;
        });
        builder.onLoad({ filter: /.*/, namespace: "profile-owner-queries" }, ({ path: key }) => ({
          contents: stubs[key],
          loader: "js",
        }));
      },
    },
  ],
});
const ProfilePage = require(path.join(output, "profile-page.cjs")).default;
let releaseRepositories;
globalThis.profileRepositories = new Promise((resolve) => {
  releaseRepositories = resolve;
});
globalThis.repositoryReads = 0;
let pageReady = false;
const pendingPage = ProfilePage({ params: Promise.resolve({ login: "viewer" }) }).then((value) => {
  pageReady = true;
  return value;
});
await new Promise((resolve) => setImmediate(resolve));
const pageWasBlocked = !pageReady;
releaseRepositories({ items: [], totalCount: 7 });
const serverPage = await pendingPage;
const countBoundary = serverPage.props.publicRepositoryCount;
assert.equal(countBoundary.type, Symbol.for("react.suspense"));
assert.equal(serverPage.props.children.type, Symbol.for("react.suspense"));
assert.equal(await countBoundary.props.children.type(countBoundary.props.children.props), 7);
assert.equal(globalThis.repositoryReads, 1, "count and Popular share one owner query");
globalThis.profileRepositories = Promise.resolve().then(() => {
  throw Error("synthetic unavailable");
});
const failedPage = await ProfilePage({ params: Promise.resolve({ login: "viewer" }) });
const failedPopular = failedPage.props.children.props.children;
const failedContent = await failedPopular.type(failedPopular.props);
assert.equal(
  failedContent.props.children[1].props.children,
  "公開 Repository 目前不可用，請稍後重試。",
);
delete globalThis.profileRepositories;
delete globalThis.repositoryReads;
assert.equal(
  pageWasBlocked,
  false,
  "Profile identity must render before Popular repositories resolve",
);
results.push("server Profile identity does not wait for Popular repositories");
try {
  browser = await chromium.launch({ channel: process.env.NAVIGATION_BROWSER_CHANNEL || undefined });
  context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    timezoneId: "Asia/Taipei",
    serviceWorkers: "block",
  });
  await context.addInitScript(() => {
    window.liff = {
      init: async () => {},
      isLoggedIn: () => true,
      getAccessToken: () => {
        const key = "profile-line-access-token-reads";
        const reads = Number(sessionStorage.getItem(key) ?? "0") + 1;
        sessionStorage.setItem(key, String(reads));
        return sessionStorage.getItem("profile-line-access-token-mode") === "unavailable"
          ? null
          : "synthetic";
      },
      isInClient: () => true,
      getProfile: async () =>
        window.holdProvider
          ? new Promise(() => {})
          : {
              userId: "U11111111111111111111111111111111",
              displayName: "LINE Viewer",
              statusMessage: "Ready to work",
            },
      closeWindow: () => {},
      openWindow: () => {},
      login: () => {},
    };
  });
  await context.tracing.start({ screenshots: true, snapshots: true });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const accountMember = (id, login, status) => ({
    id,
    login,
    status,
    createdAt: 1,
    googleEmail: null,
  });
  let member = accountMember("user-1", "viewer", "active");
  let failAchievements = false;
  let failFollows = false;
  let failStatus = false;
  let following = [{ userId: "friend", followedAt: 1, login: "friend" }];
  let profileStatus = null;
  let loseNextStatusResponse = false;
  let holdStatusPost = false;
  let heldStatusPost;
  const statusReceipts = new Map();
  const statusWrites = [];
  let heldProfile;
  let holdProfile = false;
  let membershipReads = 0;
  let membershipStatus = 200;
  let holdMembership = false;
  let heldMembership;
  let authProofExchanges = 0;
  const authMethods = [];
  const privateReads = [];
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== base) return route.abort();
    if (
      await fulfillLineSessionMock(route, ({ method }) => {
        authMethods.push(method);
        if (method === "POST" && route.request().postDataJSON().accessToken) authProofExchanges++;
      })
    )
      return;
    if (url.pathname === "/api/membership") {
      membershipReads++;
      assert.equal(url.search, "?view=account");
      if (holdMembership) {
        heldMembership = route;
        return;
      }
      return route.fulfill({ status: membershipStatus, json: { member } });
    }
    if (url.pathname === "/api/profile") {
      privateReads.push(url.pathname);
      if (holdProfile) {
        heldProfile = route;
        return;
      }
      return route.fulfill({
        json: {
          profile: {
            userId: "user-1",
            displayName: "Private viewer",
            bio: "Private biography",
            avatarRef: null,
            visibility: "private",
            version: 1,
            createdAt: 1,
            updatedAt: 1,
          },
        },
      });
    }
    if (url.pathname === "/api/profile/achievements") {
      privateReads.push(url.pathname);
      return route.fulfill({
        status: failAchievements ? 503 : 200,
        json: failAchievements
          ? { error: "unavailable" }
          : {
              items: [
                {
                  id: "a",
                  name: "First achievement",
                  description: "Synthetic",
                  iconRef: null,
                  sourceKind: "repository",
                  sourceId: "repository-1",
                  awardedAt: 1,
                },
              ],
            },
      });
    }
    if (url.pathname === "/api/profile/status") {
      if (route.request().method() === "POST") {
        if (holdStatusPost) {
          heldStatusPost = route;
          return;
        }
        const body = route.request().postDataJSON();
        statusWrites.push(body);
        const receipt = statusReceipts.get(body.requestId);
        if (receipt) return route.fulfill({ json: { status: receipt } });
        profileStatus = {
          userId: "user-1",
          ...body,
          version: (profileStatus?.version ?? 0) + 1,
          createdAt: 1,
          updatedAt: 2,
        };
        statusReceipts.set(body.requestId, profileStatus);
        if (loseNextStatusResponse) {
          loseNextStatusResponse = false;
          return route.abort("failed");
        }
        return route.fulfill({ json: { status: profileStatus } });
      }
      privateReads.push(url.pathname);
      return route.fulfill({
        status: failStatus ? 503 : 200,
        json: failStatus ? { error: "狀態讀取失敗。" } : { status: profileStatus },
      });
    }
    if (url.pathname === "/api/follows") {
      if (route.request().method() === "POST") {
        const body = route.request().postDataJSON();
        following =
          body.action === "follow"
            ? [
                ...following,
                {
                  userId: body.targetUserId ?? body.targetLogin,
                  followedAt: 2,
                  login: body.targetLogin ?? "viewer",
                },
              ]
            : following.filter((item) => item.userId !== body.targetUserId);
        return route.fulfill({ json: { ok: true } });
      }
      return route.fulfill({
        status: failFollows ? 503 : 200,
        json: failFollows
          ? { error: "unavailable" }
          : { followers: [{ userId: "friend", followedAt: 1, login: "friend" }], following },
      });
    }
    if (url.pathname.startsWith("/api/"))
      throw new Error(`Unexpected profile request: ${url.pathname}`);
    return route.continue();
  });
  await page.goto(base);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Private viewer");
  await expect(page.getByText("Private biography")).toBeVisible();
  await expect(page.getByRole("link", { name: "1 followers", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "1 following", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Set your status", exact: true })).toBeVisible();
  await expect(page.getByLabel("First achievement", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Settings", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Projects", exact: true })).toHaveAttribute(
    "href",
    "/projects",
  );
  assert.deepEqual(privateReads.sort(), [
    "/api/profile",
    "/api/profile/achievements",
    "/api/profile/status",
  ]);
  assert.equal(authProofExchanges, 1, "the initial service session exchanges LINE proof once");
  assert.equal(authMethods[0], "POST", "a fresh LIFF entry exchanges proof without a restore hop");
  const tokenReads = await page.evaluate(() =>
    sessionStorage.getItem("profile-line-access-token-reads"),
  );
  await page.evaluate(() =>
    sessionStorage.setItem("profile-line-access-token-mode", "unavailable"),
  );
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Private viewer");
  assert.equal(authProofExchanges, 1, "a valid cookie restores the app session without LINE proof");
  assert.deepEqual(
    authMethods,
    ["POST", "POST"],
    "reload restores and renews in one request without a GET/PATCH chain",
  );
  assert.equal(
    await page.evaluate(() => sessionStorage.getItem("profile-line-access-token-reads")),
    tokenReads,
    "a valid app session survives reload without requesting a LINE access token",
  );
  results.push(
    "valid product session restores after reload without a LINE token or proof exchange",
  );
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    const share = page.getByRole("button", { name: "分享 Profile", exact: true });
    const settings = page.getByRole("link", { name: "Settings", exact: true });
    const shareBox = await share.boundingBox();
    const settingsBox = await settings.boundingBox();
    assert.equal(shareBox.width, 44);
    assert.equal(shareBox.height, 44);
    assert.equal(settingsBox.width, 44);
    assert.equal(settingsBox.height, 44);
    assert.ok(Math.abs(shareBox.y - settingsBox.y) <= 1, "toolbar controls share one baseline");
    assert.ok(settingsBox.x > shareBox.x + shareBox.width, "toolbar controls have a visible gap");
    for (const control of [share, settings]) {
      assert.deepEqual(
        await control.evaluate((element) => {
          const style = getComputedStyle(element);
          return {
            background: style.backgroundColor,
            border: style.borderTopWidth,
            padding: style.padding,
            margin: style.marginTop,
          };
        }),
        { background: "rgba(0, 0, 0, 0)", border: "0px", padding: "0px", margin: "0px" },
      );
    }
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    );
    const popularCard = await page.getByRole("link", { name: /Operations/ }).boundingBox();
    assert.ok(popularCard.x >= 15, "Popular card keeps the page inset after resizing");
  }
  await page.screenshot({ path: path.join(output, "profile-self.png") });
  await captureShell(page, output, "profile-self", 1);
  await page.evaluate(() =>
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (value) => {
        window.sharedProfile = value;
      },
    }),
  );
  await page.getByRole("button", { name: "分享 Profile", exact: true }).click();
  assert.equal(await page.evaluate(() => window.sharedProfile.url), base + "/");
  await page.evaluate(() =>
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async () => {
        throw new DOMException("Cancelled", "AbortError");
      },
    }),
  );
  await page.getByRole("button", { name: "分享 Profile", exact: true }).click();
  await expect(page.getByText("目前無法分享這個連結。", { exact: true })).toHaveCount(0);
  await page.evaluate(() => {
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value) => {
          window.copiedProfile = value;
        },
      },
    });
  });
  await page.getByRole("button", { name: "分享 Profile", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("已複製個人頁連結。");
  assert.equal(await page.evaluate(() => window.copiedProfile), base + "/");
  results.push(
    "320/390px Profile toolbar alignment, real Popular cards, native share, cancellation and clipboard fallback",
  );
  results.push("self identity, achievements, settings, followers and following use owner reads");

  await page.getByRole("button", { name: "Set your status", exact: true }).click();
  await page.getByLabel("狀態訊息", { exact: true }).fill("專心處理問題單");
  await page.getByLabel("表情", { exact: true }).fill("🎯");
  await page.getByLabel("顯示忙碌中", { exact: true }).check();
  await page.getByRole("button", { name: "更新狀態", exact: true }).click();
  await expect(page.getByRole("button", { name: "Set your status", exact: true })).toContainText(
    "專心處理問題單",
  );
  assert.equal(statusWrites[0].expectedVersion, 0);
  assert.equal(statusWrites[0].limitedAvailability, true);
  await page.reload();
  await expect(page.getByRole("button", { name: "Set your status", exact: true })).toContainText(
    "專心處理問題單",
  );
  await page.getByRole("button", { name: "Set your status", exact: true }).click();
  await page.getByRole("button", { name: "清除狀態", exact: true }).click();
  await expect(page.getByRole("button", { name: "Set your status", exact: true })).toHaveText(
    /Set your status/,
  );
  assert.equal(statusWrites.at(-1).expectedVersion, 1);
  assert.equal(statusWrites.at(-1).message, null);
  results.push(
    "authored Profile status saves, reads back after reload, and clears with observed version",
  );

  await page.getByRole("button", { name: "Set your status", exact: true }).click();
  await page.getByLabel("狀態訊息", { exact: true }).fill("尚未保存的草稿");
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Set your status", exact: true }),
  ).not.toContainText("尚未保存的草稿");
  await page.getByRole("button", { name: "Set your status", exact: true }).click();
  await page.getByLabel("狀態訊息", { exact: true }).fill("重試後確認");
  loseNextStatusResponse = true;
  await page.getByRole("button", { name: "更新狀態", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  profileStatus = { ...profileStatus, message: "其他裝置的最新狀態", version: 4 };
  await page.getByRole("button", { name: "更新狀態", exact: true }).click();
  await expect(page.getByRole("button", { name: "Set your status", exact: true })).toContainText(
    "其他裝置的最新狀態",
  );
  assert.equal(statusWrites.at(-1).requestId, statusWrites.at(-2).requestId);
  assert.equal(
    profileStatus.version,
    4,
    "unknown-result retry does not overwrite a later device write",
  );
  results.push(
    "cancel does not publish drafts; lost status response retries with the same request identity",
  );

  failAchievements = true;
  failFollows = true;
  failStatus = true;
  await page.evaluate(() => window.renderProfile({ instance: 1 }));
  await expect(page.getByText("Achievements 目前不可用。")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Private viewer");
  await expect(page.getByRole("heading", { name: "Popular", exact: true })).toBeVisible();
  await expect(page.getByText("追蹤關係目前不可用，請稍後重試。")).toBeVisible();
  await expect(page.getByRole("alert")).toHaveText("狀態讀取失敗。");
  await expect(page.getByRole("link", { name: "0 followers", exact: true })).toHaveCount(0);
  failFollows = false;
  failStatus = false;
  results.push(
    "failed private section requests preserve identity and public content without fake zero counts",
  );

  const beforeVisitor = privateReads.length;
  const beforeMembership = membershipReads;
  member = accountMember("other", "other", "active");
  await page.evaluate(() => window.renderProfile({ instance: 2 }));
  await expect.poll(() => membershipReads).toBeGreaterThan(beforeMembership);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Public viewer");
  await expect(page.getByText("Private biography")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Settings", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Projects", exact: true })).toHaveCount(0);
  assert.equal(privateReads.length, beforeVisitor);
  await expect(page.getByRole("button", { name: "追蹤", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "追蹤", exact: true }).click();
  await expect(page.getByRole("button", { name: "取消追蹤", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "取消追蹤", exact: true }).click();
  await expect(page.getByRole("button", { name: "追蹤", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Set your status", exact: true })).toHaveCount(0);
  await captureShell(page, output, "profile-visitor", 0);
  results.push(
    "other active viewer can follow/unfollow with readback but cannot load or retain target private sections",
  );

  member = accountMember("user-1", "viewer", "active");
  const beforeOrganization = membershipReads;
  await page.evaluate(() =>
    window.renderProfile({
      instance: 3,
      profileKind: "ORGANIZATION",
      profileTitle: "Organization",
    }),
  );
  await expect.poll(() => membershipReads).toBeGreaterThan(beforeOrganization);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Organization");
  assert.equal(privateReads.length, beforeVisitor);
  results.push("Organization never receives User self controls or private requests");
  await captureShell(page, output, "profile-organization", 0);

  holdProfile = true;
  await page.evaluate(() => window.renderProfile({ instance: 4 }));
  await expect.poll(() => Boolean(heldProfile)).toBe(true);
  member = accountMember("other", "other", "active");
  await page.evaluate(() =>
    window.renderProfile({
      instance: 5,
      profileLogin: "other",
      profileUserId: "third",
      profileTitle: "Other profile",
    }),
  );
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Other profile");
  await heldProfile
    .fulfill({
      json: {
        profile: {
          userId: "user-1",
          displayName: "STALE PRIVATE NAME",
          bio: "STALE PRIVATE BIO",
          avatarRef: null,
          visibility: "private",
          version: 1,
          createdAt: 1,
          updatedAt: 1,
        },
      },
    })
    .catch(() => {});
  await expect(page.getByText("STALE PRIVATE NAME")).toHaveCount(0);
  await expect(page.getByText("STALE PRIVATE BIO")).toHaveCount(0);
  results.push("late private response cannot overwrite another User route");

  member = accountMember("user-1", "viewer", "active");
  await page.evaluate(() => window.renderEntry(6));
  await expect.poll(() => page.evaluate(() => window.resolvedTarget)).toBe("/viewer");
  member = accountMember("user-1", "viewer", "paused");
  await page.evaluate(() => window.renderEntry(7));
  await expect.poll(() => page.evaluate(() => window.resolvedTarget)).toBe("/membership/restore");
  member = null;
  await page.evaluate(() => window.renderEntry(8));
  await expect.poll(() => page.evaluate(() => window.resolvedTarget)).toBe("/membership/register");
  results.push("real entry component replaces with canonical login or lifecycle destination");
  member = accountMember("user-1", "viewer", "active");
  const beforeAvatar = membershipReads;
  await page.evaluate(() => {
    window.holdProvider = true;
    window.renderAvatar(9);
  });
  await expect(page.getByRole("link", { name: "個人檔案", exact: true })).toHaveAttribute(
    "href",
    "/viewer",
  );
  assert.equal(membershipReads - beforeAvatar, 1);
  results.push(
    "Home avatar goes directly to the verified namespace without the Profile resolver hop",
  );
  await page.screenshot({ path: path.join(output, "profile-avatar-direct.png") });

  member = accountMember("user-1", "viewer", "paused");
  await page.evaluate(() => window.renderAvatar(10));
  await expect(page.getByRole("link", { name: "個人檔案", exact: true })).toHaveAttribute(
    "href",
    "/membership/restore",
  );
  member = null;
  await page.evaluate(() => window.renderAvatar(11));
  await expect(page.getByRole("link", { name: "個人檔案", exact: true })).toHaveAttribute(
    "href",
    "/membership/register",
  );
  membershipStatus = 503;
  const beforeFailure = membershipReads;
  await page.evaluate(() => window.renderAvatar(12));
  await expect.poll(() => membershipReads).toBeGreaterThan(beforeFailure);
  await expect(page.getByRole("link", { name: "個人檔案", exact: true })).toHaveAttribute(
    "href",
    "/profile",
  );

  membershipStatus = 200;
  holdMembership = true;
  await page.evaluate(() => window.renderAvatar(13));
  await expect.poll(() => Boolean(heldMembership)).toBe(true);
  await expect(page.getByRole("link", { name: "個人檔案", exact: true })).toHaveCount(0);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.getByRole("link", { name: "個人檔案", exact: true })).toHaveCount(0);
  holdMembership = false;
  member = accountMember("other", "other", "active");
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.getByRole("link", { name: "個人檔案", exact: true })).toHaveAttribute(
    "href",
    "/other",
  );
  await heldMembership
    .fulfill({ json: { member: accountMember("user-1", "viewer", "active") } })
    .catch(() => {});
  await expect(page.getByRole("link", { name: "個人檔案", exact: true })).toHaveAttribute(
    "href",
    "/other",
  );
  results.push(
    "slow provider photo never gates navigation; lifecycle, failed lookup, resume and stale responses stay isolated",
  );
  holdMembership = false;
  member = accountMember("user-1", "viewer", "active");
  await page.evaluate(() => window.renderNetwork(14));
  await expect(
    page.locator("#followers").getByRole("link", { name: "@friend", exact: true }),
  ).toHaveAttribute("href", "/friend");
  await expect(page.locator("#following")).toBeVisible();
  await page.getByLabel("登入名稱", { exact: true }).fill("teammate");
  await page.getByRole("button", { name: "追蹤使用者", exact: true }).click();
  await expect(
    page.locator("#following").getByRole("link", { name: "@teammate", exact: true }),
  ).toHaveAttribute("href", "/teammate");
  await page
    .locator("#following li")
    .filter({ has: page.getByRole("link", { name: "@teammate", exact: true }) })
    .getByRole("button", { name: "取消追蹤", exact: true })
    .click();
  await expect(
    page.locator("#following").getByRole("link", { name: "@teammate", exact: true }),
  ).toHaveCount(0);
  results.push("Network anchors, canonical login entry, profile links, and unfollow readback");
  holdProfile = false;
  failAchievements = false;
  profileStatus = { ...profileStatus, expiresAt: 8_640_000_000_000_000 };
  await page.evaluate(() => window.renderProfile({ instance: 15 }));
  await page.getByRole("button", { name: "Set your status", exact: true }).click();
  await expect(page.getByRole("button", { name: "清除狀態", exact: true })).toBeEnabled();
  await page.getByLabel("狀態訊息", { exact: true }).fill("最遠到期日仍可編輯");
  await page.getByRole("button", { name: "更新狀態", exact: true }).click();
  await expect(page.getByRole("button", { name: "Set your status", exact: true })).toContainText(
    "最遠到期日仍可編輯",
  );
  assert.equal(statusWrites.at(-1).expiresAt, 8_640_000_000_000_000);
  await page.getByRole("button", { name: "Set your status", exact: true }).click();
  await page.getByRole("button", { name: "清除狀態", exact: true }).click();
  await expect(page.getByRole("button", { name: "Set your status", exact: true })).toHaveText(
    /Set your status/,
  );
  results.push("maximum valid expiry loads, edits and clears in UTC+8 without date overflow");
  await page.getByRole("button", { name: "Set your status", exact: true }).click();
  await page.getByLabel("狀態訊息", { exact: true }).fill("背景中的舊操作");
  holdStatusPost = true;
  await page.getByRole("button", { name: "更新狀態", exact: true }).click();
  await expect.poll(() => Boolean(heldStatusPost)).toBe(true);
  const readsBeforeHidden = privateReads.filter((entry) => entry === "/api/profile/status").length;
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.getByRole("button", { name: "Set your status", exact: true })).toHaveCount(0);
  const conflictResponse = page.waitForResponse(
    (response) => response.url().endsWith("/api/profile/status") && response.status() === 409,
  );
  await heldStatusPost.fulfill({ status: 409, json: { error: "狀態已更新，請重新載入。" } });
  await conflictResponse;
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  assert.equal(
    privateReads.filter((entry) => entry === "/api/profile/status").length,
    readsBeforeHidden,
    "late conflict cannot issue a private read after visibility invalidation",
  );
  results.push("late 409 after backgrounding cannot revive private status reads or controls");
  assert.deepEqual(errors, []);
  console.log(`PASS: ${results.join("; ")}`);
} finally {
  writeFileSync(path.join(output, "results.json"), JSON.stringify({ results }, null, 2));
  if (context) await context.tracing.stop({ path: path.join(output, "profile-trace.zip") });
  await browser?.close();
  server.close();
  await once(server, "close");
}
