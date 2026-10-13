import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fulfillLineSessionMock } from "./line-session-mock.mjs";

const require = createRequire(import.meta.url);
const packagePath = process.env.PLAYWRIGHT_PACKAGE_PATH;
const loadPlaywright = packagePath
  ? (name) => require(path.join(path.resolve(packagePath), name))
  : require;
const { chromium } = loadPlaywright("playwright");
const base = new URL(process.env.NAVIGATION_BASE ?? "http://127.0.0.1:4117");
if (base.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(base.hostname))
  throw new Error("Only a local HTTP server may be measured with synthetic identity.");

const browser = await chromium.launch({
  channel: process.env.NAVIGATION_BROWSER_CHANNEL || undefined,
  headless: true,
});
const results = [];
try {
  for (const pathname of ["/home", "/attendance", "/settings", "/repositories"]) {
    const context = await browser.newContext({ serviceWorkers: "block" });
    await context.addInitScript(() => {
      window.liff = {
        init: async () => {},
        isLoggedIn: () => true,
        getAccessToken: () => "synthetic",
        isInClient: () => false,
        getProfile: async () => ({
          userId: "U11111111111111111111111111111111",
          displayName: "測試會員",
        }),
        closeWindow: () => {},
        openWindow: () => {},
        login: () => {},
      };
    });
    const page = await context.newPage();
    let scriptBytes = 0;
    let scripts = 0;
    let documents = 0;
    const authRequests = [];
    const apiRequests = [];
    const pending = [];
    page.on("response", (response) => {
      if (response.request().resourceType() === "document") documents++;
      if (response.request().resourceType() === "script") {
        scripts++;
        pending.push(response.body().then((body) => (scriptBytes += body.length)));
      }
    });
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== base.origin) return route.abort();
      if (url.pathname.startsWith("/api/")) apiRequests.push(url.pathname + url.search);
      if (
        await fulfillLineSessionMock(route, ({ method }) => {
          authRequests.push({
            method,
            action:
              method === "POST" ? (route.request().postDataJSON().action ?? "exchange") : method,
          });
        })
      )
        return;
      if (url.pathname.startsWith("/api/"))
        return route.fulfill({ status: 403, json: { error: "合成資格拒絕" } });
      return route.continue();
    });
    const homeActivity =
      pathname === "/home"
        ? page.waitForRequest(
            (request) => new URL(request.url()).pathname === "/api/repositories/explore",
          )
        : null;
    const initialAuth = page.waitForResponse(
      (response) => new URL(response.url()).pathname === "/api/auth",
    );
    await page.goto(new URL(pathname, base).href);
    await initialAuth;
    if (homeActivity) await homeActivity;
    // This bounded quiet period measures initial resources, not interaction readiness.
    await page.waitForLoadState("networkidle");
    await Promise.all(pending);
    if (
      pathname === "/home" &&
      (!apiRequests.includes("/api/repositories/explore?view=activity") ||
        apiRequests.includes("/api/repositories/explore"))
    )
      throw new Error(
        `Home Recent must request only the activity projection: ${JSON.stringify(apiRequests)}`,
      );
    const navigation = await page.evaluate(() => {
      const entry = performance.getEntriesByType("navigation")[0];
      return { ttfbMs: entry.responseStart, domContentLoadedMs: entry.domContentLoadedEventEnd };
    });
    results.push({
      pathname,
      phase: "fresh-document",
      scripts,
      decodedScriptBytes: scriptBytes,
      documents,
      authRequests: [...authRequests],
      apiRequests: [...apiRequests],
      ...navigation,
    });
    authRequests.length = 0;
    const restored = page.waitForResponse(
      (response) => new URL(response.url()).pathname === "/api/auth",
    );
    await page.reload();
    await restored;
    await page.waitForLoadState("networkidle");
    if (authRequests.length !== 1 || authRequests[0].action !== "restore")
      throw new Error(`${pathname}: cookie restore must use exactly one auth request.`);
    results.push({ pathname, phase: "cookie-restore", authRequests: [...authRequests] });
    await context.close();
  }
  console.log(JSON.stringify(results, null, 2));
  if (process.env.NAVIGATION_ARTIFACT_DIR)
    writeFileSync(
      path.join(process.env.NAVIGATION_ARTIFACT_DIR, "loading-results.json"),
      `${JSON.stringify(results, null, 2)}\n`,
    );
} finally {
  await browser.close();
}
