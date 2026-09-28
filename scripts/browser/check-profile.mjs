// Real Profile client components with synthetic LINE/API and minimal Next delivery adapters.
// This does not replace the separate Next route or database tests.
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
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
  "next/navigation": `const router={replace:(href)=>{window.resolvedTarget=href}}; export function usePathname(){return '/viewer'} export function useRouter(){return router}`,
};
await build({
  stdin: {
    contents: `import React from 'react';
      import {createRoot} from 'react-dom/client';
      import ProfileViewerShell from '../../apps/web/src/app/(public)/_components/profile-viewer-shell.tsx';
      import ProfileEntry from '../../apps/web/src/app/(mobile)/profile/profile-entry.tsx';
      import MemberAvatar from '../../apps/web/src/modules/account/member-avatar.tsx';
      import '../../apps/web/src/app/globals.css';
      const root = createRoot(document.getElementById('root'));
      window.liff={init:async()=>{},isLoggedIn:()=>true,getAccessToken:()=> 'synthetic',isInClient:()=>true,getProfile:async()=>window.holdProvider ? new Promise(()=>{}) : ({displayName:'LINE Viewer',statusMessage:'Ready to work'}),login:()=>{}};
      window.renderProfile=(props)=>root.render(<ProfileViewerShell key={props.instance} liffId="test" profileKind="USER" profileLogin="viewer" profileUserId="user-1" profileTitle="Public viewer" {...props}><h2>Popular</h2><p>Public repositories</p></ProfileViewerShell>);
      window.renderEntry=(instance)=>{window.resolvedTarget=null;root.render(<ProfileEntry key={instance} liffId="test"/>)};
      window.renderAvatar=(instance)=>root.render(<MemberAvatar key={instance} liffId="test"/>);
      window.renderProfile({instance:0});`,
    resolveDir: fileURLToPath(new URL(".", import.meta.url)),
    loader: "tsx",
  },
  bundle: true,
  outfile: path.join(output, "profile.js"),
  platform: "browser",
  nodePaths: [path.join(web, "node_modules")],
  jsx: "automatic",
  loader: { ".css": "css" },
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [
    {
      name: "next-test-delivery",
      setup(builder) {
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
          "line-mini-app": "exports.lineMiniApp = () => ({liffId:'test'});",
          "account.server":
            "exports.publicUserById = async () => ({login:'viewer'}); exports.profiles = {publicByUserId:async()=>null};",
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
    serviceWorkers: "block",
  });
  await context.tracing.start({ screenshots: true, snapshots: true });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let member = { id: "user-1", login: "viewer", status: "active" };
  let failAchievements = false;
  let heldProfile;
  let holdProfile = false;
  let membershipReads = 0;
  let membershipStatus = 200;
  let holdMembership = false;
  let heldMembership;
  const privateReads = [];
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== base) return route.abort();
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
            displayName: "Private viewer",
            bio: "Private biography",
            visibility: "private",
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
          : { items: [{ id: "a", name: "First achievement", description: "Synthetic" }] },
      });
    }
    if (url.pathname.startsWith("/api/"))
      throw new Error(`Unexpected profile request: ${url.pathname}`);
    return route.continue();
  });
  await page.goto(base);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Private viewer");
  await expect(page.getByText("Private biography")).toBeVisible();
  await expect(page.getByLabel("First achievement", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Settings", exact: true })).toBeVisible();
  assert.deepEqual(privateReads.sort(), ["/api/profile", "/api/profile/achievements"]);
  await page.screenshot({ path: path.join(output, "profile-self.png"), fullPage: true });
  results.push("self identity, achievements, settings; only two private section requests");

  failAchievements = true;
  await page.evaluate(() => window.renderProfile({ instance: 1 }));
  await expect(page.getByText("Achievements 目前不可用。")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Private viewer");
  await expect(page.getByText("Public repositories")).toBeVisible();
  results.push("failed achievement request preserves identity and public content");

  const beforeVisitor = privateReads.length;
  const beforeMembership = membershipReads;
  member = { id: "other", login: "other", status: "active" };
  await page.evaluate(() => window.renderProfile({ instance: 2 }));
  await expect.poll(() => membershipReads).toBeGreaterThan(beforeMembership);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Public viewer");
  await expect(page.getByText("Private biography")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Settings", exact: true })).toHaveCount(0);
  assert.equal(privateReads.length, beforeVisitor);
  results.push("other viewer cannot load or retain private sections");

  member = { id: "user-1", login: "viewer", status: "active" };
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

  holdProfile = true;
  await page.evaluate(() => window.renderProfile({ instance: 4 }));
  await expect.poll(() => Boolean(heldProfile)).toBe(true);
  member = { id: "other", login: "other", status: "active" };
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
    .fulfill({ json: { profile: { displayName: "STALE PRIVATE NAME", bio: "STALE PRIVATE BIO" } } })
    .catch(() => {});
  await expect(page.getByText("STALE PRIVATE NAME")).toHaveCount(0);
  await expect(page.getByText("STALE PRIVATE BIO")).toHaveCount(0);
  results.push("late private response cannot overwrite another User route");

  member = { id: "user-1", login: "viewer", status: "active" };
  await page.evaluate(() => window.renderEntry(6));
  await expect.poll(() => page.evaluate(() => window.resolvedTarget)).toBe("/viewer");
  member = { id: "user-1", login: "viewer", status: "paused" };
  await page.evaluate(() => window.renderEntry(7));
  await expect.poll(() => page.evaluate(() => window.resolvedTarget)).toBe("/membership/restore");
  member = null;
  await page.evaluate(() => window.renderEntry(8));
  await expect.poll(() => page.evaluate(() => window.resolvedTarget)).toBe("/membership/register");
  results.push("real entry component replaces with canonical login or lifecycle destination");
  member = { id: "user-1", login: "viewer", status: "active" };
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

  member = { id: "user-1", login: "viewer", status: "paused" };
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
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.getByRole("link", { name: "個人檔案", exact: true })).toHaveAttribute(
    "href",
    "/profile",
  );
  holdMembership = false;
  member = { id: "other", login: "other", status: "active" };
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.getByRole("link", { name: "個人檔案", exact: true })).toHaveAttribute(
    "href",
    "/other",
  );
  await heldMembership
    .fulfill({ json: { member: { id: "user-1", login: "viewer", status: "active" } } })
    .catch(() => {});
  await expect(page.getByRole("link", { name: "個人檔案", exact: true })).toHaveAttribute(
    "href",
    "/other",
  );
  results.push(
    "slow provider photo never gates navigation; lifecycle, failed lookup, resume and stale responses stay isolated",
  );
  assert.deepEqual(errors, []);
  console.log(`PASS: ${results.join("; ")}`);
} finally {
  writeFileSync(path.join(output, "results.json"), JSON.stringify({ results }, null, 2));
  if (context) await context.tracing.stop({ path: path.join(output, "profile-trace.zip") });
  await browser?.close();
  server.close();
  await once(server, "close");
}
