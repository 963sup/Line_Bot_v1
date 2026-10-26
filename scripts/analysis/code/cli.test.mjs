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
import { runPatch } from "../../changes/patch-apply.mjs";
import { execute } from "./cli.mjs";
import { applyByteReplacements, rename as renameSymbol, structuralRewrite } from "./core.mjs";

const cliFile = fileURLToPath(new URL("./cli.mjs", import.meta.url));

function write(root, path, contents) {
  const file = join(root, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, contents, "utf8");
}

function git(root, ...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" });
}

function fixture(run) {
  mkdirSync(join(process.cwd(), ".artifacts"), { recursive: true });
  const root = mkdtempSync(join(process.cwd(), ".artifacts", "code-tool-"));
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

const rewriteRule = `id: replace-console
language: TypeScript
rule:
  pattern: console.log($A)
fix: logger.info($A)
severity: error
`;

const tsxRule = `id: replace-old-button
language: Tsx
rule:
  pattern: <OldButton />
fix: <NewButton />
severity: error
`;

const jsxRule = `id: replace-old-button-jsx
"language": JavaScript
rule:
  pattern: <OldButton />
fix: <NewButton />
severity: error
`;

test("--help is a successful read-only CLI operation", () => {
  const result = spawnSync(process.execPath, [cliFile, "--help"], {
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /pnpm code search/);
  assert.equal(result.stderr, "");
});

test("real ast-grep search and rewrite produce a preflighted full-file patch", () =>
  fixture((root) => {
    const prefix = 'const café = "☕"; ';
    const before = `${prefix}console.log(café);\r\n`;
    write(root, "src/example.ts", before);
    write(root, "rules/console.yml", rewriteRule);
    write(root, ".github/hidden.ts", "console.log('hidden');\n");
    write(root, ".env.ts", "console.log('secret');\n");
    write(root, "dist/output.ts", "console.log('generated');\n");
    commit(root);

    const search = execute(
      ["search", "--rule", "rules/console.yml", "--scope", ".", "--exclude", "dist"],
      { root },
    );
    assert.equal(search.hits.length, 2);
    assert.equal(search.source.dirty, false);
    assert.deepEqual(search.hits.map((hit) => hit.path).sort(), [
      ".github/hidden.ts",
      "src/example.ts",
    ]);
    assert.equal(search.coverage.completeness.includes("explicit scopes"), true);
    assert.deepEqual(search.hits.find((hit) => hit.path === "src/example.ts").location.start, {
      line: 1,
      column: prefix.length + 1,
    });
    assert.equal(
      search.coverage.skipped.some(
        (entry) => entry.path === ".env.ts" && entry.reason === "environment-file",
      ),
      true,
    );
    assert.equal(
      search.coverage.skipped.some(
        (entry) => entry.path === "dist/output.ts" && entry.reason === "explicit-exclude",
      ),
      true,
    );

    const rewrite = execute(
      [
        "rewrite",
        "--rule",
        "rules/console.yml",
        "--scope",
        "src",
        "--objective",
        "replace console logging",
        "--out",
        ".artifacts/console-plan.json",
      ],
      { root },
    );
    assert.deepEqual(rewrite.plan, {
      applicable: true,
      output: ".artifacts/console-plan.json",
      changes: 1,
    });
    assert.equal(readFileSync(join(root, "src/example.ts"), "utf8"), before);
    const plan = JSON.parse(readFileSync(join(root, ".artifacts/console-plan.json"), "utf8"));
    assert.equal(plan.version, 1);
    assert.equal(plan.changes[0].before, before);
    assert.equal(plan.changes[0].after, `${prefix}logger.info(café);\r\n`);
    runPatch(plan, { root });
    runPatch(plan, { root, apply: true });
    const residual = execute(["search", "--rule", "rules/console.yml", "--scope", "src"], {
      root,
    });
    assert.equal(residual.hits.length, 0);
  }));

test("zero-hit rewrite emits an empty applicable plan", () =>
  fixture((root) => {
    write(root, "src/example.ts", "export const value = 1;\n");
    write(root, "rule.yml", rewriteRule);
    commit(root);
    const result = execute(
      [
        "rewrite",
        "--rule",
        "rule.yml",
        "--scope",
        "src",
        "--objective",
        "no matches",
        "--out",
        ".artifacts/empty.json",
      ],
      { root },
    );
    assert.equal(result.hits.length, 0);
    assert.equal(result.plan.changes, 0);
    assert.deepEqual(
      JSON.parse(readFileSync(join(root, ".artifacts/empty.json"), "utf8")).changes,
      [],
    );
    const reviewed = readFileSync(join(root, ".artifacts/empty.json"), "utf8");
    assert.throws(
      () =>
        execute(
          [
            "rewrite",
            "--rule",
            "rule.yml",
            "--scope",
            "src",
            "--objective",
            "must not overwrite",
            "--out",
            ".artifacts/empty.json",
          ],
          { root },
        ),
      /already exists/,
    );
    assert.equal(readFileSync(join(root, ".artifacts/empty.json"), "utf8"), reviewed);
  }));

test("TSX rewrite includes tracked and non-ignored untracked source", () =>
  fixture((root) => {
    write(root, "rules/button.yml", tsxRule);
    write(root, "src/tracked.tsx", "export const Tracked = () => <OldButton />;\n");
    write(root, "src/not-selected.ts", "const label = '<OldButton />';\n");
    commit(root);
    write(root, "src/untracked.tsx", "export const Untracked = () => <OldButton />;\n");

    const result = execute(
      [
        "rewrite",
        "--rule",
        "rules/button.yml",
        "--scope",
        "src",
        "--objective",
        "replace TSX button",
        "--out",
        ".artifacts/tsx.json",
      ],
      { root },
    );
    assert.equal(result.source.dirty, true);
    assert.equal(result.coverage.candidateFiles, 3);
    assert.equal(result.coverage.analyzedFiles, 2);
    assert.equal(result.coverage.nativeRule.language, "Tsx");
    assert.deepEqual(result.coverage.nativeRule.filters, { files: false, ignores: false });
    assert.deepEqual(result.coverage.languageExcluded, [
      { path: "src/not-selected.ts", reason: "native-rule-language" },
    ]);
    assert.deepEqual(result.hits.map((hit) => hit.path).sort(), [
      "src/tracked.tsx",
      "src/untracked.tsx",
    ]);
    const plan = JSON.parse(readFileSync(join(root, ".artifacts/tsx.json"), "utf8"));
    assert.equal(plan.changes.length, 2);
    runPatch(plan, { root, apply: true });
    const residual = execute(["search", "--rule", "rules/button.yml", "--scope", "src"], {
      root,
    });
    assert.equal(residual.hits.length, 0);
  }));

test("JavaScript native rules rewrite JSX source", () =>
  fixture((root) => {
    write(root, ".artifacts/button.yml", jsxRule);
    write(root, "src/component.jsx", "export const Component = () => <OldButton />;\n");
    write(root, "src/plain.js", "export const value = 1;\n");
    commit(root);
    const result = execute(
      [
        "rewrite",
        "--rule",
        ".artifacts/button.yml",
        "--scope",
        "src",
        "--objective",
        "replace JSX button",
        "--out",
        ".artifacts/jsx-plan.json",
      ],
      { root },
    );
    assert.equal(result.coverage.nativeRule.language, "JavaScript");
    assert.equal(result.coverage.analyzedFiles, 2);
    assert.deepEqual(
      result.hits.map((hit) => hit.path),
      ["src/component.jsx"],
    );
    const plan = JSON.parse(readFileSync(join(root, ".artifacts/jsx-plan.json"), "utf8"));
    runPatch(plan, { root, apply: true });
    const residual = execute(["search", "--rule", ".artifacts/button.yml", "--scope", "src"], {
      root,
    });
    assert.equal(residual.hits.length, 0);
  }));

test("rewrite snapshots unmatched inventory candidates before scanning", () =>
  fixture((root) => {
    write(root, "rule.yml", rewriteRule);
    write(root, "src/match.ts", "console.log('match');\n");
    write(root, "src/unmatched.ts", "export const value = 1;\n");
    commit(root);
    assert.throws(
      () =>
        structuralRewrite(root, {
          rule: "rule.yml",
          scopes: ["src"],
          objective: "stale inventory",
          out: ".artifacts/stale-ast.json",
          afterScan: () => write(root, "src/unmatched.ts", "export const value = 2;\n"),
        }),
      /Source changed while the operation was running: src\/unmatched\.ts/,
    );
    assert.equal(existsSync(join(root, ".artifacts/stale-ast.json")), false);
  }));

function typescriptFixture(root) {
  write(
    root,
    "tsconfig.json",
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "Bundler",
        strict: true,
        baseUrl: ".",
        paths: { "@src/*": ["src/*"] },
      },
      include: ["src/**/*.ts"],
    }),
  );
  write(
    root,
    "tsconfig.test.json",
    JSON.stringify({ extends: "./tsconfig.json", include: ["src/**/*.ts", "test/**/*.ts"] }),
  );
  write(
    root,
    "src/library.ts",
    "export function greet(name: string) {\n  const suffix = name.trim();\n  return name + suffix;\n}\n\nfunction build() {\n  const value = 1;\n  return { value };\n}\n\nconst outerValue = 1;\nfunction capture() {\n  const innerValue = 2;\n  return outerValue + innerValue;\n}\n",
  );
  write(
    root,
    "test/library.test.ts",
    'import { greet as callGreet } from "@src/library";\nconst greet = "shadow";\ncallGreet(greet);\n',
  );
}

