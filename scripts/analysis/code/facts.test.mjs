import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { execute } from "./cli.mjs";
import { codeFacts } from "./facts.mjs";

const cliFile = fileURLToPath(new URL("./cli.mjs", import.meta.url));

function write(root, path, contents) {
  const file = join(root, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, contents);
}

function git(root, ...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" });
}

function fixture(run) {
  mkdirSync(join(process.cwd(), ".artifacts"), { recursive: true });
  const root = mkdtempSync(join(process.cwd(), ".artifacts", "code-facts-"));
  try {
    git(root, "init", "--quiet");
    git(root, "config", "user.email", "fixture@example.invalid");
    git(root, "config", "user.name", "Fixture");
    git(root, "config", "core.autocrlf", "false");
    return run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function commit(root) {
  git(root, "add", ".");
  git(root, "commit", "--quiet", "-m", "fixture");
}

function configuredFixture(root) {
  write(root, ".gitignore", "node_modules/\n");
  write(
    root,
    "package.json",
    JSON.stringify({
      name: "fixture-root",
      exports: { ".": { types: "./types.d.ts", import: "./index.js", default: "./fallback.js" } },
    }),
  );
  write(
    root,
    "tsconfig.base.json",
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "Bundler",
        allowJs: true,
        jsx: "preserve",
        baseUrl: ".",
        paths: { "@lib/*": ["src/lib/*"], "@local": ["packages/local/src/index.ts"] },
      },
    }),
  );
  write(
    root,
    "tsconfig.json",
    JSON.stringify({ extends: "./tsconfig.base.json", include: ["src/**/*"] }),
  );
  write(
    root,
    "tsconfig.test.json",
    JSON.stringify({ extends: "./tsconfig.json", include: ["src/**/*", "test/**/*"] }),
  );
  write(
    root,
    "node_modules/fixture-pkg/package.json",
    JSON.stringify({
      name: "fixture-pkg",
      exports: { ".": { types: "./index.d.ts", import: "./index.js", default: "./fallback.js" } },
    }),
  );
  write(
    root,
    "node_modules/fixture-pkg/index.d.ts",
    "export declare const packageValue: number;\n",
  );
  write(
    root,
    "src/dep.ts",
    "export interface Shape { value: number }\nexport const value = 1;\nexport default function main() {}\n",
  );
  write(root, "src/star.ts", "export const star = 1;\n");
  write(root, "src/lib/alias.ts", "export const aliasValue = 1;\n");
  write(root, "src/component.tsx", "export const Component = () => <div>ok</div>;\n");
  write(root, "src/helper.js", "export const helper = 1;\n");
  write(
    root,
    "src/module.mts",
    "const café = 1; const 𐐀 = 2; const after = 3;\r\nexport { café, 𐐀, after };\r\n",
  );
  write(root, "src/common.cts", "export const common = 1;\n");
  write(root, "src/excluded/skip.ts", "export const skipped = true;\n");
  write(
    root,
    "packages/local/package.json",
    JSON.stringify({
      name: "local-package",
      exports: { ".": { types: "./src/index.ts", default: "./src/index.ts" } },
    }),
  );
  write(root, "packages/local/src/index.ts", "export const workspaceValue = 1;\n");
  write(
    root,
    "test/consumer.ts",
    'import main, { type Shape as LocalShape, value as localValue } from "../src/dep";\r\nimport type { Shape as AttributeShape } from "../src/dep" with { "resolution-mode": "import" };\r\nimport * as fs from "node:fs";\r\nimport { aliasValue } from "@lib/alias";\r\nimport { workspaceValue } from "@local";\r\nimport "fixture-pkg";\r\nexport { value as publicValue, type Shape } from "../src/dep";\r\nexport * from "../src/star";\r\nexport * as everything from "../src/star";\r\nconst { nested: { item }, plain } = source;\r\nconst secret: "TOP_SECRET_TYPE" = "TOP_SECRET_VALUE";\r\nexport function overloaded(value: string): string;\r\nexport function overloaded(value: string) { return value; }\r\nexport default class {}\r\nconst internal = 1; export { internal as visible };\r\nvoid main; void fs; void aliasValue; void localValue; void workspaceValue; type Used = LocalShape | AttributeShape;\r\nimport("../src/lazy");\r\nrequire("../src/legacy");\r\n',
  );
}

