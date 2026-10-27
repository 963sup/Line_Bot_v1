import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { checkArchitecture, readModuleContracts } from "./repository-contracts.mjs";

const repository = fileURLToPath(new URL("../../", import.meta.url));
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "architecture-contracts-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (name, value) => {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), JSON.stringify({ schemaVersion: 1, ...value }));
  };
  write("architecture/registry.json", {
    domain: {
      vocabulary: "architecture/domain/vocabulary.json",
      owners: { sample: "architecture/domain/owners/sample.json" },
    },
    modules: {
      configuration: "architecture/modules/configuration.json",
      entries: { "@test/sample": "architecture/modules/sample.json" },
    },
    data: {
      configuration: "architecture/data/configuration.json",
      shared: "architecture/data/shared.json",
      owners: {},
    },
  });
  write("architecture/domain/vocabulary.json", { invariants: [{ id: "K1" }] });
  write("architecture/domain/owners/sample.json", {
    owner: { id: "sample" },
    concepts: [{ id: "sample", owner: "sample" }],
    capabilities: [{ id: "read-sample", owner: "sample", preserves: ["K1"] }],
  });
  write("architecture/modules/configuration.json", {});
  write("architecture/modules/sample.json", {
    id: "@test/sample",
    status: "target",
    semanticOwner: "sample",
    primaryOwnerImplementation: true,
    path: "packages/sample",
    dependsOn: [],
  });
  write("architecture/data/configuration.json", { schemaRoot: "schemas" });
  write("architecture/data/shared.json", { files: [], relations: [] });
  fs.mkdirSync(path.join(root, "schemas"));
  return { root, write };
}
test("current repository model is coherent", () => {
  const result = checkArchitecture(repository);
  assert.deepEqual(result.errors, []);
  assert(result.counts.owners > 0);
  assert.equal(readModuleContracts(repository).size, result.counts.modules);
});
test("target modules need no current manifest and module reader needs no domain files", (t) => {
  const { root } = fixture(t);
  assert.deepEqual(checkArchitecture(root, { packages: new Map() }).errors, []);
  fs.rmSync(path.join(root, "architecture/domain"), { recursive: true });
  assert.equal(readModuleContracts(root).get("@test/sample").status, "target");
});
test("reports concrete broken references", (t) => {
  const { root, write } = fixture(t);
  write("architecture/domain/owners/sample.json", {
    owner: { id: "sample" },
    capabilities: [{ id: "read-sample", owner: "sample", consumes: ["missing-relationship"] }],
  });
  assert(
    checkArchitecture(root).errors.some((x) =>
      x.includes("read-sample consumes: unknown reference missing-relationship"),
    ),
  );
});
test("reports missing registered fragments and unregistered JSON", (t) => {
  const { root, write } = fixture(t);
  fs.unlinkSync(path.join(root, "architecture/modules/sample.json"));
  write("architecture/data/forgotten.json", {});
  const { errors } = checkArchitecture(root);
  assert(errors.some((x) => x.includes("architecture/modules/sample.json: ENOENT")));
  assert(
    errors.some((x) =>
      x.includes("Unregistered architecture JSON: architecture/data/forgotten.json"),
    ),
  );
});
test("rejects traversal, duplicate registration and schema/id mismatch", (t) => {
  const { root, write } = fixture(t);
  write("architecture/modules/sample.json", { schemaVersion: 2, id: "wrong", status: "target" });
  let errors = checkArchitecture(root).errors;
  assert(errors.some((x) => x.includes("schemaVersion must be 1")));
  assert(errors.some((x) => x.includes("module id must be @test/sample")));
  const registryPath = path.join(root, "architecture/registry.json");
  const registry = JSON.parse(fs.readFileSync(registryPath));
  registry.modules.entries.second = registry.modules.entries["@test/sample"];
  registry.data.shared = "../escape.json";
  write("architecture/registry.json", registry);
  errors = checkArchitecture(root).errors;
  assert(errors.some((x) => x.includes("Duplicate registration")));
  assert(errors.some((x) => x.includes("Unsafe architecture path")));
});
test("checks current manifest path and workspace dependencies", (t) => {
  const { root, write } = fixture(t);
  write("architecture/modules/sample.json", {
    id: "@test/sample",
    status: "current",
    path: "packages/sample",
    semanticOwner: "sample",
    allowedWorkspaceDependencies: [],
  });
  const packages = new Map([
    [
      "@test/sample",
      {
        path: path.join(root, "wrong/package.json"),
        manifest: { dependencies: { "@test/unknown": "workspace:*" } },
      },
    ],
  ]);
  const { errors } = checkArchitecture(root, { packages });
  assert(errors.some((x) => x.includes("manifest path wrong/package.json")));
  assert(errors.some((x) => x.includes("undeclared workspace dependency @test/unknown")));
});
test("rejects retired root authorities", (t) => {
  const { root, write } = fixture(t);
  for (const name of ["semantic-model", "implementation-topology", "data-topology"])
    write(`architecture/${name}.json`, {});
  assert.equal(
    checkArchitecture(root).errors.filter((x) =>
      x.includes("Retired architecture authority restored"),
    ).length,
    3,
  );
});
test("malformed roots, registry sections and fragment arrays return diagnostics", (t) => {
  const { root, write } = fixture(t);
  write("architecture/domain/owners/sample.json", {
    owner: { id: "sample" },
    concepts: {},
    capabilities: [null],
  });
  let errors = checkArchitecture(root).errors;
  assert(errors.some((x) => x.includes("concepts: expected array")));
  assert(errors.some((x) => x.includes("null array entry")));
  fs.writeFileSync(path.join(root, "architecture/registry.json"), "null");
  errors = checkArchitecture(root).errors;
  assert(errors.some((x) => x.includes("JSON root must be an object")));
  assert(errors.some((x) => x.includes("registry.modules: required object")));
  write("architecture/registry.json", {
    domain: [],
    modules: { entries: [] },
    data: { owners: null },
  });
  assert.doesNotThrow(() => checkArchitecture(root));
  assert(checkArchitecture(root).errors.some((x) => x.includes("required map")));
});
test("locators belong to the shard owning their concept", (t) => {
  const { root, write } = fixture(t);
  const registry = JSON.parse(fs.readFileSync(path.join(root, "architecture/registry.json")));
  registry.domain.owners.other = "architecture/domain/owners/other.json";
  write("architecture/registry.json", registry);
  write("architecture/domain/owners/other.json", {
    owner: { id: "other" },
    locators: [{ id: "sample-login", concept: "sample" }],
  });
  assert(
    checkArchitecture(root).errors.some((x) =>
      x.includes("locator sample-login: concept owner sample differs from shard other"),
    ),
  );
});
test("context ids are unique across shared contexts and owner shards", (t) => {
  const { root, write } = fixture(t);
  write("architecture/domain/vocabulary.json", {
    sharedBoundedContexts: [
      { id: "shared", owners: ["sample"] },
      { id: "shared", owners: ["sample"] },
      { id: "local", owners: ["sample"] },
    ],
  });
  write("architecture/domain/owners/sample.json", {
    owner: { id: "sample" },
    boundedContexts: [{ id: "local", owner: "sample" }],
  });
  const { errors } = checkArchitecture(root);
  assert(errors.some((x) => x.includes("Duplicate bounded context id: shared")));
  assert(errors.some((x) => x.includes("Duplicate bounded context id: local")));
});
test("current dependencies cannot use target modules and target manifests are drift", (t) => {
  const { root, write } = fixture(t);
  const registry = JSON.parse(fs.readFileSync(path.join(root, "architecture/registry.json")));
  registry.modules.entries["@test/host"] = "architecture/modules/host.json";
  write("architecture/registry.json", registry);
  write("architecture/modules/host.json", {
    id: "@test/host",
    status: "application",
    path: "apps/host",
    allowedWorkspaceDependencies: ["@test/sample"],
  });
  const packages = new Map([
    ["@test/sample", { path: path.join(root, "packages/sample/package.json"), manifest: {} }],
  ]);
  const { errors } = checkArchitecture(root, { packages });
  assert(errors.some((x) => x.includes("current dependency @test/sample is target-only")));
  assert(errors.some((x) => x.includes("target-only module has an actual workspace manifest")));
});