test("TypeScript definitions and references honor aliases, tests, and shadowing", () =>
  fixture((root) => {
    typescriptFixture(root);
    commit(root);
    const definition = execute(["definition", "test/library.test.ts", "3", "2"], { root });
    assert.equal(definition.coverage.config, "tsconfig.test.json");
    assert.equal(definition.definitions[0].path, "src/library.ts");
    assert.match(definition.definitions[0].snippet, /export function greet/);
    const refs = execute(["references", "src/library.ts", "1", "18"], { root });
    assert.equal(
      refs.references.some((entry) => entry.path === "test/library.test.ts"),
      true,
    );
    assert.equal(refs.references.length, 4);
    assert.equal(
      refs.references.some(
        (entry) => entry.path === "test/library.test.ts" && entry.location.start.line === 2,
      ),
      false,
    );

    const refused = execute(
      [
        "rename",
        "src/library.ts",
        "1",
        "18",
        "welcome",
        "--objective",
        "rename exported function",
        "--out",
        ".artifacts/public.json",
      ],
      { root },
    );
    assert.equal(refused.plan.applicable, false);
    assert.equal(
      refused.plan.reasons.some((reason) => reason.includes("public")),
      true,
    );
    assert.equal(
      refused.preview.some((entry) => entry.path === "test/library.test.ts"),
      true,
    );
    assert.equal(existsSync(join(root, ".artifacts/public.json")), false);
  }));