test("facts report deterministic syntax, declarations, resolution, and explicit boundaries", () =>
  fixture((root) => {
    configuredFixture(root);
    for (const path of ["package.json", "tsconfig.base.json"])
      write(
        root,
        path,
        Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), readFileSync(join(root, path))]),
      );
    write(root, ".github/tracked.ts", "export const tracked = 1;\n");
    commit(root);
    write(root, ".github/untracked.ts", "export const untracked = 1;\n");

    const args = ["facts", "--scope", ".", "--exclude", "src/excluded"];
    const first = execute(args, { root });
    const second = execute(args, { root });
    assert.deepEqual(second, first);
    assert.equal(first.operation, "facts");
    assert.deepEqual(first.versions, {
      tsMorph: "27.0.2",
      parserTypeScript: "5.9.2",
      resolverTypeScript: "5.9.3",
    });
    assert.equal(first.provenance.workingTree, "dirty");
    assert.equal(
      first.files.some((file) => file.path === ".github/untracked.ts"),
      true,
    );
    assert.equal(
      first.files.some((file) => file.path === "src/excluded/skip.ts"),
      false,
    );
    const consumer = first.files.find((file) => file.path === "test/consumer.ts");
    assert.equal(consumer.config.path, "tsconfig.test.json");
    assert.deepEqual(
      consumer.config.inputs.map((input) => input.path),
      ["tsconfig.base.json", "tsconfig.json", "tsconfig.test.json"],
    );
    assert.deepEqual(consumer.imports[0].bindings, [
      { kind: "default", imported: "default", local: "main", typeOnly: false },
      { kind: "named", imported: "Shape", local: "LocalShape", typeOnly: true },
      { kind: "named", imported: "value", local: "localValue", typeOnly: false },
    ]);
    assert.deepEqual(consumer.exports[0].bindings, [
      { local: "internal", exported: "visible", typeOnly: false },
    ]);
    assert.deepEqual(
      consumer.reexports.map((entry) => entry.kind),
      ["named", "star", "namespace"],
    );
    assert.equal(consumer.declarations.filter((entry) => entry.name === "overloaded").length, 2);
    assert.deepEqual(
      consumer.declarations
        .filter((entry) => ["item", "plain"].includes(entry.name))
        .map((entry) => entry.name),
      ["item", "plain"],
    );
    assert.equal(
      consumer.declarations.some(
        (entry) => entry.kind === "class" && entry.anonymousDefault === true,
      ),
      true,
    );
    const output = JSON.stringify(first);
    assert.equal(output.includes("TOP_SECRET_VALUE"), false);
    assert.equal(output.includes("TOP_SECRET_TYPE"), false);
    assert.equal(output.includes("inferredLiteralType"), false);
    assert.equal(output.includes("declaredType"), false);
    assert.equal(
      consumer.moduleReferences.some(
        (entry) => entry.specifier === "@lib/alias" && entry.resolution.category === "local",
      ),
      true,
    );
    assert.equal(
      consumer.moduleReferences.some(
        (entry) =>
          entry.specifier === "node:fs" && entry.resolution.category === "external/builtin",
      ),
      true,
    );
    const workspaceReference = consumer.moduleReferences.find(
      (entry) => entry.specifier === "@local",
    );
    assert.equal(workspaceReference.resolution.category, "cross-project");
    assert.equal(workspaceReference.resolution.packageManifest, "packages/local/package.json");
    assert.deepEqual(
      first.consultedManifests.find((manifest) => manifest.name === "fixture-pkg").exports,
      { ".": { types: "./index.d.ts", import: "./index.js", default: "./fallback.js" } },
    );
    assert.deepEqual(
      Object.keys(
        first.consultedManifests.find((manifest) => manifest.name === "fixture-pkg").exports["."],
      ),
      ["types", "import", "default"],
    );
    assert.equal(
      first.coverage.issues.some((issue) => issue.kind === "unsupported-dynamic-import"),
      true,
    );
    assert.equal(
      first.coverage.issues.some((issue) => issue.kind === "unsupported-require"),
      true,
    );
    assert.equal(
      first.coverage.issues.some((issue) => issue.kind === "unsupported-resolution-mode"),
      true,
    );
    const moduleFile = first.files.find((file) => file.path === "src/module.mts");
    assert.deepEqual(
      { language: moduleFile.language, scriptKind: moduleFile.scriptKind },
      { language: "TypeScript", scriptKind: "MTS" },
    );
    assert.deepEqual(moduleFile.declarations[0].location.start, { line: 1, column: 7 });
    assert.deepEqual(
      moduleFile.declarations.find((entry) => entry.name === "after").location.start,
      { line: 1, column: 37 },
    );
    assert.deepEqual(moduleFile.exports[0].location.start, { line: 2, column: 1 });
    assert.equal(first.files.find((file) => file.path === "src/common.cts").scriptKind, "CTS");
    assert.deepEqual(
      readFileSync(join(root, "test/consumer.ts"), "utf8").includes("TOP_SECRET_VALUE"),
      true,
    );
    assert.equal(existsSync(join(root, ".artifacts")), false);
  }));

