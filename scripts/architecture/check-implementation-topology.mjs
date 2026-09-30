import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = process.cwd();
const topology = JSON.parse(
  await readFile(path.join(root, "architecture/implementation-topology.json"), "utf8"),
);

async function exists(target) {
  try {
    await access(path.join(root, target));
    return true;
  } catch {
    return false;
  }
}

function workspaceDependencies(packageJson) {
  return Object.keys({
    ...(packageJson.dependencies ?? {}),
    ...(packageJson.peerDependencies ?? {}),
    ...(packageJson.devDependencies ?? {}),
  }).filter((dependency) => dependency.startsWith("@line_bot_v1/"));
}

function checkAllowedDependencies(errors, owner, dependencies, allowedWorkspaceDependencies = []) {
  const allowed = new Set(allowedWorkspaceDependencies);
  for (const dependency of dependencies) {
    if (!allowed.has(dependency))
      errors.push(owner + ": undeclared workspace dependency " + dependency);
  }
  for (const dependency of allowed) {
    if (!dependencies.includes(dependency)) {
      errors.push(owner + ": stale allowed workspace dependency " + dependency);
    }
  }
}

export function validatePackageExports(name, exportsMap = {}) {
  const errors = [];
  for (const [key, target] of Object.entries(exportsMap)) {
    if (key.includes("*")) errors.push(name + ": wildcard export is forbidden: " + key);
    const compiled = typeof target === "string" ? target : target.default;
    if (typeof compiled !== "string" || !compiled.startsWith("./dist/")) {
      errors.push(name + ": export does not target dist: " + key);
      continue;
    }
    if (/^\.\/dist\/adapters(?:\.js|\/)/.test(compiled)) {
      errors.push(name + ": private adapter must not be package export: " + key);
    }
  }
  return errors;
}

export function validateTargetModules(topology) {
  const errors = [];
  const modules = topology.modules ?? {};
  const applications = topology.applications ?? {};
  const targetModules = topology.targetModules ?? {};
  const currentNames = new Set([...Object.keys(modules), ...Object.keys(applications)]);
  const targetDependencies = new Set([...Object.keys(modules), ...Object.keys(targetModules)]);
  const paths = new Map();

  for (const [name, entry] of [...Object.entries(modules), ...Object.entries(applications)]) {
    if (paths.has(entry.path)) {
      errors.push(name + ": path collides with " + paths.get(entry.path) + ": " + entry.path);
    } else {
      paths.set(entry.path, name);
    }
  }

  for (const [name, entry] of Object.entries(targetModules)) {
    if (currentNames.has(name)) errors.push(name + ": target name collides with current workspace");
    if (!entry.semanticOwner) errors.push(name + ": target semanticOwner is required");
    if (entry.moduleKind === "bounded-context") {
      errors.push(name + ": target moduleKind must not claim Bounded Context identity");
    }
    if (typeof entry.path !== "string" || !/^packages\/[^/]+$/.test(entry.path)) {
      errors.push(name + ": target path must be a direct packages/<name> path");
    } else if (paths.has(entry.path)) {
      errors.push(
        name + ": target path collides with " + paths.get(entry.path) + ": " + entry.path,
      );
    } else {
      paths.set(entry.path, name);
    }
    if (!Array.isArray(entry.fptFiles) || entry.fptFiles.length === 0) {
      errors.push(name + ": target fptFiles must be non-empty");
    } else if (new Set(entry.fptFiles).size !== entry.fptFiles.length) {
      errors.push(name + ": target fptFiles must be unique");
    }
    if (!Array.isArray(entry.fptRoots) || entry.fptRoots.length === 0) {
      errors.push(name + ": target fptRoots must be non-empty");
    } else {
      const rootKeys = new Set();
      for (const root of entry.fptRoots) {
        if (
          !root ||
          typeof root !== "object" ||
          typeof root.file !== "string" ||
          typeof root.symbol !== "string" ||
          Object.keys(root).some((key) => !["file", "symbol"].includes(key))
        ) {
          errors.push(name + ": target fptRoot must contain only file and symbol");
          continue;
        }
        const key = root.file + "#" + root.symbol;
        if (rootKeys.has(key)) errors.push(name + ": duplicate target fptRoot " + key);
        rootKeys.add(key);
        if (!(entry.fptFiles ?? []).includes(root.file)) {
          errors.push(name + ": target fptRoot file is not declared in fptFiles: " + root.file);
        }
      }
    }
    if (!Array.isArray(entry.dependsOn)) {
      errors.push(name + ": target dependsOn must be an array");
      continue;
    }
    if (new Set(entry.dependsOn).size !== entry.dependsOn.length) {
      errors.push(name + ": target dependsOn must be unique");
    }
    for (const dependency of entry.dependsOn) {
      if (dependency === name) errors.push(name + ": target module must not depend on itself");
      else if (!targetDependencies.has(dependency)) {
        errors.push(name + ": unknown target dependency " + dependency);
      }
    }
  }

  const visited = new Set();
  const visiting = new Set();
  const stack = [];
  const reportedCycles = new Set();

  function visit(name) {
    if (visited.has(name)) return;
    if (visiting.has(name)) {
      const start = stack.indexOf(name);
      const cycle = [...stack.slice(start), name];
      const key = cycle.join(" -> ");
      if (!reportedCycles.has(key)) {
        errors.push("target dependency cycle: " + key);
        reportedCycles.add(key);
      }
      return;
    }
    visiting.add(name);
    stack.push(name);
    for (const dependency of targetModules[name]?.dependsOn ?? []) {
      if (targetModules[dependency]) visit(dependency);
    }
    stack.pop();
    visiting.delete(name);
    visited.add(name);
  }

  for (const name of Object.keys(targetModules)) visit(name);

  return errors;
}