test("rename plans only a private project-local symbol and stale plans are rejected", () =>
  fixture((root) => {
    typescriptFixture(root);
    commit(root);
    const result = execute(
      [
        "rename",
        "src/library.ts",
        "2",
        "9",
        "trimmed",
        "--objective",
        "rename local value",
        "--out",
        ".artifacts/rename.json",
      ],
      { root },
    );
    assert.equal(result.plan.applicable, true);
    const plan = JSON.parse(readFileSync(join(root, ".artifacts/rename.json"), "utf8"));
    assert.equal(plan.changes.length, 1);
    assert.equal(plan.changes[0].after.includes("const trimmed"), true);
    write(root, "src/library.ts", `${plan.changes[0].before}\n`);
    assert.throws(() => runPatch(plan, { root }), /SHA-256 mismatch/);
  }));

test("ambient Node builtins do not make project coverage unresolved", () =>
  fixture((root) => {
    write(
      root,
      "tsconfig.json",
      JSON.stringify({
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "Bundler",
          strict: true,
          types: ["node"],
          typeRoots: ["./types"],
        },
        include: ["src/**/*.ts", "test/**/*.ts"],
      }),
    );
    write(
      root,
      "types/node/index.d.ts",
      'declare module "node:crypto" { export function createHash(value: string): { digest(value: string): string }; }\ndeclare module "node:assert/strict" { export function strictEqual(actual: unknown, expected: unknown): void; }\ndeclare module "node:test" { export function test(name: string, run: () => void): void; }\n',
    );
    write(
      root,
      "src/hash.ts",
      'import { createHash } from "node:crypto";\nconst digest = createHash("sha256").digest("hex");\nconsole.log(digest);\n',
    );
    write(
      root,
      "test/hash.test.ts",
      'import { strictEqual } from "node:assert/strict";\nimport { test } from "node:test";\ntest("hash", () => strictEqual(typeof 1, "number"));\n',
    );
    commit(root);

    const result = execute(
      [
        "rename",
        "src/hash.ts",
        "2",
        "7",
        "hashValue",
        "--objective",
        "rename private hash value",
        "--out",
        ".artifacts/node-builtin.json",
      ],
      { root },
    );
    assert.deepEqual(result.coverage.unresolvedImports, []);
    assert.equal(result.plan.applicable, true);
    const plan = JSON.parse(readFileSync(join(root, ".artifacts/node-builtin.json"), "utf8"));
    assert.match(plan.changes[0].after, /const hashValue =/);
  }));