test("facts without a containing config remain syntax-only and partial", () =>
  fixture((root) => {
    write(
      root,
      "scripts/task.mjs",
      'import value from "./missing.mjs";\nexport const result = value;\n',
    );
    commit(root);
    const result = execute(["facts", "--scope", "scripts"], { root });
    const file = result.files[0];
    assert.deepEqual(file.config, {
      status: "not-found",
      resolution: "not-attempted-no-config",
    });
    assert.equal(file.moduleReferences[0].resolution.status, "not-attempted-no-config");
    assert.equal(result.coverage.partial, true);
  }));

test("facts distinguish explicit declaration modifiers from later export syntax", () =>
  fixture((root) => {
    write(
      root,
      "entry.ts",
      "declare function externalCall(): void;\nfunction aliasedDefault() {}\nconst localOnly = 1;\nusing resource = acquire();\nawait using asyncResource = acquireAsync();\nexport { localOnly as publicValue };\nexport default aliasedDefault;\n",
    );
    commit(root);
    const file = execute(["facts", "--scope", "entry.ts"], { root }).files[0];
    const ambient = file.declarations.find((entry) => entry.name === "externalCall");
    assert.equal(ambient.declare, true);
    assert.equal(ambient.signatureOnly, true);
    assert.equal(ambient.hasBody, false);
    const aliased = file.declarations.find((entry) => entry.name === "aliasedDefault");
    assert.equal(aliased.exported, false);
    assert.equal(aliased.default, false);
    assert.equal(aliased.signatureOnly, false);
    assert.equal(file.declarations.find((entry) => entry.name === "localOnly").exported, false);
    assert.equal(
      file.declarations.find((entry) => entry.name === "resource").declarationKind,
      "using",
    );
    assert.equal(
      file.declarations.find((entry) => entry.name === "asyncResource").declarationKind,
      "await using",
    );
    assert.deepEqual(file.exports[0].bindings, [
      { local: "localOnly", exported: "publicValue", typeOnly: false },
    ]);
    assert.equal(
      file.declarations.some((entry) => entry.kind === "default-expression"),
      true,
    );
  }));

test("facts categorize out-of-scope and unresolved static references", () =>
  fixture((root) => {
    write(
      root,
      "tsconfig.json",
      JSON.stringify({
        compilerOptions: { module: "ESNext", moduleResolution: "Bundler" },
        include: ["src/**/*.ts"],
      }),
    );
    write(
      root,
      "src/consumer/main.ts",
      'import { value } from "../target";\nimport missing from "./missing";\nvoid value; void missing;\n',
    );
    write(root, "src/target.ts", "export const value = 1;\n");
    commit(root);
    const result = execute(["facts", "--scope", "src/consumer"], { root });
    const references = result.files[0].moduleReferences;
    assert.equal(references[0].resolution.category, "out-of-scope");
    assert.equal(references[0].resolution.sha256.length, 64);
    assert.equal(references[1].resolution.status, "unresolved");
  }));

test("facts report unsupported module syntax and resolution modes as partial", () =>
  fixture((root) => {
    write(
      root,
      "tsconfig.json",
      JSON.stringify({
        compilerOptions: { module: "ESNext", moduleResolution: "Bundler" },
        include: ["src/**/*.ts"],
      }),
    );
    write(
      root,
      "src/main.ts",
      'import type { Marker } from "./target" with { "resolution-mode": "require" };\nimport legacy = require("./target");\ntype Lazy = import("./target", { with: { "resolution-mode": "import" } }).Marker;\n',
    );
    write(root, "src/target.ts", "export interface Marker {}\n");
    write(
      root,
      "node/tsconfig.json",
      JSON.stringify({
        compilerOptions: { module: "NodeNext", moduleResolution: "NodeNext" },
        include: ["*.ts"],
      }),
    );
    write(root, "node/main.ts", 'import type { Marker } from "../src/target.js";\n');
    commit(root);
    const result = execute(["facts", "--scope", "src/main.ts", "--scope", "node/main.ts"], {
      root,
    });
    assert.equal(result.coverage.partial, true);
    const source = result.files.find((file) => file.path === "src/main.ts");
    assert.equal(source.moduleReferences[0].resolution.status, "unsupported-import-attributes");
    for (const kind of ["import-type", "import-equals"])
      assert.equal(
        source.moduleReferences.some(
          (reference) =>
            reference.kind === kind &&
            reference.supported === false &&
            reference.specifier === "./target",
        ),
        true,
      );
    const node = result.files.find((file) => file.path === "node/main.ts");
    assert.equal(node.config.path, "node/tsconfig.json");
    assert.equal(node.moduleReferences[0].resolution.status, "unsupported-node-resolution-mode");
  }));

