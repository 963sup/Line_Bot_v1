import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const json = (path) => JSON.parse(readFileSync(path, "utf8"));
const projects = new Map();
for (const area of ["apps", "packages"]) {
  for (const entry of readdirSync(resolve(root, area), { withFileTypes: true })) {
    const directory = resolve(root, area, entry.name);
    if (!entry.isDirectory() || !existsSync(resolve(directory, "tsconfig.json"))) continue;
    const manifest = json(resolve(directory, "package.json"));
    projects.set(manifest.name, {
      directory,
      manifest,
      config: json(resolve(directory, "tsconfig.json")),
      library: area === "packages",
    });
  }
}
const references = (config, directory) =>
  (config.references ?? []).map(({ path }) => resolve(directory, path)).sort();

test("solution discovers every current TypeScript project without including placeholders", () => {
  const solution = json(resolve(root, "tsconfig.json"));
  assert.deepEqual(solution.files, []);
  assert.deepEqual(
    references(solution, root),
    [...projects.values()].map(({ directory }) => directory).sort(),
  );
});

test("project references track actual workspace dependencies for cross-package consumers", () => {
  for (const [name, { directory, manifest, config }] of projects) {
    const dependencies = Object.assign(
      {},
      manifest.dependencies,
      manifest.devDependencies,
      manifest.peerDependencies,
      manifest.optionalDependencies,
    );
    const expected = Object.entries(dependencies)
      .filter(
        ([dependency, version]) => version.startsWith("workspace:") && projects.has(dependency),
      )
      .map(([dependency]) => projects.get(dependency).directory)
      .sort();
    assert.deepEqual(references(config, directory), expected, name);
  }
});

test("library source maps and build metadata survive Turbo caching without typecheck writers", () => {
  const buildOutputs = json(resolve(root, "turbo.json")).tasks.build.outputs;
  assert.ok(buildOutputs.includes("dist/**"));
  for (const [name, { directory, manifest, config, library }] of projects) {
    if (!library) continue;
    const options = config.compilerOptions;
    assert.equal(options.composite, true, name);
    assert.equal(options.declarationMap, true, name);
    assert.equal(options.declaration, true, name);
    assert.equal(
      dirname(resolve(directory, options.tsBuildInfoFile)),
      resolve(directory, "dist"),
      name,
    );
    assert.match(
      manifest.scripts.typecheck,
      /--tsBuildInfoFile \.cache\/typecheck\.tsbuildinfo/,
      name,
    );
    const testConfig = resolve(directory, "tsconfig.test.json");
    if (existsSync(testConfig)) {
      const testOptions = json(testConfig).compilerOptions;
      assert.equal(testOptions.noEmit, true, name);
      assert.equal(
        resolve(directory, testOptions.tsBuildInfoFile),
        resolve(directory, ".cache/test.tsbuildinfo"),
        name,
      );
    }
  }
});