export async function checkImplementationTopology() {
  const errors = [];
  if (topology.version !== 3 || topology.role !== "implementation-topology") {
    errors.push(
      "architecture/implementation-topology.json must be version 3 implementation-topology",
    );
  }
  errors.push(...validateTargetModules(topology));
  const modules = topology.modules ?? {};
  const targetModules = topology.targetModules ?? {};
  const registered = new Set(Object.values(modules).map((entry) => entry.path));
  if (!(await exists("packages/AGENTS.md"))) errors.push("packages/AGENTS.md missing");

  for (const [name, entry] of Object.entries(modules)) {
    if (!(await exists(entry.path + "/package.json"))) {
      errors.push(name + ": package missing");
      continue;
    }
    const packageJson = JSON.parse(
      await readFile(path.join(root, entry.path, "package.json"), "utf8"),
    );
    if (packageJson.name !== name)
      errors.push(entry.path + ": package name differs from implementation topology");
    if (!entry.semanticOwner) errors.push(name + ": semanticOwner is required");
    if (entry.moduleKind === "bounded-context") {
      errors.push(name + ": moduleKind must not claim Bounded Context identity");
    }
    checkAllowedDependencies(
      errors,
      name,
      workspaceDependencies(packageJson),
      entry.allowedWorkspaceDependencies,
    );
    errors.push(...validatePackageExports(name, packageJson.exports));
  }

  const packageDirectories = [];
  for (const entry of await readdir(path.join(root, "packages"), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const directory = "packages/" + entry.name;
    if (await exists(directory + "/package.json")) packageDirectories.push(directory);
  }
  for (const directory of packageDirectories) {
    if (!registered.has(directory)) errors.push(directory + ": unregistered workspace package");
  }

  for (const [name, entry] of Object.entries(targetModules)) {
    if (await exists(entry.path + "/package.json")) {
      errors.push(
        name +
          ": selected-target must not be an executable workspace; promote it to modules before creating package.json",
      );
    }
  }

  for (const [name, entry] of Object.entries(topology.applications ?? {})) {
    if (!(await exists(entry.path + "/package.json"))) {
      errors.push(name + ": app package missing");
      continue;
    }
    const packageJson = JSON.parse(
      await readFile(path.join(root, entry.path, "package.json"), "utf8"),
    );
    if (packageJson.name !== name) errors.push(entry.path + ": app name differs from manifest");
    checkAllowedDependencies(
      errors,
      name,
      workspaceDependencies(packageJson),
      entry.allowedWorkspaceDependencies,
    );
  }

  return {
    errors,
    packageCount: Object.keys(modules).length,
    targetPackageCount: Object.keys(targetModules).length,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await checkImplementationTopology();
  for (const error of result.errors) console.error(error);
  console.log(
    "Implementation topology: " +
      result.packageCount +
      " current modules, " +
      result.targetPackageCount +
      " selected target modules, " +
      result.errors.length +
      " violations.",
  );
  if (result.errors.length) process.exitCode = 1;
}