test("facts fail closed on source, config, manifest, target, inventory, and negative-probe drift", () => {
  const scenarios = [
    ["working-tree", (root) => write(root, "unrelated.md", "changed outside scope\n")],
    [
      "source",
      (root) =>
        write(
          root,
          "src/main.ts",
          'import { value } from "./target";\nexport const changed = value;\n',
        ),
    ],
    [
      "config",
      (root) => write(root, "tsconfig.json", JSON.stringify({ include: ["src/main.ts"] })),
    ],
    [
      "config-raw-bytes",
      (root) => {
        const original = readFileSync(join(root, "tsconfig.json"));
        write(root, "tsconfig.json", Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), original]));
      },
    ],
    ["manifest", (root) => write(root, "package.json", JSON.stringify({ name: "changed" }))],
    ["target", (root) => write(root, "src/target.ts", "export const value = 2;\n")],
    ["inventory", (root) => write(root, "src/new.ts", "export const added = 1;\n")],
    [
      "inventory-unicode",
      (root) => {
        rmSync(join(root, "src/café.md"));
        write(root, "src/cafe\u0301.md", "excluded source document\n");
      },
    ],
    [
      "negative-probe",
      (root) =>
        write(
          root,
          "tsconfig.test.json",
          JSON.stringify({ extends: "./tsconfig.json", include: ["src/**/*.ts"] }),
        ),
    ],
  ];
  for (const [name, mutate] of scenarios)
    fixture((root) => {
      write(root, ".gitignore", "node_modules/\n");
      write(root, "package.json", JSON.stringify({ name: "drift" }));
      write(
        root,
        "tsconfig.json",
        JSON.stringify({
          compilerOptions: { module: "ESNext", moduleResolution: "Bundler" },
          include: ["src/**/*.ts"],
        }),
      );
      write(
        root,
        "src/main.ts",
        'import { value } from "./target";\nimport "late-package";\nexport const result = value;\n',
      );
      write(root, "src/target.ts", "export const value = 1;\n");
      write(root, "unrelated.md", "before collection\n");
      commit(root);
      if (name !== "working-tree") write(root, "unrelated.md", "already dirty\n");
      if (name === "inventory-unicode") write(root, "src/café.md", "excluded source document\n");
      assert.throws(
        () =>
          codeFacts(root, {
            scopes: ["src"],
            beforeVerify: () => mutate(root),
          }),
        /changed during facts collection/,
        name,
      );
    });
});

test("facts reject a non-UTF-8 nearest package manifest", () =>
  fixture((root) => {
    write(root, "nested/package.json", Buffer.from([0xff, 0xfe, 0xfd]));
    write(root, "nested/source.ts", "export const value = 1;\n");
    commit(root);
    assert.throws(
      () => execute(["facts", "--scope", "nested/source.ts"], { root }),
      /Metadata input must be UTF-8: nested\/package\.json/,
    );
  }));

test("facts expose invalid UTF-8 and source symlink exclusions without following them", (t) =>
  fixture((root) => {
    write(root, "src/valid.ts", "export const valid = 1;\n");
    write(root, "src/invalid.ts", Buffer.from([0xff, 0xfe, 0xfd]));
    commit(root);
    try {
      symlinkSync(join(root, "src/valid.ts"), join(root, "src/linked.ts"), "file");
    } catch (error) {
      if (error?.code === "EPERM") t.diagnostic("Windows denied symlink creation (EPERM)");
      else throw error;
    }
    const result = execute(["facts", "--scope", "src"], { root });
    assert.equal(
      result.coverage.skipped.some(
        (entry) => entry.path === "src/invalid.ts" && entry.reason === "non-utf8",
      ),
      true,
    );
    if (existsSync(join(root, "src/linked.ts")))
      assert.equal(
        result.coverage.skipped.some(
          (entry) => entry.path === "src/linked.ts" && entry.reason === "symlink",
        ),
        true,
      );
  }));

