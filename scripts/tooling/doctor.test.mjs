import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { evaluateDoctor, parseDoctorArgs, parseEnvKeys } from "./doctor.mjs";
import { inspectMcpConfiguration, probeMcp, verifyNextProject } from "./mcp-doctor.mjs";

test("parseEnvKeys returns canonical variable names without values", () => {
  assert.deepEqual(parseEnvKeys("# comment\nFOO=\n BAR = value\nFOO=again\ninvalid-line"), [
    "BAR",
    "FOO",
  ]);
});

test("evaluateDoctor succeeds only when required local toolchain matches", () => {
  assert.equal(
    evaluateDoctor({
      expectedNode: "24.19.0",
      actualNode: "24.19.0",
      expectedPnpm: "11.25.0",
      actualPnpm: "11.25.0",
      gitVersion: "git version 2.50.0",
      dependencies: { turbo: true, typescript: true },
    }).ok,
    true,
  );

  const failed = evaluateDoctor({
    expectedNode: "24.19.0",
    actualNode: "24.18.0",
    expectedPnpm: "11.25.0",
    actualPnpm: null,
    gitVersion: null,
    dependencies: { turbo: false },
  });
  assert.equal(failed.ok, false);
  assert.deepEqual(
    failed.checks.filter((check) => !check.ok).map((check) => check.id),
    ["node", "pnpm", "git", "dependency:turbo"],
  );
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
  const config = `[mcp_servers.next-devtools]\ncommand = "pnpm"\nargs = ["exec", "next-devtools-mcp"]\n[mcp_servers.next-devtools.env]\nNEXT_DEVTOOLS_HOST = "127.0.0.1"\n[mcp_servers.shadcn]\ncommand = "pnpm"\nargs = ["--dir", "apps/web", "exec", "shadcn", "mcp"]\n`;
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