test("rename preserves shorthand property keys and rejects binding collisions", () =>
  fixture((root) => {
    typescriptFixture(root);
    commit(root);
    const shorthand = execute(
      [
        "rename",
        "src/library.ts",
        "7",
        "9",
        "renamed",
        "--objective",
        "rename shorthand value",
        "--out",
        ".artifacts/shorthand.json",
      ],
      { root },
    );
    assert.equal(shorthand.plan.applicable, true);
    const plan = JSON.parse(readFileSync(join(root, ".artifacts/shorthand.json"), "utf8"));
    assert.match(plan.changes[0].after, /return \{ value: renamed \};/);

    const collision = execute(
      [
        "rename",
        "src/library.ts",
        "2",
        "9",
        "name",
        "--objective",
        "colliding rename",
        "--out",
        ".artifacts/collision.json",
      ],
      { root },
    );
    assert.equal(collision.plan.applicable, false);
    assert.equal(
      collision.plan.reasons.some((reason) => reason.includes("already resolves")),
      true,
    );
    assert.equal(existsSync(join(root, ".artifacts/collision.json")), false);

    const capture = execute(
      [
        "rename",
        "src/library.ts",
        "11",
        "7",
        "innerValue",
        "--objective",
        "capturing rename",
        "--out",
        ".artifacts/capture.json",
      ],
      { root },
    );
    assert.equal(capture.plan.applicable, false);
    assert.equal(
      capture.plan.reasons.some((reason) => reason.includes("already resolves")),
      true,
    );
    assert.equal(existsSync(join(root, ".artifacts/capture.json")), false);
  }));

test("rename refuses public-shape property, enum, and accessor declarations", () =>
  fixture((root) => {
    write(root, "tsconfig.json", JSON.stringify({ include: ["src/**/*.ts"] }));
    write(
      root,
      "src/shapes.ts",
      "export const settings = { value: 1 };\nenum LocalKind { Value }\nclass Box {\n  get value() { return 1; }\n  set value(next: number) { console.log(next); }\n}\n",
    );
    commit(root);
    for (const [line, column, name] of [
      [1, 27, "settingValue"],
      [2, 18, "RenamedValue"],
      [4, 7, "readValue"],
    ]) {
      const result = execute(
        [
          "rename",
          "src/shapes.ts",
          String(line),
          String(column),
          name,
          "--objective",
          "refuse public shape",
          "--out",
          `.artifacts/refused-${line}.json`,
        ],
        { root },
      );
      assert.equal(result.plan.applicable, false);
      assert.equal(
        result.plan.reasons.some((reason) => reason.includes("provably local")),
        true,
      );
    }
  }));