test("facts allow inside-root node_modules links, block outside links, and detect retargeting", (t) =>
  fixture((root) => {
    const outside = mkdtempSync(join(process.cwd(), ".artifacts", "facts-outside-dependency-"));
    try {
      write(root, ".gitignore", "node_modules/\n");
      write(
        root,
        "tsconfig.json",
        JSON.stringify({
          compilerOptions: { module: "ESNext", moduleResolution: "Bundler" },
          include: ["src/**/*.ts"],
        }),
      );
      write(
        root,
        "src/main.ts",
        'import "workspace-link";\nimport "external-link";\nimport "outside-link";\nimport "switch-link";\n',
      );
      write(
        root,
        "packages/workspace/package.json",
        JSON.stringify({ name: "workspace-link", exports: { ".": { types: "./index.d.ts" } } }),
      );
      write(root, "packages/workspace/index.d.ts", "export declare const workspace: number;\n");
      for (const name of ["external-link", "switch-a", "switch-b"]) {
        const packageRoot = `node_modules/.pnpm/${name}/node_modules/${name}`;
        const publishedName = name.startsWith("switch-") ? "switch-target" : name;
        write(
          root,
          `${packageRoot}/package.json`,
          JSON.stringify({ name: publishedName, exports: { ".": { types: "./index.d.ts" } } }),
        );
        write(
          root,
          `${packageRoot}/index.d.ts`,
          `export declare const ${publishedName.replaceAll("-", "_")}: number;\n`,
        );
      }
      write(
        outside,
        "package.json",
        JSON.stringify({ name: "outside-link", secret: "MUST_NOT_BE_READ", types: "index.d.ts" }),
      );
      write(outside, "index.d.ts", "export declare const outside: number;\n");
      mkdirSync(join(root, "node_modules"), { recursive: true });
      try {
        symlinkSync(
          join(root, "packages/workspace"),
          join(root, "node_modules/workspace-link"),
          "junction",
        );
        symlinkSync(
          join(root, "node_modules/.pnpm/external-link/node_modules/external-link"),
          join(root, "node_modules/external-link"),
          "junction",
        );
        symlinkSync(outside, join(root, "node_modules/outside-link"), "junction");
        symlinkSync(
          join(root, "node_modules/.pnpm/switch-a/node_modules/switch-a"),
          join(root, "node_modules/switch-link"),
          "junction",
        );
      } catch (error) {
        if (error?.code === "EPERM") {
          t.diagnostic("Windows denied dependency junction creation (EPERM)");
          return;
        }
        throw error;
      }
      commit(root);

      const result = execute(["facts", "--scope", "src"], { root });
      const references = result.files[0].moduleReferences;
      assert.equal(
        references.find((entry) => entry.specifier === "workspace-link").resolution.status,
        "resolved",
      );
      assert.equal(
        references.find((entry) => entry.specifier === "external-link").resolution.status,
        "resolved",
      );
      assert.equal(
        references.find((entry) => entry.specifier === "outside-link").resolution.status,
        "unresolved",
      );
      assert.equal(JSON.stringify(result).includes("MUST_NOT_BE_READ"), false);
      assert.equal(
        result.coverage.issues.some((issue) => issue.kind === "outside-root-metadata-blocked"),
        true,
      );

      assert.throws(
        () =>
          codeFacts(root, {
            scopes: ["src"],
            beforeVerify: () => {
              rmSync(join(root, "node_modules/switch-link"), { recursive: true, force: true });
              symlinkSync(
                join(root, "node_modules/.pnpm/switch-b/node_modules/switch-b"),
                join(root, "node_modules/switch-link"),
                "junction",
              );
            },
          }),
        /probe changed during facts collection/,
      );
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  }));

test("facts CLI rejects write and unknown options", () =>
  fixture((root) => {
    write(root, "src/main.ts", "export const value = 1;\n");
    commit(root);
    const processResult = spawnSync(process.execPath, [cliFile, "facts", "--scope", "src"], {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
    });
    assert.equal(processResult.status, 0, processResult.stderr);
    assert.equal(processResult.stderr, "");
    assert.equal(JSON.parse(processResult.stdout).operation, "facts");
    assert.throws(
      () => execute(["facts", "--scope", "src", "--out", ".artifacts/facts.json"], { root }),
      /Unknown option: --out/,
    );
    assert.throws(() => execute(["facts"], { root }), /--scope is required/);
  }));
