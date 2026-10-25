import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);

const servers = [
  {
    name: "next-devtools",
    workspace: ".",
    dependency: "next-devtools-mcp",
    args: ["exec", "next-devtools-mcp"],
  },
  {
    name: "shadcn",
    workspace: "apps/web",
    dependency: "shadcn",
    args: ["--dir", "apps/web", "exec", "shadcn", "mcp"],
  },
  {
    name: "serena",
    command: "serena",
    args: ["start-mcp-server", "--project-from-cwd", "--context=codex"],
    requiredTools: [
      "find_declaration",
      "find_implementations",
      "find_referencing_symbols",
      "find_symbol",
      "get_symbols_overview",
    ],
  },
];
const timeout = 15_000;
const runtimeFailures = new Set([
  "tool-error",
  "runtime-unavailable",
  "runtime-call-failed",
  "missing-project-identity",
  "project-mismatch",
  "non-loopback-runtime",
  "port-mismatch",
]);

function projectConfig(root) {
  const { parse } = require("smol-toml");
  return parse(readFileSync(resolve(root, ".codex/config.toml"), "utf8"));
}

function jsonFile(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function inspectMcpConfiguration(root, configuration) {
  try {
    const config = configuration ?? projectConfig(root);
    const checks = servers.map(({ name, workspace, dependency, args, command }) => {
      const server = config.mcp_servers?.[name];
      if (name === "serena") {
        return {
          id: name,
          ok:
            server?.enabled !== false &&
            server?.command === command &&
            server.cwd === undefined &&
            JSON.stringify(server.args) === JSON.stringify(args) &&
            server.startup_timeout_sec === 15 &&
            server.default_tools_approval_mode === "approve",
          command,
          args,
        };
      }
      const workspaceRoot = resolve(root, workspace);
      const version = jsonFile(resolve(workspaceRoot, "package.json")).devDependencies?.[
        dependency
      ];
      let installed = null;
      try {
        const require = createRequire(resolve(workspaceRoot, "package.json"));
        const manifestPath =
          name === "next-devtools"
            ? require.resolve("next-devtools-mcp/package.json")
            : resolve(workspaceRoot, "node_modules", dependency, "package.json");
        installed = jsonFile(manifestPath).version;
      } catch {
        // Missing installation is a configuration failure, never permission to download it.
      }
      return {
        id: name,
        ok:
          server?.enabled !== false &&
          server?.command === "pnpm" &&
          server.cwd === undefined &&
          JSON.stringify(server.args) === JSON.stringify(args) &&
          (name !== "next-devtools" || server.env?.NEXT_DEVTOOLS_HOST === "127.0.0.1") &&
          typeof version === "string" &&
          version === installed,
        workspace,
        dependency,
        declaredVersion: version ?? null,
        installedVersion: installed,
      };
    });
    return { ok: checks.every((check) => check.ok), evidence: "configuration", checks };
  } catch {
    return {
      ok: false,
      evidence: "configuration",
      checks: [],
      error: "Cannot read project MCP configuration or manifests.",
    };
  }
}

function toolJson(result) {
  if (result?.isError) throw new Error("tool-error");
  const text = result?.content?.find((item) => item.type === "text")?.text;
  if (typeof text !== "string") throw new Error("Missing tool JSON.");
  return JSON.parse(text);
}

export function verifyNextProject(result, root, port) {
  const envelope = toolJson(result);
  if (envelope.success !== true || envelope.port !== port) throw new Error("runtime-call-failed");
  const metadata = toolJson(envelope.result);
  if (typeof metadata.projectPath !== "string" || typeof metadata.devServerUrl !== "string") {
    throw new Error("missing-project-identity");
  }
  const actual = realpathSync(metadata.projectPath);
  const expected = realpathSync(resolve(root, "apps/web"));
  const same =
    process.platform === "win32"
      ? actual.toLowerCase() === expected.toLowerCase()
      : actual === expected;
  const url = new URL(metadata.devServerUrl);
  const actualPort = Number(url.port || (url.protocol === "https:" ? "443" : "80"));
  if (!same) throw new Error("project-mismatch");
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  )
    throw new Error("non-loopback-runtime");
  if (actualPort !== port) throw new Error("port-mismatch");
  return { projectPath: actual, port };
}

