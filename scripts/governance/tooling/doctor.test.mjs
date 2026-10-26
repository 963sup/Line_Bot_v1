import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  dependencyAvailability,
  evaluateDoctor,
  inspectSourceTool,
  parseDoctorArgs,
  parseEnvKeys,
} from "./doctor.mjs";
import { inspectMcpConfiguration, probeMcp, verifyNextProject } from "./mcp-doctor.mjs";

test("parseEnvKeys returns canonical variable names without values", () => {
  assert.deepEqual(parseEnvKeys("# comment\nFOO=\n BAR = value\nFOO=again\ninvalid-line"), [
    "BAR",
    "FOO",
  ]);
});

test("source tool diagnosis requires an installed exact manifest version", (t) => {
  const root = mkdtempSync(join(tmpdir(), "source-tool-doctor-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const manifest = join(root, "package.json");
  writeFileSync(manifest, JSON.stringify({ devDependencies: { "@ast-grep/cli": "0.51.0" } }));
  assert.equal(inspectSourceTool(root).ok, false);
  const installed = join(root, "node_modules/@ast-grep/cli");
  mkdirSync(installed, { recursive: true });
  writeFileSync(join(installed, "package.json"), JSON.stringify({ version: "0.50.0" }));
  assert.equal(inspectSourceTool(root).ok, false);
  writeFileSync(join(installed, "package.json"), JSON.stringify({ version: "0.51.0" }));
  assert.equal(inspectSourceTool(root).ok, false);
  writeFileSync(join(installed, "sg"), "fixture");
  writeFileSync(
    join(installed, "package.json"),
    JSON.stringify({ version: "0.51.0", bin: { sg: "sg" } }),
  );
  assert.equal(inspectSourceTool(root, { readVersion: () => null }).ok, false);
  assert.equal(inspectSourceTool(root, { readVersion: () => "ast-grep 0.50.0" }).ok, false);
  assert.deepEqual(inspectSourceTool(root, { readVersion: () => "ast-grep 0.51.0" }), {
    id: "ast-grep",
    ok: true,
    expected: "0.51.0",
    actual: "0.51.0",
    executableVersion: "ast-grep 0.51.0",
  });
  writeFileSync(manifest, JSON.stringify({ devDependencies: { "@ast-grep/cli": "^0.51.0" } }));
  assert.equal(inspectSourceTool(root, { readVersion: () => "ast-grep 0.51.0" }).ok, false);
});

test("evaluateDoctor succeeds only when required local toolchain matches", () => {
  assert.equal(
    evaluateDoctor({
      expectedNode: "24.19.0",
      actualNode: "24.19.0",
      expectedPnpm: "11.25.0",
      actualPnpm: "11.25.0",
      gitVersion: "git version 2.50.0",
      dependencies: { turbo: true, "ts-morph": true, typescript: true },
    }).ok,
    true,
  );

  const failed = evaluateDoctor({
    expectedNode: "24.19.0",
    actualNode: "24.18.0",
    expectedPnpm: "11.25.0",
    actualPnpm: null,
    gitVersion: null,
    dependencies: { turbo: false, "ts-morph": false },
  });
  assert.equal(failed.ok, false);
  assert.deepEqual(
    failed.checks.filter((check) => !check.ok).map((check) => check.id),
    ["node", "pnpm", "git", "dependency:turbo", "dependency:ts-morph"],
  );
});

test("dependency availability requires the exact installed source facts parser", (t) => {
  const root = mkdtempSync(join(tmpdir(), "dependency-doctor-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ devDependencies: { "ts-morph": "27.0.2" } }),
  );
  assert.equal(dependencyAvailability(root)["ts-morph"], false);

  mkdirSync(join(root, "node_modules/ts-morph"), { recursive: true });
  assert.equal(dependencyAvailability(root)["ts-morph"], false);

  writeFileSync(join(root, "node_modules/ts-morph/package.json"), "{invalid");
  assert.equal(dependencyAvailability(root)["ts-morph"], false);

  writeFileSync(
    join(root, "node_modules/ts-morph/package.json"),
    JSON.stringify({ version: "28.0.0" }),
  );
  assert.equal(dependencyAvailability(root)["ts-morph"], false);

  writeFileSync(
    join(root, "node_modules/ts-morph/package.json"),
    JSON.stringify({ version: "27.0.2" }),
  );
  assert.equal(dependencyAvailability(root)["ts-morph"], true);

  mkdirSync(join(root, "node_modules/turbo"), { recursive: true });
  assert.equal(dependencyAvailability(root).turbo, true);
});

test("live MCP and runtime probes require explicit, valid local options", () => {
  assert.deepEqual(parseDoctorArgs([]), { live: false, port: undefined });
  assert.deepEqual(parseDoctorArgs(["--mcp"]), { live: true, port: undefined });
  assert.deepEqual(parseDoctorArgs(["--mcp", "--next-port", "3001"]), { live: true, port: 3001 });
  for (const args of [
    ["--next-port", "3000"],
    ["--mcp", "--next-port"],
    ["--mcp", "--next-port", "0"],
    ["--mcp", "--next-port", "65536"],
    ["--mcp", "--next-port", "3000junk"],
    ["--mcp", "--next-port", "http://example.com"],
    ["--mcp", "--mcp"],
    ["--unknown"],
  ]) {
    assert.throws(() => parseDoctorArgs(args));
  }
});

function mcpFixture(t) {
  const root = mkdtempSync(join(tmpdir(), "mcp-doctor-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  function write(path, content) {
    const target = join(root, path);
    mkdirSync(join(target, ".."), { recursive: true });
    writeFileSync(target, typeof content === "string" ? content : JSON.stringify(content));
  }
  const config = `[mcp_servers.next-devtools]\ncommand = "pnpm"\nargs = ["exec", "next-devtools-mcp"]\n[mcp_servers.next-devtools.env]\nNEXT_DEVTOOLS_HOST = "127.0.0.1"\n[mcp_servers.shadcn]\ncommand = "pnpm"\nargs = ["--dir", "apps/web", "exec", "shadcn", "mcp"]\n[mcp_servers.serena]\ncommand = "/opt/codex/runtimes/codex-primary-runtime/dependencies/python/bin/uvx"\nargs = ["--from", "serena-agent", "serena", "start-mcp-server", "--project-from-cwd", "--context=codex", "--open-web-dashboard=false"]\nstartup_timeout_sec = 120\ndefault_tools_approval_mode = "approve"\n[mcp_servers.serena.env]\nUV_CACHE_DIR = "/tmp/codex-uv-cache"\nUV_TOOL_DIR = "/tmp/codex-uv-tools"\nSERENA_HOME = "/tmp/codex-serena"\n`;
  write(".codex/config.toml", config);
  write("package.json", { devDependencies: { "next-devtools-mcp": "0.4.0" } });
  write("node_modules/next-devtools-mcp/package.json", { version: "0.4.0" });
  write("apps/web/package.json", { devDependencies: { shadcn: "4.22.1" } });
  write("apps/web/node_modules/shadcn/package.json", { version: "4.22.1" });
  return { root, write, config };
}

test("MCP configuration requires local locked executables in their owning workspace", async (t) => {
  const { root, write, config } = mcpFixture(t);
  assert.equal(inspectMcpConfiguration(root).ok, true);
  const invalid = [
    config.replace('["exec", "next-devtools-mcp"]', '["dlx", "next-devtools-mcp@latest"]'),
    config.replace('command = "/opt/codex/runtimes/codex-primary-runtime/dependencies/python/bin/uvx"', 'command = "other-serena"'),
    config.replace("startup_timeout_sec = 120", "startup_timeout_sec = 30"),
    config.replace('["--dir", "apps/web", "exec", "shadcn", "mcp"]', '["exec", "shadcn", "mcp"]'),
    config.replace("[mcp_servers.shadcn]", "[mcp_servers.shadcn]\nenabled = false"),
    config.replace("[mcp_servers.shadcn]", '[mcp_servers.shadcn]\ncwd = "/another-checkout"'),
    "[mcp_servers",
  ];
  for (const source of invalid) {
    write(".codex/config.toml", source);
    assert.equal(inspectMcpConfiguration(root).ok, false);
    const probe = await probeMcp(root);
    assert.equal(probe.ok, false);
    assert.equal(probe.status, "not-run");
  }
  write(".codex/config.toml", config);
  write("node_modules/next-devtools-mcp/package.json", { version: "0.3.0" });
  assert.equal(inspectMcpConfiguration(root).ok, false);
  rmSync(join(root, "node_modules/next-devtools-mcp/package.json"));
  assert.equal(inspectMcpConfiguration(root).ok, false);
  write("node_modules/next-devtools-mcp/package.json", { version: "0.4.0" });
  assert.equal(inspectMcpConfiguration(root).ok, true);
  write("apps/web/package.json", { devDependencies: { shadcn: "^4.22.1" } });
  assert.equal(inspectMcpConfiguration(root).ok, false);
  write("apps/web/package.json", { devDependencies: { shadcn: "4.22.1" } });
  write("apps/web/node_modules/shadcn/package.json", { version: "4.22.0" });
  assert.equal(inspectMcpConfiguration(root).ok, false);
  write("apps/web/node_modules/shadcn/package.json", { version: "4.22.1" });
  assert.equal(inspectMcpConfiguration(root).ok, true);
});

function toolResult(value) {
  return { content: [{ type: "text", text: JSON.stringify(value) }] };
}

test("runtime evidence rejects another checkout, port, remote URL and tool-level errors", (t) => {
  const { root, write } = mcpFixture(t);
  write("other-web/package.json", {});
  const result = (metadata, changes = {}) =>
    toolResult({ success: true, port: 3001, result: toolResult(metadata), ...changes });
  const metadata = { projectPath: join(root, "apps/web"), devServerUrl: "http://127.0.0.1:3001" };
  assert.equal(verifyNextProject(result(metadata), root, 3001).port, 3001);
  for (const invalid of [
    result({ ...metadata, projectPath: join(root, "other-web") }),
    result({ ...metadata, devServerUrl: "http://127.0.0.1:3002" }),
    result({ ...metadata, devServerUrl: "https://example.com:3001" }),
    result({ ...metadata, devServerUrl: "ftp://127.0.0.1:3001" }),
    result(metadata, { success: false }),
    result(metadata, { port: 3002 }),
    result(metadata, { result: { isError: true, content: [] } }),
    result({ error: "metadata unavailable" }),
    { isError: true, content: [] },
    { content: [{ type: "text", text: "not JSON" }] },
  ])
    assert.throws(() => verifyNextProject(invalid, root, 3001));
  assert.throws(
    () =>
      verifyNextProject(result({ ...metadata, projectPath: join(root, "other-web") }), root, 3001),
    /project-mismatch/,
  );
  assert.throws(
    () =>
      verifyNextProject(result({ ...metadata, devServerUrl: "http://127.0.0.1:3002" }), root, 3001),
    /port-mismatch/,
  );
});
