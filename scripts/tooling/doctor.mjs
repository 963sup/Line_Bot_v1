import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inspectMcpConfiguration, probeMcp } from "./mcp-doctor.mjs";

export const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));

export function parseEnvKeys(source) {
  return [
    ...new Set(
      String(source ?? "")
        .split(/\r?\n/)
        .map((line) => /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line)?.[1])
        .filter(Boolean),
    ),
  ].sort();
}

export function evaluateDoctor({
  expectedNode,
  actualNode,
  expectedPnpm,
  actualPnpm,
  gitVersion,
  dependencies,
}) {
  const checks = [
    { id: "node", ok: actualNode === expectedNode, expected: expectedNode, actual: actualNode },
    {
      id: "pnpm",
      ok: actualPnpm === expectedPnpm,
      expected: expectedPnpm,
      actual: actualPnpm ?? null,
    },
    {
      id: "git",
      ok: typeof gitVersion === "string" && gitVersion.startsWith("git version "),
      expected: "available",
      actual: gitVersion ?? null,
    },
    ...Object.entries(dependencies).map(([name, available]) => ({
      id: `dependency:${name}`,
      ok: available,
      expected: "installed",
      actual: available ? "installed" : "missing",
    })),
  ];
  return { ok: checks.every((check) => check.ok), checks };
}

function commandVersion(command, args) {
  const result = spawnSync(command, args, { cwd: repositoryRoot, encoding: "utf8" });
  if (result.error || result.status !== 0) return null;
  return result.stdout.trim();
}

function pnpmVersion() {
  if (process.env.npm_execpath) {
    return commandVersion(process.execPath, [process.env.npm_execpath, "--version"]);
  }
  return commandVersion("pnpm", ["--version"]);
}

function dependencyAvailability() {
  const dependencies = {
    "@modelcontextprotocol/sdk": ["@modelcontextprotocol", "sdk"],
    "@biomejs/biome": ["@biomejs", "biome"],
    knip: ["knip"],
    supabase: ["supabase"],
    turbo: ["turbo"],
    typescript: ["typescript"],
    "smol-toml": ["smol-toml"],
  };
  return Object.fromEntries(
    Object.entries(dependencies).map(([name, parts]) => [
      name,
      existsSync(resolve(repositoryRoot, "node_modules", ...parts)),
    ]),
  );
}

export function inspectSourceTool(
  root = repositoryRoot,
  { readVersion = (binary) => commandVersion(binary, ["--version"]) } = {},
) {
  const manifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  const expected = manifest.devDependencies?.["@ast-grep/cli"] ?? null;
  let actual = null;
  let executableVersion = null;
  try {
    const packageRoot = resolve(root, "node_modules/@ast-grep/cli");
    const installed = JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8"));
    actual = installed.version ?? null;
    const binary = typeof installed.bin === "string" ? installed.bin : installed.bin?.sg;
    if (binary && existsSync(resolve(packageRoot, binary)))
      executableVersion = readVersion(resolve(packageRoot, binary));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return {
    id: "ast-grep",
    ok:
      /^\d+\.\d+\.\d+$/.test(expected ?? "") &&
      actual === expected &&
      executableVersion === `ast-grep ${expected}`,
    expected,
    actual,
    executableVersion,
  };
}

export function parseDoctorArgs(args) {
  let live = false;
  let port;
  for (let index = 0; index < args.length; index++) {
    if (args[index] === "--mcp" && !live) live = true;
    else if (args[index] === "--next-port" && port === undefined) {
      const value = args[++index];
      if (!/^\d+$/.test(value ?? ""))
        throw new Error("--next-port requires an integer from 1 to 65535.");
      port = Number(value);
      if (port < 1 || port > 65535)
        throw new Error("--next-port requires an integer from 1 to 65535.");
    } else throw new Error("Usage: pnpm tooling:doctor [--mcp [--next-port <port>]]");
  }
  if (port !== undefined && !live) throw new Error("--next-port requires --mcp.");
  return { live, port };
}

export async function main() {
  try {
    const options = parseDoctorArgs(process.argv.slice(2));
    const manifest = JSON.parse(readFileSync(resolve(repositoryRoot, "package.json"), "utf8"));
    const expectedNode = readFileSync(resolve(repositoryRoot, ".node-version"), "utf8").trim();
    const expectedPnpm = String(manifest.packageManager ?? "").replace(/^pnpm@/, "");
    const report = evaluateDoctor({
      expectedNode,
      actualNode: process.versions.node,
      expectedPnpm,
      actualPnpm: pnpmVersion(),
      gitVersion: commandVersion("git", ["--version"]),
      dependencies: dependencyAvailability(),
    });
    const envKeys = parseEnvKeys(readFileSync(resolve(repositoryRoot, ".env.example"), "utf8"));
    const configuration = inspectMcpConfiguration(repositoryRoot);
    const sourceTool = inspectSourceTool();
    const live = options.live ? await probeMcp(repositoryRoot, options) : { status: "not-run" };
    const ok = report.ok && configuration.ok && sourceTool.ok && live.ok !== false;
    console.log(
      JSON.stringify(
        {
          ...report,
          ok,
          mcp: { configuration, live },
          sourceTool,
          environment: {
            declared: envKeys.length,
            present: envKeys.filter((key) => Boolean(process.env[key])).length,
            missingNames: envKeys.filter((key) => !process.env[key]),
            note: "Missing declared variables are informational; provider-specific commands own their required secrets.",
          },
        },
        null,
        2,
      ),
    );
    if (!ok) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (import.meta.main) await main();
