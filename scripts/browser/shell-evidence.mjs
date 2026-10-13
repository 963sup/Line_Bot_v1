import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import path from "node:path";

// Shared evidence collection for the real Next routes and the separate Profile fixture.
export async function captureShell(page, output, name, navigationCount) {
  const results = [];
  const original = page.viewportSize();
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    const metrics = await page.evaluate(() => {
      const box = (element) => {
        if (!element) return null;
        const { x, y, width, height } = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return { x, y, width, height, padding: style.padding, position: style.position };
      };
      return {
        mains: document.querySelectorAll("main").length,
        targets: document.querySelectorAll("#main-content").length,
        skipLinks: document.querySelectorAll('a.skip-link[href="#main-content"]').length,
        overflow: document.documentElement.scrollWidth - innerWidth,
        shell: box(document.querySelector(".app-shell")),
        main: box(document.querySelector("main")),
        heading: box(document.querySelector("h1")),
        navigation: box(document.querySelector(".work-navigation")),
        navigationCount: document.querySelectorAll(".work-navigation").length,
        active:
          document.querySelector('.work-navigation [aria-current="page"]')?.getAttribute("href") ??
          null,
      };
    });
    assert.equal(metrics.mains, 1, `${name}: one main`);
    assert.equal(metrics.targets, 1, `${name}: one skip-link target`);
    assert.equal(metrics.skipLinks, 1, `${name}: one skip link`);
    assert.equal(metrics.navigationCount, navigationCount, `${name}: navigation visibility`);
    assert.ok(metrics.overflow <= 1, `${name}: no horizontal overflow at ${width}px`);
    results.push({ width, ...metrics });
    if (output)
      await page.screenshot({
        path: path.join(output, `shell-${name}-${width}.png`),
        animations: "disabled",
      });
  }
  if (output)
    writeFileSync(path.join(output, `shell-${name}.json`), `${JSON.stringify(results, null, 2)}\n`);
  await page.setViewportSize(original);
}

export async function measureShellNavigation(page, output, destinations) {
  const samples = [];
  let requests = [];
  let bodies = [];
  let documents = 0;
  const requestListener = (request) => {
    if (request.resourceType() === "document") documents++;
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/"))
      requests.push(request.method() + " " + url.pathname + url.search);
  };
  const responseListener = (response) => {
    const script = response.request().resourceType() === "script";
    if (script || response.headers()["content-type"]?.includes("text/x-component"))
      bodies.push(
        response
          .body()
          .then((body) => ({ script, bytes: body.length }))
          .catch(() => ({ script, bytes: 0 })),
      );
  };
  page.on("request", requestListener);
  page.on("response", responseListener);
  const initializations = await page.evaluate(() => window.liffInitializations);
  try {
    for (let cycle = 0; cycle <= 20; cycle++) {
      for (const { label, pathname, heading, ready } of destinations) {
        const marker = `${cycle}:${label}`;
        await page.locator(".app-shell").evaluate((element, marker) => {
          element.dataset.shellEvidence = marker;
        }, marker);
        requests = [];
        bodies = [];
        const started = performance.now();
        await page
          .getByRole("navigation", { name: "主要導覽", exact: true })
          .getByRole("link", { name: label, exact: true })
          .click();
        await page.waitForURL((url) => url.pathname === pathname);
        await page.getByRole("heading", { name: heading, exact: true }).waitFor();
        await ready();
        const readyMs = performance.now() - started;
        const retained = await page
          .locator(".app-shell")
          .evaluate((element, marker) => element.dataset.shellEvidence === marker, marker);
        const resources = await Promise.all(bodies);
        if (cycle)
          samples.push({
            label,
            readyMs,
            retained,
            requests: [...requests],
            scriptBytes: resources.filter((r) => r.script).reduce((sum, r) => sum + r.bytes, 0),
            rscBytes: resources.filter((r) => !r.script).reduce((sum, r) => sum + r.bytes, 0),
          });
      }
    }
    assert.equal(documents, 0, "soft navigation must not reload the document");
    assert.equal(
      await page.evaluate(() => window.liffInitializations),
      initializations,
      "soft navigation must not initialize LIFF again",
    );
    const sorted = samples.map((s) => s.readyMs).sort((a, b) => a - b);
    const result = {
      scope:
        "Real Next production routes; 20 warmed cycles; immediate synthetic APIs; HTTP cache disabled by routing; includes Playwright click/assertion overhead, not LINE latency or Web Vitals",
      documents,
      initializations,
      p50: sorted[Math.ceil(sorted.length * 0.5) - 1],
      p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
      samples,
    };
    if (output)
      writeFileSync(
        path.join(output, "shell-navigation.json"),
        `${JSON.stringify(result, null, 2)}\n`,
      );
    return result;
  } finally {
    page.off("request", requestListener);
    page.off("response", responseListener);
  }
}
