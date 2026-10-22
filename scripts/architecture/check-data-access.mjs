import { glob, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { validateRuntimeDataAccess } from "./data-access-core.mjs";

const repository = fileURLToPath(new URL("../../", import.meta.url));

function runtimeExportTargets(target) {
  if (target === null) return [];
  if (typeof target === "string") return [target];
  if (Array.isArray(target)) return target.flatMap(runtimeExportTargets);
  if (target && typeof target === "object")
    return Object.entries(target)
      .filter(([condition]) => condition !== "types" && !condition.startsWith("types@"))
      .flatMap(([, value]) => runtimeExportTargets(value));
  throw new Error("unsupported package export target");
}

export async function checkDataAccess(root = repository) {
  const readJson = async (path) => JSON.parse(await readFile(resolve(root, path), "utf8"));
  const [semanticModel, topology, dataTopology] = await Promise.all([
    readJson("architecture/semantic-model.json"),
    readJson("architecture/implementation-topology.json"),
    readJson("architecture/data-topology.json"),
  ]);
  const sources = {};
  const workspaces = [
    ...Object.values(topology.modules),
    ...Object.values(topology.applications ?? {}),
  ];
  const patterns = parseYaml(
    await readFile(resolve(root, "pnpm-workspace.yaml"), "utf8"),
  )?.packages;
  if (
    !Array.isArray(patterns) ||
    !patterns.length ||
    patterns.some((pattern) => typeof pattern !== "string" || !pattern)
  ) {
    throw new Error("Data access configuration: pnpm workspace package patterns are required");
  }
  const registered = new Set(workspaces.map((workspace) => workspace.path.replaceAll("\\", "/")));
  const inventoryErrors = [];
  const included = patterns
    .filter((pattern) => !pattern.startsWith("!"))
    .map((pattern) => `${pattern}/package.json`);
  const excluded = patterns
    .filter((pattern) => pattern.startsWith("!"))
    .map((pattern) => `${pattern.slice(1)}/package.json`);
  if (!included.length)
    throw new Error("Data access configuration: no included workspace patterns");
  for await (const rawPath of glob(included, { cwd: root, exclude: excluded })) {
    const workspace = rawPath.replaceAll("\\", "/").replace(/\/package\.json$/, "");
    if (!registered.has(workspace))
      inventoryErrors.push(`Data access configuration: ${workspace} is an unregistered workspace`);
  }
  const sqlPortStems = [];
  const publicStems = new Set();
  let testingOnlySourceCount = 0;
  for (const workspace of workspaces) {
    const manifest = await readJson(`${workspace.path}/package.json`);
    const runtimeExports = new Set();
    const testingExports = new Set();
    const exports = manifest.exports ?? {};
    const subpaths =
      exports &&
      typeof exports === "object" &&
      Object.keys(exports).some((key) => key.startsWith("."))
        ? Object.entries(exports)
        : [[".", exports]];
    for (const [key, target] of subpaths) {
      let targets;
      try {
        targets = runtimeExportTargets(target);
      } catch (error) {
        inventoryErrors.push(
          `Data access configuration: ${workspace.path} ${key}: ${error.message}`,
        );
        continue;
      }
      for (const compiled of targets) {
        if (
          key.includes("*") ||
          !/^\.\/dist\/.+\.[cm]?js$/.test(compiled) ||
          compiled.includes("*")
        ) {
          inventoryErrors.push(
            `Data access configuration: ${workspace.path} ${key} has unsupported runtime export ${compiled}`,
          );
          continue;
        }
        const stem = `${workspace.path}/src/${compiled.slice("./dist/".length)}`.replace(
          /\.[cm]?js$/,
          "",
        );
        if (
          workspace.semanticOwner === "platform" &&
          workspace.moduleKind === "support-module" &&
          key === "./postgres"
        )
          sqlPortStems.push(stem);
        const testOnly =
          (key === "./testing" || key.startsWith("./testing/")) &&
          (compiled === "./dist/testing.js" || compiled.startsWith("./dist/testing/"));
        const entries = testOnly ? testingExports : runtimeExports;
        entries.add(stem);
      }
    }
    for (const stem of runtimeExports) publicStems.add(stem);
    for await (const rawPath of glob(`${workspace.path}/src/**/*.{ts,tsx,js,jsx,mjs,cjs,mts,cts}`, {
      cwd: root,
    })) {
      const path = rawPath.replaceAll("\\", "/");
      const stem = path.replace(/\.[cm]?[jt]sx?$/, "");
      // Exact test-only public entries are not runtime. A folder name never excludes a source.
      if (testingExports.has(stem) && !runtimeExports.has(stem)) {
        testingOnlySourceCount += 1;
        continue;
      }
      sources[path] = await readFile(resolve(root, path), "utf8");
    }
  }
  const sqlTransportContracts = Object.keys(sources)
    .filter((path) => sqlPortStems.includes(path.replace(/\.[cm]?[jt]sx?$/, "")))
    .map((path) => ({ path, exportName: "createSql" }));
  const publicEntryPoints = Object.keys(sources).filter((path) =>
    publicStems.has(path.replace(/\.[cm]?[jt]sx?$/, "")),
  );
  for (const path of publicEntryPoints) publicStems.delete(path.replace(/\.[cm]?[jt]sx?$/, ""));
  for (const stem of publicStems)
    inventoryErrors.push(
      `Data access configuration: runtime export ${stem} has no analyzed source`,
    );
  const result = validateRuntimeDataAccess(semanticModel, topology, dataTopology, sources, {
    sqlTransportContracts,
    publicEntryPoints,
  });
  return {
    ...result,
    errors: [...result.errors, ...inventoryErrors],
    analysisFailureCount: result.analysisFailureCount + inventoryErrors.length,
    workspaceCount: workspaces.length,
    testingOnlySourceCount,
  };
}

if (import.meta.main) {
  const result = await checkDataAccess();
  for (const error of result.errors) console.error(error);
  console.log(
    `Runtime data access: ${result.workspaceCount} workspaces / ${result.sourceCount} source files / ${result.queryCount} queries, ${result.violationCount} violations, ${result.analysisFailureCount} analysis failures, ${result.forwardedCount} neutral forwards, ${result.testingOnlySourceCount} declared test-only entries.`,
  );
  if (result.errors.length) process.exitCode = 1;
}
