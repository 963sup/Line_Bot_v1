import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
    "@biomejs/biome": ["@biomejs", "biome"],
    knip: ["knip"],
    supabase: ["supabase"],
    turbo: ["turbo"],
    typescript: ["typescript"],
  };
  return Object.fromEntries(
    Object.entries(dependencies).map(([name, parts]) => [
      name,
      existsSync(resolve(repositoryRoot, "node_modules", ...parts)),
    ]),
  );
}

try {
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
  console.log(
    JSON.stringify(
      {
        ...report,
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
  if (!report.ok) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