test("rename refuses constructor parameter properties but allows ordinary parameters", () =>
  fixture((root) => {
    write(root, "tsconfig.json", JSON.stringify({ include: ["src/**/*.ts"] }));
    write(
      root,
      "src/parameters.ts",
      "export class PublicBox {\n  constructor(public value: number) {}\n}\nexport class ProtectedBox {\n  constructor(protected value: number) {}\n}\nexport class ReadonlyBox {\n  constructor(readonly value: number) {}\n}\nexport class PrivateBox {\n  constructor(private value: number) {}\n}\nexport class OrdinaryBox {\n  constructor(value: number) { console.log(value); }\n}\nexport function ordinary(value: number) { return value + 1; }\n",
    );
    commit(root);

    for (const [line, column, output] of [
      [2, 22, "public"],
      [5, 25, "protected"],
      [8, 24, "readonly"],
      [11, 23, "private"],
    ]) {
      const result = execute(
        [
          "rename",
          "src/parameters.ts",
          String(line),
          String(column),
          `${output}Renamed`,
          "--objective",
          "refuse parameter property",
          "--out",
          `.artifacts/${output}-parameter-property.json`,
        ],
        { root },
      );
      assert.equal(result.coverage.partial, true);
      assert.equal(result.plan.applicable, false);
      assert.equal(
        result.plan.reasons.some((reason) => reason.includes("provably local")),
        true,
      );
      assert.equal(existsSync(join(root, `.artifacts/${output}-parameter-property.json`)), false);
    }

    const constructorParameter = execute(
      [
        "rename",
        "src/parameters.ts",
        "14",
        "15",
        "constructorValue",
        "--objective",
        "rename ordinary constructor parameter",
        "--out",
        ".artifacts/constructor-parameter.json",
      ],
      { root },
    );
    assert.equal(constructorParameter.plan.applicable, true);
    assert.equal(existsSync(join(root, ".artifacts/constructor-parameter.json")), true);

    const functionParameter = execute(
      [
        "rename",
        "src/parameters.ts",
        "16",
        "26",
        "functionValue",
        "--objective",
        "rename ordinary function parameter",
        "--out",
        ".artifacts/function-parameter.json",
      ],
      { root },
    );
    assert.equal(functionParameter.plan.applicable, true);
    assert.equal(existsSync(join(root, ".artifacts/function-parameter.json")), true);
  }));

test("rename binds its plan to LanguageService source snapshots", () =>
  fixture((root) => {
    typescriptFixture(root);
    commit(root);
    const file = join(root, "src/library.ts");
    assert.throws(
      () =>
        renameSymbol(root, {
          file: "src/library.ts",
          line: 2,
          column: 9,
          newName: "trimmed",
          objective: "stale source",
          out: ".artifacts/stale.json",
          beforePlan: () => writeFileSync(file, `${readFileSync(file, "utf8")}\n// concurrent\n`),
        }),
      /Source changed while the operation was running/,
    );
    assert.equal(existsSync(join(root, ".artifacts/stale.json")), false);
  }));

test("rename refuses ambient or nonmodule global symbols", () =>
  fixture((root) => {
    write(root, "tsconfig.json", JSON.stringify({ include: ["src/**/*.ts"] }));
    write(root, "src/global.ts", "const globalValue = 1;\nconsole.log(globalValue);\n");
    commit(root);
    const result = execute(
      [
        "rename",
        "src/global.ts",
        "1",
        "7",
        "renamed",
        "--objective",
        "global rename",
        "--out",
        ".artifacts/global.json",
      ],
      { root },
    );
    assert.equal(result.plan.applicable, false);
    assert.equal(
      result.plan.reasons.some((reason) => reason.includes("global coverage")),
      true,
    );
    assert.equal(existsSync(join(root, ".artifacts/global.json")), false);
  }));

test("unresolved imports, declaration boundaries, and unconfigured scripts are explicit", () =>
  fixture((root) => {
    write(
      root,
      "tsconfig.json",
      JSON.stringify({
        compilerOptions: {
          module: "ESNext",
          moduleResolution: "Bundler",
          paths: { external: ["external/index.d.ts"] },
        },
        include: ["src/**/*.ts"],
      }),
    );
    write(root, "external/index.d.ts", "export declare const externalValue: number;\n");
    write(
      root,
      "src/main.ts",
      'import { externalValue } from "external";\nimport missing from "missing-package";\nconst localValue = externalValue + missing;\n',
    );
    write(root, "scripts/task.mjs", "const local = 1;\nconsole.log(local);\n");
    commit(root);
    const definition = execute(["definition", "src/main.ts", "3", "20"], { root });
    assert.equal(definition.coverage.partial, true);
    assert.equal(definition.definitions[0].declaration, true);
    assert.equal(definition.coverage.unresolvedImports[0].specifier, "missing-package");
    const refused = execute(
      [
        "rename",
        "src/main.ts",
        "3",
        "7",
        "renamed",
        "--objective",
        "uncertain rename",
        "--out",
        ".artifacts/uncertain.json",
      ],
      { root },
    );
    assert.equal(refused.plan.applicable, false);
    assert.equal(
      refused.plan.reasons.some((reason) => reason.includes("unresolved")),
      true,
    );
    const unsupported = execute(["references", "scripts/task.mjs", "1", "7"], { root });
    assert.equal(unsupported.status, "unsupported");
  }));