async function probeNext(client, root, port) {
  const index = toolJson(
    await client.callTool({ name: "nextjs_index", arguments: { port } }, undefined, { timeout }),
  );
  const server = index.servers?.find((entry) => entry.port === port);
  if (
    index.success !== true ||
    !server?.tools?.some((tool) => tool.name === "get_project_metadata")
  ) {
    throw new Error("runtime-unavailable");
  }
  const result = await client.callTool(
    { name: "nextjs_call", arguments: { port, toolName: "get_project_metadata" } },
    undefined,
    { timeout },
  );
  return {
    status: "verified",
    evidence: "runtime-project-identity",
    ...verifyNextProject(result, root, port),
    tools: server.tools.map((tool) => tool.name),
  };
}

export async function probeMcp(root, { port } = {}) {
  let config;
  try {
    config = projectConfig(root);
  } catch {
    return {
      ok: false,
      evidence: "initialize/tools-list",
      status: "not-run",
      error: "Cannot read project MCP configuration.",
    };
  }
  const inspection = inspectMcpConfiguration(root, config);
  if (!inspection.ok)
    return {
      ok: false,
      evidence: "initialize/tools-list",
      status: "not-run",
      error: "Repair MCP configuration and install locked dependencies first.",
    };
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { StdioClientTransport } = await import("@modelcontextprotocol/sdk/client/stdio.js");
  const results = [];
  for (const { name, requiredTools } of servers) {
    const server = config.mcp_servers[name];
    const serverTimeout = name === "serena" ? 30_000 : timeout;
    const client = new Client({ name: "repository-mcp-doctor", version: "1.0.0" });
    const transport = new StdioClientTransport({
      command: server.command,
      args: server.args,
      cwd: root,
      stderr: "ignore",
      env:
        name === "next-devtools"
          ? { NEXT_DEVTOOLS_HOST: server.env?.NEXT_DEVTOOLS_HOST, NEXT_TELEMETRY_DISABLED: "1" }
          : undefined,
    });
    const result = { name, status: "failed", evidence: "initialize/tools-list" };
    try {
      await client.connect(transport, { timeout: serverTimeout });
      const listed = await client.listTools({}, { timeout: serverTimeout });
      if (!listed.tools.length || listed.nextCursor) throw new Error("Incomplete tool discovery.");
      result.tools = listed.tools.map((tool) => tool.name);
      if (
        requiredTools?.some((tool) => !result.tools.includes(tool)) ||
        (requiredTools && !requiredTools.every((tool) => result.tools.includes(tool)))
      )
        throw new Error("Unexpected Serena tool set.");
      result.status = "connected";
      if (name === "serena") result.evidence = "initialize/tools-list";
      if (name === "next-devtools" && port !== undefined) {
        try {
          result.runtime = await probeNext(client, root, port);
        } catch (error) {
          result.runtime = {
            status: "failed",
            evidence: "runtime-project-identity",
            port,
            error:
              error instanceof Error && runtimeFailures.has(error.message)
                ? error.message
                : "runtime-probe-failed",
          };
        }
      }
    } catch {
      result.status = "failed";
      result.error = "MCP initialize or complete tools/list failed within the diagnostic timeout.";
    } finally {
      await client.close();
    }
    results.push(result);
  }
  return {
    ok: results.every(
      (result) => result.status === "connected" && result.runtime?.status !== "failed",
    ),
    evidence: "initialize/tools-list",
    servers: results,
    browser: "not-run",
    sessionReload: "not-verified",
  };
}
