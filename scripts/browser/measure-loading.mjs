import { createRequire } from "node:module";
import path from "node:path";

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
try {
  for (const pathname of ["/home", "/attendance", "/settings", "/repositories"]) {
    const context = await browser.newContext({ serviceWorkers: "block" });
    const page = await context.newPage();
    let scriptBytes = 0;
    let scripts = 0;
    let documents = 0;
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
      if (url.hostname === "static.line-scdn.net")
        return route.fulfill({
          contentType: "text/javascript",
          body: "window.liff={init:async()=>{},isLoggedIn:()=>true,getAccessToken:()=> 'synthetic',isInClient:()=>false,getProfile:async()=>({displayName:'測試會員'})};",
        });
      if (url.origin !== base.origin) return route.abort();
      if (url.pathname.startsWith("/api/"))
        return route.fulfill({ status: 403, json: { error: "合成資格拒絕" } });
      return route.continue();
    });
    await page.goto(new URL(pathname, base).href);
    // This bounded quiet period measures initial resources, not interaction readiness.
    await page.waitForLoadState("networkidle");
    await Promise.all(pending);
    console.log(JSON.stringify({ pathname, scripts, decodedScriptBytes: scriptBytes, documents }));
    await context.close();
  }
} finally {
  await browser.close();
}
