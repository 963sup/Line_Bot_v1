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
  }).filter((dependency) => dependency.startsWith("@line-work/"));
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

export async function checkImplementationTopology() {
  const errors = [];
  if (topology.version !== 2 || topology.role !== "implementation-topology") {
    errors.push(
      "architecture/implementation-topology.json must be version 2 implementation-topology",
    );
  }
  const modules = topology.modules ?? {};
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
    for (const [key, target] of Object.entries(packageJson.exports ?? {})) {
      if (key.includes("*")) errors.push(name + ": wildcard export is forbidden: " + key);
      const compiled = typeof target === "string" ? target : target.default;
      if (typeof compiled !== "string" || !compiled.startsWith("./dist/")) {
        errors.push(name + ": export does not target dist: " + key);
      }
    }
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

  return { errors, packageCount: Object.keys(modules).length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await checkImplementationTopology();
  for (const error of result.errors) console.error(error);
  console.log(
    "Implementation topology: " +
      result.packageCount +
      " modules, " +
      result.errors.length +
      " violations.",
  );
  if (result.errors.length) process.exitCode = 1;
}