test("rejects overlaps, invalid resulting syntax, invalid rename names, and unsafe outputs", (t) =>
  fixture((root) => {
    assert.throws(
      () =>
        applyByteReplacements("file.ts", Buffer.from("abcdef"), [
          { start: 1, end: 4, text: "x" },
          { start: 3, end: 5, text: "y" },
        ]),
      /overlapping/,
    );
    write(root, "src/example.ts", "console.log('x');\n");
    write(
      root,
      "bad.yml",
      "id: invalid\nlanguage: TypeScript\nrule:\n  pattern: console.log($A)\nfix: 'const {'\nseverity: warning\n",
    );
    write(root, "good.yml", rewriteRule);
    write(root, "filtered.yml", `${rewriteRule}"files":\n  - src/**/*.ts\n`);
    write(
      root,
      "merged-filter.yml",
      'filter-defaults: &filter-defaults\n  ignores:\n    - src/generated.ts\n<<: *filter-defaults\nid: merged-filter\n"language": TypeScript\nrule:\n  pattern: console.log($A)\nseverity: warning\n',
    );
    write(
      root,
      "unsupported-language.yml",
      "id: unsupported\nlanguage: Python\nrule:\n  pattern: print($A)\nseverity: warning\n",
    );
    write(root, "tsconfig.json", JSON.stringify({ include: ["src/**/*.ts"] }));
    commit(root);
    assert.throws(
      () =>
        execute(
          [
            "rewrite",
            "--rule",
            "bad.yml",
            "--scope",
            "src",
            "--objective",
            "invalid",
            "--out",
            ".artifacts/bad.json",
          ],
          { root },
        ),
      /invalid syntax/,
    );
    assert.throws(
      () =>
        execute(
          [
            "rename",
            "src/example.ts",
            "1",
            "9",
            "class",
            "--objective",
            "bad name",
            "--out",
            ".artifacts/name.json",
          ],
          { root },
        ),
      /valid non-keyword/,
    );
    assert.throws(
      () =>
        execute(
          [
            "rewrite",
            "--rule",
            "good.yml",
            "--scope",
            "src",
            "--objective",
            "escape",
            "--out",
            "outside.json",
          ],
          { root },
        ),
      /below \.artifacts/,
    );
    assert.throws(
      () => execute(["search", "--rule", "filtered.yml", "--scope", "src"], { root }),
      /files\/ignores filters are unsupported/,
    );
    assert.throws(
      () => execute(["search", "--rule", "merged-filter.yml", "--scope", "src"], { root }),
      /files\/ignores filters are unsupported/,
    );
    assert.throws(
      () =>
        execute(["search", "--rule", "unsupported-language.yml", "--scope", "src"], {
          root,
        }),
      /Rule language must be one of/,
    );
    mkdirSync(join(root, ".artifacts"), { recursive: true });
    try {
      symlinkSync(join(root, "src"), join(root, ".artifacts", "linked"), "junction");
    } catch (error) {
      if (error?.code === "EPERM") return t.diagnostic("Windows denied junction creation (EPERM)");
      throw error;
    }
    assert.throws(
      () =>
        execute(
          [
            "rewrite",
            "--rule",
            "good.yml",
            "--scope",
            "src",
            "--objective",
            "symlink",
            "--out",
            ".artifacts/linked/plan.json",
          ],
          { root },
        ),
      /Symlink traversal/,
    );
  }));
