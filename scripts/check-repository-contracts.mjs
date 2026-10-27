import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { checkArchitecture } from "./tooling/repository-contracts.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const started = performance.now();
const errors = [];
const packages = new Map();
const manifests = [resolve(root, "package.json")];
for (const folder of ["apps", "packages"]) {
  for (const entry of readdirSync(resolve(root, folder), { withFileTypes: true })) {
    const path = resolve(root, folder, entry.name, "package.json");
    if (entry.isDirectory() && existsSync(path)) manifests.push(path);
  }
}
for (const path of manifests) {
  const manifest = JSON.parse(readFileSync(path, "utf8"));
  if (packages.has(manifest.name)) errors.push(`Duplicate package name: ${manifest.name}`);
  packages.set(manifest.name, { manifest, path });
}

function checkExports(value, directory, owner) {
  if (typeof value === "string") {
    const target = resolve(directory, value);
    const location = relative(directory, target);
    if (
      !value.startsWith("./") ||
      isAbsolute(location) ||
      location === ".." ||
      location.startsWith(`..${sep}`)
    ) {
      errors.push(`${owner}: export escapes package: ${value}`);
      return;
    }
    // Workspace TypeScript packages publish dist; check the corresponding source before build.
    const source = value.startsWith("./dist/")
      ? value.replace(/^\.\/dist\//, "./src/").replace(/(?:\.d)?\.js$|\.d\.ts$/, ".ts")
      : value;
    const candidates = source.endsWith(".ts")
      ? [source, source.replace(/\.ts$/, ".tsx")]
      : [source];
    if (
      !candidates.some(
        (path) =>
          existsSync(resolve(directory, path)) && statSync(resolve(directory, path)).isFile(),
      )
    )
      errors.push(`${owner}: export source missing: ${value}`);
  } else if (value && typeof value === "object") {
    for (const child of Object.values(value)) checkExports(child, directory, owner);
  }
}

for (const [name, { manifest, path }] of packages) {
  for (const section of [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
  ]) {
    for (const [dependency, version] of Object.entries(manifest[section] ?? {})) {
      if (version.startsWith("workspace:") && !packages.has(dependency))
        errors.push(`${name}: workspace dependency missing: ${dependency}`);
    }
  }
  checkExports(manifest.exports, dirname(path), name);
}

const architecture = checkArchitecture(root, { packages });
errors.push(...architecture.errors);
for (const error of errors) console.error(error);
if (errors.length) {
  console.log(JSON.stringify({ ok: false, packages: packages.size, errors: errors.length }));
  process.exitCode = 1;
} else {
  const result = spawnSync(
    process.execPath,
    [
      "--test",
      "scripts/tooling/documentation-boundary.test.mjs",
      "scripts/tooling/repository-contracts.test.mjs",
    ],
    {
      cwd: root,
      stdio: "inherit",
    },
  );
  process.exitCode = result.status ?? 1;
  console.log(
    JSON.stringify({
      ok: process.exitCode === 0,
      packages: packages.size,
      architecture: architecture.counts,
      filesRead: architecture.filesRead,
      bytesRead: architecture.bytesRead,
      durationMs: Math.round(performance.now() - started),
    }),
  );
}
