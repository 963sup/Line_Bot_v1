import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { appendFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const web = path.join(root, "apps/web");
const require = createRequire(path.join(web, "package.json"));
const next = require.resolve("next/dist/bin/next");
const manifest = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
if (process.versions.node !== manifest.engines.node) {
  throw new Error(`Expected Node ${manifest.engines.node}; got ${process.versions.node}.`);
}
// Next reads env files from its working directory. Never load repository secrets.
if (readdirSync(web).some((name) => name === ".env" || name.startsWith(".env."))) {
  throw new Error("Remove apps/web env files before running the isolated browser test.");
}
const port = 4117;
const base = `http://127.0.0.1:${port}`;
const output = path.join(
  root,
  ".artifacts/browser",
  new Date().toISOString().replace(/[:.]/g, "-"),
);
mkdirSync(output, { recursive: true });
const env = {};
for (const [key, value] of Object.entries(process.env)) {
  if (
    /^(path|systemroot|windir|comspec|temp|tmp|userprofile|home|localappdata|appdata)$/i.test(key)
  ) {
    env[key] = value;
  }
}
Object.assign(env, {
  NODE_ENV: "production",
  NEXT_TELEMETRY_DISABLED: "1",
  NEXT_PUBLIC_SUPABASE_URL: "https://local-auth.example.test",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "synthetic-browser-test-key",
  NAVIGATION_BASE: base,
  NAVIGATION_ARTIFACT_DIR: output,
});
for (const key of ["PLAYWRIGHT_PACKAGE_PATH", "NAVIGATION_BROWSER_CHANNEL"]) {
  if (process.env[key]) env[key] = process.env[key];
}
const report = {
  startedAt: new Date().toISOString(),
  commit: spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).stdout?.trim(),
  workingTree: spawnSync("git", ["status", "--short"], {
    cwd: root,
    encoding: "utf8",
  }).stdout?.trim(),
  node: process.version,
  base,
  scope:
    "Real Next.js production build and browser; synthetic LIFF/API; no database or mobile LINE.",
  status: "failed",
};
let server;
let serverExit;
let active;
function launch(args, cwd, logfile) {
  const child = spawn(process.execPath, args, { cwd, env, windowsHide: true });
  for (const stream of [child.stdout, child.stderr]) {
    stream.on("data", (chunk) => {
      appendFileSync(path.join(output, logfile), chunk);
      process.stdout.write(chunk);
    });
  }
  return child;
}
async function command(args, cwd, logfile) {
  active = launch(args, cwd, logfile);
  const [code] = await once(active, "exit");
  active = undefined;
  if (code !== 0) throw new Error(`${logfile} failed with exit code ${code}.`);
}
function stop() {
  active?.kill();
  server?.kill();
}
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
try {
  const probe = createServer();
  probe.listen(port, "127.0.0.1");
  await once(probe, "listening");
  await new Promise((resolve, reject) =>
    probe.close((error) => (error ? reject(error) : resolve())),
  );
  console.log(`Artifacts: ${output}\nBuilding isolated local Web…`);
  await command([next, "build"], web, "build.log");
  report.build = "passed";
  server = launch(
    [next, "start", "--hostname", "127.0.0.1", "--port", String(port)],
    web,
    "server.log",
  );
  serverExit = once(server, "exit");
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (server.exitCode !== null) throw new Error("Local server exited before readiness.");
    try {
      const response = await fetch(base, { signal: AbortSignal.timeout(1000) });
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      // Readiness polling only; test assertions use Playwright's observable state.
    }
    await delay(500);
  }
  if (!ready) throw new Error("Local Web did not become ready.");
  await command([path.join(root, "scripts/browser/check-navigation.mjs")], root, "browser.log");
  await command(
    [path.join(root, "scripts/browser/check-repository-resources.mjs")],
    root,
    "repository-resources.log",
  );
  await command([path.join(root, "scripts/browser/check-membership.mjs")], root, "membership.log");
  await command([path.join(root, "scripts/browser/check-auto-clock.mjs")], root, "auto-clock.log");
  await command([path.join(root, "scripts/browser/check-workplaces.mjs")], root, "workplaces.log");
  await command(
    [path.join(root, "scripts/browser/check-partner-management.mjs")],
    root,
    "partner-management.log",
  );
  await command(
    [path.join(root, "scripts/browser/check-member-management.mjs")],
    root,
    "member-management.log",
  );
  await command(
    [path.join(root, "scripts/browser/check-permissions.mjs")],
    root,
    "permissions.log",
  );
  report.status = "passed";
} catch (error) {
  report.error = error.message;
  console.error(error);
  process.exitCode = 1;
} finally {
  stop();
  if (serverExit) await serverExit;
  report.finishedAt = new Date().toISOString();
  writeFileSync(path.join(output, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Browser test ${report.status}: ${output}`);
}
