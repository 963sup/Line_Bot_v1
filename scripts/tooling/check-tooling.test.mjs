import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  globSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { validate } from "./check-tooling.mjs";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const manifest = JSON.parse(readFileSync(resolve(repo, "package.json"), "utf8"));
const exactNodeVersion = readFileSync(resolve(repo, ".node-version"), "utf8").trim();
// Generated fixture imports must not be mistaken for this test's actual imports.
const importing = (specifier) => `import ${JSON.stringify(specifier)};`;
const rootDeveloperInstructions =
  "Follow root AGENTS.md, .codex/agents/AGENTS.md, and docs/reference/engineering/development-workflow.md.";
const roleDeveloperInstructions = "Follow root AGENTS.md and .codex/agents/AGENTS.md.";
const codexConfig = (content = "") =>
  `developer_instructions = ${JSON.stringify(rootDeveloperInstructions)}\n${content}`;
const roleGuidance =
  "# Codex agents\n\n## Autonomous delegation\n\nDelegate bounded work when it improves evidence.\n";
const workflowGuidance =
  "# Development workflow\n\n## Default repository change loop\n\nFollow the bounded change loop.\n\n## Autonomous tool selection\n\nSelect tools that answer the current question.\n";

test("every PGlite test consumer launches Node with the WASM code GC protection", () => {
  const consumers = new Set(
    globSync(["packages/*/test/**/*.ts", "apps/web/test/**/*.ts"], { cwd: repo })
      .filter((file) =>
        /platform\/testing\/postgres|src\/testing\/postgres|@electric-sql\/pglite/.test(
          readFileSync(resolve(repo, file), "utf8"),
        ),
      )
      .map((file) => file.split(/[\\/]/).slice(0, 2).join("/")),
  );
  assert.ok(consumers.size > 0);
  for (const consumer of consumers) {
    const manifest = JSON.parse(readFileSync(resolve(repo, consumer, "package.json"), "utf8"));
    assert.match(
      manifest.scripts.test,
      /(?:^|&&\s*)node --no-wasm-code-gc --import tsx --test\b/,
      consumer,
    );
    assert.match(manifest.scripts.test, /--test --test-concurrency=2\b/, consumer);
  }
});
test("PGlite browser script consumers receive the flag in their actual launch command", () => {
  const consumers = globSync(["scripts/**/*.mjs", "scripts/**/*.ts"], { cwd: repo }).filter(
    (file) =>
      !file.includes(".test.") &&
      /(?:import|require(?:\.resolve)?|[\w$]+\.resolve)\s*\(\s*["'](?:@line_bot_v1\/platform\/testing\/postgres|@electric-sql\/pglite)["']/.test(
        readFileSync(resolve(repo, file), "utf8"),
      ),
  );
  assert.ok(consumers.length > 0);
  const runner = readFileSync(resolve(repo, "scripts/browser/run-local.mjs"), "utf8");
  for (const file of consumers) {
    const literal = JSON.stringify(file.replaceAll("\\", "/")).replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&",
    );
    assert.match(
      runner,
      new RegExp(
        `await command\\(\\s*\\[\\s*"--no-wasm-code-gc",\\s*path\\.join\\(root,\\s*${literal}\\)\\s*\\]`,
      ),
      file,
    );
  }
});

function fixture(t) {
  const artifacts = resolve(repo, ".artifacts");
  mkdirSync(artifacts, { recursive: true });
  const root = mkdtempSync(resolve(artifacts, "tooling-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const writeRaw = (name, content) => {
    const file = resolve(root, name);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  };
  const write = writeRaw;
  write(".codex/config.toml", codexConfig("[agents]\nenabled = true\n"));
  write(
    "AGENTS.md",
    "[Packages](packages/AGENTS.md) [Scripts](scripts/AGENTS.md) [GitHub](.github/AGENTS.md) [Codex](.codex/AGENTS.md)\\n",
  );
  for (const path of [
    "packages/AGENTS.md",
    "scripts/AGENTS.md",
    ".github/AGENTS.md",
    ".codex/AGENTS.md",
  ])
    write(path, "# Scope\\n");
  write(".codex/agents/AGENTS.md", roleGuidance);
  write("scripts/README.md", "# Scripts\\n");
  write("scripts/tooling/README.md", "# Tooling scripts\\n");
  write("packages/demo/AGENTS.md", "# @line_bot_v1/demo\\n");
  write("packages/demo/README.md", "# @line_bot_v1/demo\\n");
  write(".node-version", `${exactNodeVersion}\n`);
  write(
    "package.json",
    JSON.stringify({
      name: "fixture",
      engines: manifest.engines,
      packageManager: manifest.packageManager,
      scripts: {
        "schema:check": "turbo run schema:check",
        check: "node scripts/tooling/validate.mjs --fast",
        validate: "node scripts/tooling/validate.mjs",
        lint: "biome check .",
        format: "biome check --write .",
        deadcode: "knip",
        semantic: "node scripts/architecture/semantic-cli.mjs",
        code: "node scripts/code/cli.mjs",
        "patch:apply": "node scripts/changes/patch-apply.mjs",
        "change:status": "node scripts/changes/status.mjs",
        "change:preflight": "node scripts/changes/preflight.mjs",
        "change:finalize": "node scripts/changes/finalize.mjs",
        "tooling:doctor": "node scripts/tooling/doctor.mjs",
        "tooling:check": "node scripts/tooling/check-tooling.mjs",
        "tooling:rules": "node scripts/tooling/check-rules.mjs",
        "vercel:deploy:production": "node scripts/vercel/deploy-production.mjs",
        "github:current-main": "node scripts/github/current-main.mjs",
        "github:release-plan": "node scripts/github/release-plan.mjs",
        "github:rich-menu-ready": "node scripts/github/rich-menu-ready.mjs",
      },
      devDependencies: {
        "@biomejs/biome": "2.5.12",
        "@ast-grep/cli": "0.51.0",
        "ts-morph": "27.0.2",
      },
    }),
  );
  write(
    "scripts/tooling/validate.mjs",
    readFileSync(resolve(repo, "scripts/tooling/validate.mjs"), "utf8"),
  );
  write(
    "pnpm-workspace.yaml",
    'packages: ["packages/*"]\nallowBuilds:\n  "@ast-grep/cli": true\nengineStrict: true\nsaveExact: true\nverifyDepsBeforeRun: error\ncatalog:\n  typescript: 5.9.3\n',
  );
  write(
    "biome.json",
    JSON.stringify({
      $schema: "https://biomejs.dev/schemas/2.5.12/schema.json",
      assist: { actions: { source: { organizeImports: "on" } } },
      linter: {
        rules: {
          correctness: { noUnsafeOptionalChaining: "error" },
          complexity: { noBannedTypes: "error" },
          nursery: { noUnsafeTypeAssertion: "error" },
          suspicious: {
            noExplicitAny: "error",
            noTsIgnore: "error",
            noEvolvingTypes: "error",
            noImplicitAnyLet: "error",
            noUnsafeDeclarationMerging: "error",
          },
          style: {
            noNonNullAssertion: "error",
            noEnum: "error",
            noNamespace: "error",
            useAsConstAssertion: "error",
          },
        },
      },
    }),
  );
  write("tsconfig.base.json", readFileSync(resolve(repo, "tsconfig.base.json"), "utf8"));
  write("knip.jsonc", '{"$schema": "https://unpkg.com/knip@6/schema-jsonc.json"}');
  write(
    ".vscode/settings.json",
    JSON.stringify({
      "[javascript]": { "editor.defaultFormatter": "biomejs.biome", "editor.formatOnSave": true },
      "[typescript]": { "editor.defaultFormatter": "biomejs.biome", "editor.formatOnSave": true },
      "[javascriptreact]": {
        "editor.defaultFormatter": "biomejs.biome",
        "editor.formatOnSave": true,
      },
      "[typescriptreact]": {
        "editor.defaultFormatter": "biomejs.biome",
        "editor.formatOnSave": true,
      },
      "[json]": { "editor.defaultFormatter": "biomejs.biome", "editor.formatOnSave": true },
      "[jsonc]": { "editor.defaultFormatter": "biomejs.biome", "editor.formatOnSave": true },
      "editor.codeActionsOnSave": {
        "source.fixAll.biome": "explicit",
        "source.organizeImports.biome": "explicit",
      },
    }),
  );
  write(".vscode/extensions.json", JSON.stringify({ recommendations: ["biomejs.biome"] }));
  const requiredAgentTasks = [
    ["repo: tooling doctor", "tooling:doctor"],
    ["repo: tooling check", "tooling:check"],
    ["repo: tooling rules", "tooling:rules"],
  ];
  write(
    ".vscode/tasks.json",
    JSON.stringify({
      tasks: requiredAgentTasks.map(([label, script]) => ({
        label,
        command: "pnpm",
        args: [script],
      })),
    }),
  );
  const taskContracts = [
    "api-change",
    "architecture-change",
    "auth-change",
    "bug-fix",
    "business-rule",
    "database-change",
    "deployment-debug",
    "feature-change",
  ];
  for (const contract of taskContracts) write(`docs/tasks/${contract}.md`, "# Task\n");
  write("docs/README.md", "# Documentation\n");
  write("docs/reference/engineering/development-workflow.md", workflowGuidance);
  for (const [file, name, tools] of [
    ["architecture-reviewer.agent.md", "architecture-reviewer", "[read, search]"],
    ["database-reviewer.agent.md", "database-reviewer", "[read, search]"],
    ["security-reviewer.agent.md", "security-reviewer", "[read, search]"],
    ["root-cause-debugger.agent.md", "root-cause-debugger", "[read, search, edit, execute]"],
  ]) {
    write(
      `.github/agents/${file}`,
      `---\nname: ${name}\ndescription: Fixture agent\ninclude-custom-instructions: true\ntools: ${tools}\n---\nFollow \`docs/tasks/bug-fix.md\`.\n`,
    );
  }
  const promptContracts = [
    ["change-api", "api-change"],
    ["change-architecture", "architecture-change"],
    ["change-auth", "auth-change"],
    ["change-business-rule", "business-rule"],
    ["change-database", "database-change"],
    ["change-feature", "feature-change"],
    ["debug-deployment", "deployment-debug"],
    ["fix-bug", "bug-fix"],
    ["converge-markdown", "docs-router"],
  ];
  for (const [name, contract] of promptContracts) {
    if (contract === "docs-router") continue;
    write(
      `.github/prompts/${name}.prompt.md`,
      `---\nagent: agent\ndescription: Fixture prompt\n---\n\nFollow \`docs/tasks/${contract}.md\`.\n\n## Delivery\n\nReport results.\n`,
    );
  }
  write(
    ".github/prompts/converge-markdown.prompt.md",
    "---\nagent: agent\ndescription: Fixture prompt\n---\n\nUse docs/README.md.\n\n## Delivery\n\nReport results.\n",
  );
  write(".github/ISSUE_TEMPLATE/bug_report.md", "## 影響範圍\n## 不在範圍\n");
  write(".github/ISSUE_TEMPLATE/feature_request.md", "## 影響範圍\n## 不在範圍\n");
  write(".github/ISSUE_TEMPLATE/architecture.md", "## Owner / Boundary\n## Acceptance\n");
  write(
    ".env.example",
    "POSTGRES_URL=\nPOSTGRES_URL_NON_POOLING=\nSUPABASE_URL=\nKV_REST_API_URL=\nKV_REST_API_TOKEN=\n",
  );
  write(
    "turbo.json",
    JSON.stringify({
      globalDependencies: ["tsconfig.base.json"],
      tasks: {
        test: {
          inputs: ["$TURBO_DEFAULT$", "$TURBO_ROOT$/supabase/schemas/*.sql"],
        },
        "@line_bot_v1/web#build": {
          cache: false,
          env: ["NEXT_PUBLIC_*", "VERCEL", "VERCEL_ENV", "SENTRY_ORG", "SENTRY_PROJECT"],
          passThroughEnv: ["SENTRY_AUTH_TOKEN"],
          inputs: ["$TURBO_ROOT$/.env.local"],
        },
      },
    }),
  );
  write(
    "apps/web/vercel.json",
    JSON.stringify({
      git: {
        deploymentEnabled: {
          "**": false,
          main: false,
          preview: true,
          "preview/**": true,
        },
      },
    }),
  );
  write(
    ".github/workflows/validate.yml",
    readFileSync(resolve(repo, ".github/workflows/validate.yml"), "utf8"),
  );
  write(
    ".github/workflows/release.yml",
    readFileSync(resolve(repo, ".github/workflows/release.yml"), "utf8"),
  );
  write(
    ".github/workflows/supabase-replace.yml",
    "on:\n  workflow_dispatch:\n    inputs:\n      operation:\n        type: choice\n        options: [prepare-plan, apply]\n      enterprise_owner_confirmed_name:\n        type: string\n      enterprise_owner_confirmed_slug:\n        type: string\n      confirm_enterprise_identity:\n        type: string\n      reviewed_plan_run_id:\n        type: string\n      reviewed_plan_sha256:\n        type: string\npermissions:\n  contents: read\n  actions: read\n  checks: read\n  statuses: read\njobs:\n  reconcile:\n    if: github.ref == \'refs/heads/main\' && inputs.confirm_project == \'nmssogphayjymjpbnrxv\' && inputs.confirm_enterprise_identity == \'enterprise owner confirmed identity nmssogphayjymjpbnrxv\' && inputs.confirm_recovery == \'recovery verified nmssogphayjymjpbnrxv\' && inputs.confirm_apply == \'apply reviewed plan nmssogphayjymjpbnrxv\'\n    concurrency:\n      group: supabase-production-nmssogphayjymjpbnrxv\n      cancel-in-progress: false\n    env: {}\n    steps:\n      - run: echo \'check-runs .name == \"validate\"\'\n      - if: inputs.operation == \'apply\'\n        run: pnpm schema:remote recovery\n        env:\n          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}\n          SUPABASE_CONFIRM_PROJECT: nmssogphayjymjpbnrxv\n      - if: inputs.operation == \'apply\'\n        run: echo \'REVIEWED_PLAN_RUN_ID REVIEWED_PLAN_SHA256 ENTERPRISE_NAME ENTERPRISE_SLUG enterprise_identity_sha256 enterpriseIdentitySha256 actions/runs/$REVIEWED_PLAN_RUN_ID supabase-manual-prepare-plan-$SHA plan-provenance.json [0-9a-f]{64}\'\n      - if: inputs.operation == \'apply\'\n        run: echo \'manual-authorization.json recoveryEvidenceSha256 enterpriseIdentitySha256 reviewedPlanRunId\'\n      - run: pnpm schema:remote prepare\n        env:\n          SUPABASE_LEGACY_ENTERPRISE_NAME: ${{ inputs.enterprise_owner_confirmed_name }}\n          SUPABASE_LEGACY_ENTERPRISE_SLUG: ${{ inputs.enterprise_owner_confirmed_slug }}\n      - if: inputs.operation == \'prepare-plan\'\n        run: pnpm schema:remote plan\n      - if: inputs.operation == \'prepare-plan\'\n        run: echo \'plan-provenance.json workflowRunId planSha256 enterpriseIdentitySha256\'\n      - if: inputs.operation == \'apply\'\n        run: pnpm schema:remote sync --reviewed-plan\n        env:\n          SUPABASE_REVIEWED_PLAN_SHA256: ${{ inputs.reviewed_plan_sha256 }}\n      - uses: actions/upload-artifact@v4\n        with:\n          path: |\n            .artifacts/supabase-remote/plan.sql\n            .artifacts/supabase-remote/plan.sha256\n            .artifacts/supabase-remote/plan-provenance.json\n            .artifacts/supabase-remote/manual-authorization.json\n            .artifacts/supabase-remote/recovery-readback.json\n            .artifacts/supabase-remote/verification.sql\n            .artifacts/supabase-remote/migration-history.before.txt\n            .artifacts/supabase-remote/migration-history.after.txt\n",
  );
  return { root, write, writeRaw };
}
function rejects(root, message) {
  const errors = validate(root);
  assert.ok(
    errors.some((error) => error.includes(message)),
    JSON.stringify(errors),
  );
}
test("TypeScript safety options cannot be weakened by a workspace config", (t) => {
  const { root, write } = fixture(t);
  const base = "../../tsconfig.base.json";
  write("packages/demo/tsconfig.json", JSON.stringify({ extends: base }));
  assert.deepEqual(validate(root), []);
  for (const option of [
    "strict",
    "noUncheckedIndexedAccess",
    "exactOptionalPropertyTypes",
    "noImplicitOverride",
    "noFallthroughCasesInSwitch",
  ]) {
    write(
      "packages/demo/tsconfig.json",
      JSON.stringify({ extends: base, compilerOptions: { [option]: false } }),
    );
    rejects(root, `${option} must remain true`);
  }
  write("packages/demo/tsconfig.json", JSON.stringify({ extends: base }));
  assert.deepEqual(validate(root), []);
});

test("unsafe syntax rules must fail checks rather than warn", (t) => {
  const { root, write } = fixture(t);
  const original = readFileSync(resolve(root, "biome.json"), "utf8");
  for (const [group, rule] of [
    ["nursery", "noUnsafeTypeAssertion"],
    ["correctness", "noUnsafeOptionalChaining"],
    ["complexity", "noBannedTypes"],
    ["suspicious", "noImplicitAnyLet"],
    ["suspicious", "noEvolvingTypes"],
    ["suspicious", "noUnsafeDeclarationMerging"],
    ["style", "useAsConstAssertion"],
    ["suspicious", "noExplicitAny"],
    ["suspicious", "noTsIgnore"],
    ["style", "noNonNullAssertion"],
    ["style", "noEnum"],
    ["style", "noNamespace"],
  ]) {
    const biome = JSON.parse(original);
    biome.linter.rules[group][rule] = "warn";
    write("biome.json", JSON.stringify(biome));
    rejects(root, `${group}/${rule} must remain error`);
  }
  write("biome.json", original);
  assert.deepEqual(validate(root), []);
});

test("type drift rules reject unsafe syntax and accept contract-preserving replacements", (t) => {
  const { root, write } = fixture(t);
  const config = JSON.parse(readFileSync(resolve(repo, "biome.json"), "utf8"));
  config.vcs.enabled = false;
  write("biome.json", JSON.stringify(config));
  const biome = resolve(repo, "node_modules/@biomejs/biome/bin/biome");
  for (const [rule, invalid, repaired] of [
    [
      "noUnsafeTypeAssertion",
      "const value = input as string;",
      'const value = typeof input === "string" ? input : "";',
    ],
    ["noEvolvingTypes", "let value; value = 1;", "let value: number; value = 1;"],
    ["noImplicitAnyLet", "let value;", "let value: unknown;"],
    ["noBannedTypes", "const value: String = input;", "const value: string = input;"],
    [
      "noUnsafeOptionalChaining",
      "const value = (source?.value).name;",
      "const value = source?.value?.name;",
    ],
    [
      "noUnsafeDeclarationMerging",
      "class Value {} interface Value { name: string; }",
      'class Value { name = "value"; }',
    ],
    ["useAsConstAssertion", 'const value = "value" as "value";', 'const value = "value" as const;'],
  ]) {
    const lint = (source) => {
      write("apps/web/src/type-safety.ts", source);
      return spawnSync(process.execPath, [biome, "lint", "apps/web/src/type-safety.ts"], {
        cwd: root,
        encoding: "utf8",
      });
    };
    const rejected = lint(invalid);
    assert.equal(rejected.status, 1, rejected.stdout + rejected.stderr);
    assert.ok(
      (rejected.stdout + rejected.stderr).includes(rule),
      rejected.stdout + rejected.stderr,
    );
    const accepted = lint(repaired);
    assert.equal(accepted.status, 0, accepted.stderr);
  }
});

test("definite assignment escapes require explicit initialization", (t) => {
  const { root, write } = fixture(t);
  for (const source of ["let ready!: () => void;", "class Value { name!: string; }"]) {
    write("apps/web/src/declaration.ts", source);
    rejects(root, "definite assignment assertions must use explicit initialization");
  }
  write("apps/web/src/declaration.ts", 'class Value { name = "value"; }');
  assert.deepEqual(validate(root), []);
});

test("Web tests remain part of the compiler contract", (t) => {
  const { root, write } = fixture(t);
  const typecheck = "tsc --noEmit -p tsconfig.test.json";
  write(
    "apps/web/package.json",
    JSON.stringify({ name: "@line_bot_v1/web", scripts: { typecheck } }),
  );
  write("apps/web/instrumentation.ts", "export {};\n");
  write("apps/web/instrumentation-client.ts", "export {};\n");
  write("apps/web/test/example.test.ts", "export {};\n");
  write("apps/web/tsconfig.test.json", JSON.stringify({ include: ["src/**/*.ts"] }));
  rejects(root, "every Web TypeScript test must participate in typecheck");
  write("apps/web/tsconfig.test.json", JSON.stringify({ include: ["test/**/*.ts"] }));
  assert.deepEqual(validate(root), []);
  write(
    "apps/web/package.json",
    JSON.stringify({ name: "@line_bot_v1/web", scripts: { typecheck: "tsc --noEmit" } }),
  );
  rejects(root, "typecheck must compile the Web test project");
});

test("shared TypeScript configuration participates in every Turbo task cache", (t) => {
  const { root, write } = fixture(t);
  const original = readFileSync(resolve(root, "turbo.json"), "utf8");
  const turbo = JSON.parse(original);
  delete turbo.globalDependencies;
  write("turbo.json", JSON.stringify(turbo));
  rejects(root, "shared TypeScript configuration must invalidate task caches");
  write("turbo.json", original);
  assert.deepEqual(validate(root), []);
});

test("stale dist cannot hide deleted source for each module extension", (t) => {
  const { root, write } = fixture(t);
  for (const [compiled, source] of [
    ["js", "ts"],
    ["mjs", "mts"],
    ["cjs", "cts"],
  ]) {
    write("scripts/check.mjs", importing(`../packages/demo/dist/x.${compiled}`));
    write(`packages/demo/dist/x.${compiled}`, "export const x = 1;");
    rejects(root, "missing source");
    write(`packages/demo/src/x.${source}`, "export const x = 1;");
    assert.deepEqual(validate(root), []);
  }
});
for (const [file, content, message] of [
  [
    "packages/demo/package.json",
    '{"name":"demo","devDependencies":{"typescript":"5.9.3"}}',
    "catalog",
  ],
  ["packages/demo/package.json", '{"name":"demo","dependencies":{"other":"^1.0.0"}}', "exact"],
  ["packages/demo/package.json", '{"name":"demo","dependencies":{"other":"catalog:"}}', "exact"],
  ["yarn.lock", "", "extra lockfile"],
  ["biome.json", '{"$schema":"https://biomejs.dev/schemas/1.0.0/schema.json"}', "schema version"],
  [
    ".github/workflows/validate.yml",
    'jobs:\n  validate:\n    steps:\n      - uses: actions/setup-node@v6\n        with:\n          node-version: "24"\n',
    "CI:",
  ],
]) {
  test(`rejects version drift: ${file} ${content}`, (t) => {
    const { root, write } = fixture(t);
    write(file, content);
    rejects(root, message);
  });
}
test("retired project identity cannot reappear in current surfaces", (t) => {
  const { root, write } = fixture(t);

  const retiredScope = `${["@line", "work"].join("-")}/demo`;
  write("docs/identity.md", `# ${retiredScope}\n`);
  rejects(root, "retired project workspace namespace");

  const retiredSystemId = ["line", "work", "assistant"].join("-");
  write("docs/identity.md", `# ${retiredSystemId}\n`);
  rejects(root, "retired project system id");

  const retiredShortChineseName = ["工作", "助手"].join("");
  write("docs/identity.md", `# ${retiredShortChineseName}\n`);
  rejects(root, "retired project short Chinese display name");

  const retiredRichMenuPrefix = `${["work", "assistant"].join("-")}-home`;
  write("docs/identity.md", `# ${retiredRichMenuPrefix}\n`);
  rejects(root, "retired project legacy Rich Menu prefix");

  const retiredProviderSlug = `${["line", "work"].join("-")}-web`;
  write("docs/identity.md", `# ${retiredProviderSlug}\n`);
  rejects(root, "retired project legacy provider slug");

  const retiredRuntimePrefix = `${["line", "bot"].join("-")}:production`;
  write("docs/identity.md", `# ${retiredRuntimePrefix}\n`);
  rejects(root, "retired project legacy runtime prefix");

  const retiredSchemaOperator = `${["line", "bot"].join("-")}-schema-operator`;
  write("docs/identity.md", `# ${retiredSchemaOperator}\n`);
  rejects(root, "retired project legacy schema operator");
});

test("validation entrypoints stay canonical and read-only", (t) => {
  const { root, write } = fixture(t);
  const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

  packageJson.scripts.check = "node scripts/tooling/other.mjs";
  write("package.json", JSON.stringify(packageJson));
  rejects(root, "canonical read-only fast validation entry");

  packageJson.scripts.check = "node scripts/tooling/validate.mjs --fast";
  packageJson.scripts.validate = "node scripts/tooling/other.mjs";
  write("package.json", JSON.stringify(packageJson));
  rejects(root, "canonical read-only full validation entry");

  packageJson.scripts.validate = "node scripts/tooling/validate.mjs";
  write("package.json", JSON.stringify(packageJson));
  for (const command of [
    "schema:local",
    "schema:remote",
    "line:rich-menu",
    "vercel:deploy:production",
    "format",
  ]) {
    write("scripts/tooling/validate.mjs", `const command = '${command}';\\n`);
    rejects(root, `validation must not invoke mutable operation ${command}`);
  }
});

test("semantic and patch commands keep one responsibility-shaped entrypoint", (t) => {
  const { root, write } = fixture(t);
  const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

  packageJson.scripts["semantic:plan"] = "node duplicate.mjs";
  write("package.json", JSON.stringify(packageJson));
  rejects(root, "semantic:* aliases are forbidden");

  delete packageJson.scripts["semantic:plan"];
  packageJson.scripts.semantic = "node other.mjs";
  write("package.json", JSON.stringify(packageJson));
  rejects(root, "single semantic command namespace");

  packageJson.scripts.semantic = "node scripts/architecture/semantic-cli.mjs";
  packageJson.scripts["change:plan"] = "node legacy.mjs";
  write("package.json", JSON.stringify(packageJson));
  rejects(root, "change:plan is retired");

  delete packageJson.scripts["change:plan"];
  packageJson.scripts["change:impact"] = "pnpm semantic plan";
  write("package.json", JSON.stringify(packageJson));
  rejects(root, "change:impact is retired");

  delete packageJson.scripts["change:impact"];
  write("package.json", JSON.stringify(packageJson));
  assert.deepEqual(validate(root), []);
});

test("source operations keep a pinned local CLI and a preview-only command entrypoint", (t) => {
  const { root, write } = fixture(t);
  const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  packageJson.scripts.code = "pnpm dlx @ast-grep/cli@latest";
  write("package.json", JSON.stringify(packageJson));
  rejects(root, "code must own source queries and preview-only patch generation");
  packageJson.scripts.code = "node scripts/code/cli.mjs";
  packageJson.devDependencies["@ast-grep/cli"] = "^0.51.0";
  write("package.json", JSON.stringify(packageJson));
  rejects(root, "pinned @ast-grep/cli 0.51.0");
  packageJson.devDependencies["@ast-grep/cli"] = "0.51.0";
  write("package.json", JSON.stringify(packageJson));
  const workspace = YAML.parse(readFileSync(resolve(root, "pnpm-workspace.yaml"), "utf8"));
  workspace.allowBuilds["@ast-grep/cli"] = false;
  write("pnpm-workspace.yaml", YAML.stringify(workspace));
  rejects(root, "ast-grep CLI requires its explicit installation build");
});

test("source facts keep the supported direct exact parser dependency", (t) => {
  const { root, write } = fixture(t);
  const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  for (const invalid of [undefined, "^27.0.2", "28.0.0"]) {
    if (invalid === undefined) delete packageJson.devDependencies["ts-morph"];
    else packageJson.devDependencies["ts-morph"] = invalid;
    write("package.json", JSON.stringify(packageJson));
    rejects(root, "pinned direct ts-morph 27.0.2");

    packageJson.devDependencies["ts-morph"] = "27.0.2";
    write("package.json", JSON.stringify(packageJson));
    assert.deepEqual(validate(root), []);
  }
});

test("Biome mutation and editor integration stay canonical", (t) => {
  const { root, write } = fixture(t);
  const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  packageJson.scripts.format = "biome format --write .";
  write("package.json", JSON.stringify(packageJson));
  rejects(root, "canonical Biome formatter, lint and assist fixes");

  packageJson.scripts.format = "biome check --write .";
  write("package.json", JSON.stringify(packageJson));
  const settings = JSON.parse(readFileSync(resolve(root, ".vscode/settings.json"), "utf8"));
  settings["[typescript]"]["editor.formatOnSave"] = false;
  write(".vscode/settings.json", JSON.stringify(settings));
  rejects(root, "typescript must format on save with Biome");

  settings["[typescript]"]["editor.formatOnSave"] = true;
  settings["editor.codeActionsOnSave"]["source.organizeImports.biome"] = "never";
  write(".vscode/settings.json", JSON.stringify(settings));
  rejects(root, "source.organizeImports.biome must run on explicit save");
});

test("Knip remains the canonical reachability gate without broad ignores", (t) => {
  const { root, write } = fixture(t);
  const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  packageJson.scripts.deadcode = "echo skip";
  write("package.json", JSON.stringify(packageJson));
  rejects(root, "canonical Knip reachability check");

  packageJson.scripts.deadcode = "knip";
  write("package.json", JSON.stringify(packageJson));
  write(
    "knip.jsonc",
    '{"$schema": "https://unpkg.com/knip@6/schema-jsonc.json", "ignore": ["src/**"]}',
  );
  rejects(root, "broad ignore is forbidden");
});

test("environment contract keeps secrets out of global build hashing", (t) => {
  const { root, write } = fixture(t);
  write(
    "turbo.json",
    JSON.stringify({
      globalEnv: ["LINE_*"],
      globalDependencies: [".env.local"],
      tasks: {
        "@line_bot_v1/web#build": {
          cache: false,
          env: ["NEXT_PUBLIC_*", "VERCEL", "VERCEL_ENV", "SENTRY_ORG", "SENTRY_PROJECT"],
          passThroughEnv: ["SENTRY_AUTH_TOKEN"],
          inputs: ["$TURBO_ROOT$/.env.local"],
        },
      },
    }),
  );
  rejects(root, "must not use globalEnv");
  rejects(root, "must not invalidate every workspace task");
});

test("product test cache remains coupled to declarative schemas", (t) => {
  const { root, write } = fixture(t);
  const turbo = JSON.parse(readFileSync(resolve(root, "turbo.json"), "utf8"));
  delete turbo.tasks.test;
  write("turbo.json", JSON.stringify(turbo));
  rejects(root, "product tests must hash declarative schemas");
});

test("multi-session test consumers declare their environment and cannot replay cached evidence", (t) => {
  const { root, write } = fixture(t);
  write("packages/demo/package.json", JSON.stringify({ name: "@line_bot_v1/demo", private: true }));
  write(
    "packages/demo/test/concurrency.test.ts",
    `${importing("@line_bot_v1/platform/testing/postgres-sessions")}\nconst url = process.env.CAPABILITY_TEST_DATABASE_URL;\nconst ci = process.env.CI;\n`,
  );
  const turbo = JSON.parse(readFileSync(resolve(root, "turbo.json"), "utf8"));
  rejects(root, "multi-session tests must declare CAPABILITY_TEST_DATABASE_URL");
  const task = { cache: false, env: ["CAPABILITY_TEST_DATABASE_URL", "CI"] };
  turbo.tasks["@line_bot_v1/demo#test"] = task;
  write("turbo.json", JSON.stringify(turbo));
  assert.deepEqual(validate(root), []);
  for (const omitted of ["CAPABILITY_TEST_DATABASE_URL", "CI"]) {
    task.env = ["CAPABILITY_TEST_DATABASE_URL", "CI"].filter((name) => name !== omitted);
    write("turbo.json", JSON.stringify(turbo));
    rejects(root, `multi-session tests must declare ${omitted}`);
  }
  task.env = ["CAPABILITY_TEST_DATABASE_URL", "CI"];
  task.cache = true;
  write("turbo.json", JSON.stringify(turbo));
  rejects(root, "multi-session tests must execute rather than replay cached evidence");
  task.cache = false;
  write("turbo.json", JSON.stringify(turbo));
  assert.deepEqual(validate(root), []);
  write(
    "packages/platform/package.json",
    JSON.stringify({
      name: "@line_bot_v1/platform",
      private: true,
      scripts: { "schema:check": "node --test" },
    }),
  );
  write("packages/platform/AGENTS.md", "# Platform\n");
  write("packages/platform/README.md", "# Platform\n");
  write("packages/platform/src/testing/postgres-sessions.ts", "export {};\n");
  write(
    "packages/platform/test/concurrency.test.ts",
    `${importing("../src/testing/postgres-sessions.js")}\nconst url = process.env.CAPABILITY_TEST_DATABASE_URL;\nconst ci = process.env.CI;\n`,
  );
  const platformTask = { cache: false, env: ["CAPABILITY_TEST_DATABASE_URL", "CI"] };
  turbo.tasks["@line_bot_v1/platform#test"] = platformTask;
  write("turbo.json", JSON.stringify(turbo));
  assert.deepEqual(validate(root), []);
  platformTask.env = ["CI"];
  write("turbo.json", JSON.stringify(turbo));
  rejects(root, "multi-session tests must declare CAPABILITY_TEST_DATABASE_URL");
  platformTask.env = ["CAPABILITY_TEST_DATABASE_URL", "CI"];
  write("turbo.json", JSON.stringify(turbo));
  assert.deepEqual(validate(root), []);
});

test("Next and Sentry instrumentation entrypoints stay at the Web project root", (t) => {
  const { root, write } = fixture(t);
  write(
    "apps/web/package.json",
    JSON.stringify({
      name: "@line_bot_v1/web",
      scripts: { typecheck: "tsc --noEmit -p tsconfig.test.json" },
    }),
  );
  write("apps/web/test/example.test.ts", "export {};\n");
  write("apps/web/tsconfig.test.json", JSON.stringify({ include: ["test/**/*.ts"] }));
  rejects(root, "Next/Sentry framework entrypoint must live at project root");

  write("apps/web/instrumentation.ts", "export function register() {}\n");
  write("apps/web/instrumentation-client.ts", "export {};\n");
  assert.deepEqual(validate(root), []);

  write("apps/web/src/instrumentation.ts", "export function register() {}\n");
  rejects(root, "duplicate framework entrypoint is forbidden");
  rmSync(resolve(root, "apps/web/src/instrumentation.ts"));
  assert.deepEqual(validate(root), []);
});

test("Sentry build credentials pass through without entering the cache hash", (t) => {
  const { root, write } = fixture(t);
  const turbo = JSON.parse(readFileSync(resolve(root, "turbo.json"), "utf8"));
  const webBuild = turbo.tasks["@line_bot_v1/web#build"];
  webBuild.env.push("SENTRY_AUTH_TOKEN");
  webBuild.passThroughEnv = [];
  write("turbo.json", JSON.stringify(turbo));
  rejects(root, "must pass through SENTRY_AUTH_TOKEN");
  rejects(root, "must not hash SENTRY_AUTH_TOKEN");
});

test("Web builds cannot cache away Sentry uploads", (t) => {
  const { root, write } = fixture(t);
  const turbo = JSON.parse(readFileSync(resolve(root, "turbo.json"), "utf8"));
  const webBuild = turbo.tasks["@line_bot_v1/web#build"];
  assert.equal(
    validate(root).some((error) => error.includes("Sentry upload side effects")),
    false,
  );
  for (const cache of [true, undefined]) {
    webBuild.cache = cache;
    write("turbo.json", JSON.stringify(turbo));
    rejects(root, "Sentry upload side effects");
  }
  webBuild.cache = false;
  write("turbo.json", JSON.stringify(turbo));
  assert.equal(
    validate(root).some((error) => error.includes("Sentry upload side effects")),
    false,
  );
});

test("remote Supabase migration history cannot become an executable repository path", (t) => {
  const { root, write } = fixture(t);
  const forbidden = ["supabase", "db", "push"].join(" ");
  write("scripts/remote.mjs", `export const command = ${JSON.stringify(forbidden)};\n`);
  rejects(root, "remote Supabase migration-history command is forbidden");

  write("scripts/remote.mjs", "");
  write("supabase/migrations/20260101000000_forbidden.sql", "select 1;\n");
  rejects(root, "remote migration files are not a current repository contract");
});

test("current repository surfaces reject retired User vocabulary", (t) => {
  const { root, write } = fixture(t);
  const retiredType = ["User", "Account"].join("");
  const retiredField = ["user", "AccountId"].join("");
  const retiredTable = ["user", "_accounts"].join("");

  write("packages/demo/src/user.ts", `export type ${retiredType} = string;\n`);
  rejects(root, "retired User vocabulary");

  write("packages/demo/src/user.ts", "export type User = string;\n");
  write("supabase/schemas/10_users.sql", `create table app_private.${retiredTable}(id text);\n`);
  rejects(root, "retired User vocabulary");

  write("supabase/schemas/10_users.sql", "create table app_private.users(id text);\n");
  write("scripts/probes/check-user.mjs", `export const payload = { ${retiredField}: "a" };\n`);
  rejects(root, "retired User vocabulary");

  write("scripts/probes/check-user.mjs", 'export const payload = { userId: "a" };\n');
  write("docs/030-modules/current-user.md", `${retiredType} is the current identity.\n`);
  rejects(root, "retired User vocabulary");

  const retiredPhrase = ["User", " account"].join("");
  write("docs/030-modules/current-user.md", `${retiredPhrase} is the current identity.\n`);
  rejects(root, "retired User vocabulary");

  const retiredHumanAlias = ["human", " account"].join("");
  write("docs/030-modules/current-user.md", `${retiredHumanAlias} is the current identity.\n`);
  rejects(root, "retired User vocabulary");

  const retiredChineseAlias = ["使用者", "帳號"].join("");
  write("docs/030-modules/current-user.md", `${retiredChineseAlias}是 current identity。\n`);
  rejects(root, "retired User vocabulary");

  const retiredFacetAlias = ["人類", " facet"].join("");
  write("docs/030-modules/current-user.md", `${retiredFacetAlias} is current.\n`);
  rejects(root, "retired User vocabulary");

  const retiredHumanProductAlias = ["human", " product-account"].join("");
  write("docs/030-modules/current-user.md", `${retiredHumanProductAlias} lifecycle.\n`);
  rejects(root, "retired User vocabulary");

  const retiredHumanAccountChinese = ["人類", "帳號"].join("");
  write("docs/030-modules/current-user.md", `${retiredHumanAccountChinese}資格。\n`);
  rejects(root, "retired User vocabulary");

  const retiredHumanProductChinese = ["人類", "產品帳號"].join("");
  write("docs/030-modules/current-user.md", `${retiredHumanProductChinese}。\n`);
  rejects(root, "retired User vocabulary");

  const retiredPersonProductChinese = ["人的", "產品帳號"].join("");
  write("docs/030-modules/current-user.md", `${retiredPersonProductChinese}。\n`);
  rejects(root, "retired User vocabulary");
});

test("vendored FPT domain truth may preserve upstream vocabulary without weakening product vocabulary guard", (t) => {
  const { root, write } = fixture(t);
  const retiredType = ["User", "Account"].join("");
  write(
    "architecture/domain/fpt/schema-users.json",
    JSON.stringify({ objects: [{ name: retiredType }] }),
  );
  assert.deepEqual(validate(root), []);

  write(
    "architecture/semantic-model.json",
    JSON.stringify({ role: "product-domain-overlay", term: retiredType }),
  );
  rejects(root, "retired User vocabulary");
});

test("only named dated evidence may preserve retired User vocabulary", (t) => {
  const { root, write } = fixture(t);
  const retiredType = ["User", "Account"].join("");
  write(
    "docs/change/evidence/schema-history-extraction.md",
    `${retiredType} historical evidence.\n`,
  );
  assert.deepEqual(validate(root), []);

  write("docs/change/evidence/new-current-evidence.md", `${retiredType} new evidence.\n`);
  rejects(root, "retired User vocabulary");
});

test("GitHub validation cannot impersonate Vercel", (t) => {
  const { root, write } = fixture(t);
  const workflow = readFileSync(resolve(root, ".github/workflows/validate.yml"), "utf8");
  write(".github/workflows/validate.yml", workflow.replace("jobs:", 'env:\n  VERCEL: "1"\njobs:'));
  rejects(root, "must not impersonate the Vercel runtime");
});

test("validation workflow rejects split fast/full PR truth", (t) => {
  const { root, write } = fixture(t);
  write(
    ".github/workflows/validate.yml",
    "permissions:\n  contents: read\njobs:\n  check:\n    if: github.event_name == 'pull_request'\n    steps:\n      - uses: actions/checkout@v6\n        with:\n          persist-credentials: false\n      - uses: actions/setup-node@v6\n        with:\n          node-version-file: .node-version\n      - run: pnpm validate\n  validate:\n    if: github.event_name == 'pull_request'\n    steps:\n      - uses: actions/checkout@v6\n        with:\n          persist-credentials: false\n      - uses: actions/setup-node@v6\n        with:\n          node-version-file: .node-version\n      - run: pnpm check\n",
  );
  rejects(root, "full Git history");
  rejects(root, "one parallel full validation owner");
  rejects(
    root,
    "main and every non-draft pull-request head must run every canonical validation group in parallel",
  );
});

test("validate workflow remains read-only, secret-free, and credential-free", (t) => {
  const { root, write } = fixture(t);
  write(
    ".github/workflows/validate.yml",
    "permissions:\n  contents: write\njobs:\n  validate:\n    steps:\n      - uses: actions/checkout@v6\n        with:\n          persist-credentials: true\n      - uses: actions/setup-node@v6\n        with:\n          node-version-file: .node-version\n",
  );
  rejects(root, "read-only token permissions");
  rejects(root, "must not persist credentials");
  write(
    ".github/workflows/validate.yml",
    "permissions:\n  contents: read\nenv:\n  TOKEN: ${{ secrets.PRODUCTION_TOKEN }}\njobs:\n  validate:\n    steps:\n      - uses: actions/checkout@v6\n        with:\n          persist-credentials: false\n      - uses: actions/setup-node@v6\n        with:\n          node-version-file: .node-version\n",
  );
  rejects(root, "must not consume repository secrets");
});

test("Release workflow remains a thin adapter around canonical owner commands", (t) => {
  const { root, write } = fixture(t);
  const workflow = readFileSync(resolve(root, ".github/workflows/release.yml"), "utf8");

  write(".github/workflows/release.yml", workflow.replace("run-name: Release", "run-name: Run"));
  rejects(root, "run-name must preserve");

  write(".github/workflows/release.yml", workflow.replace("branches: [main]", "branches: [other]"));
  rejects(root, "only main push events");

  write(".github/workflows/release.yml", workflow.replace("actions: read", "actions: write"));
  rejects(root, "read-only GitHub permissions");

  write(
    ".github/workflows/release.yml",
    workflow.replace(
      "needs.validation.result == 'success'",
      "needs.validation.result == 'failure'",
    ),
  );
  rejects(
    root,
    "every external operation must require successful same-SHA validation and planning",
  );

  write(
    ".github/workflows/release.yml",
    workflow.replace('pnpm github:release-plan --sha "$SHA"', "echo skip-plan"),
  );
  rejects(root, "delegate routing to github:release-plan");

  write(
    ".github/workflows/release.yml",
    workflow.replace('pnpm github:current-main --sha "$SHA"', "echo skip-main"),
  );
  rejects(root, "guard current main");

  write(
    ".github/workflows/release.yml",
    workflow.replace("supabase-production-nmssogphayjymjpbnrxv", "other-lock"),
  );
  rejects(root, "serialize the production database resource");

  write(
    ".github/workflows/release.yml",
    workflow.replace("pnpm schema:remote sync", "pnpm schema:remote sync --reviewed-plan"),
  );
  rejects(root, "plain declarative schema sync");

  write(
    ".github/workflows/release.yml",
    workflow.replace("needs.release_plan.outputs.schema_changed == 'true'", "true"),
  );
  rejects(root, "Supabase must run only for changed schema");

  write(
    ".github/workflows/release.yml",
    workflow.replace("needs.release_plan.outputs.web_affected == 'true'", "true"),
  );
  rejects(root, "Web-affected only");

  write(
    ".github/workflows/release.yml",
    workflow.replaceAll("needs.supabase.result == 'success'", "true"),
  );
  rejects(root, "follow Supabase contract convergence");

  write(
    ".github/workflows/release.yml",
    workflow.replace('pnpm vercel:deploy:production --live --sha "$SHA"', "echo skip-deploy"),
  );
  rejects(root, "invoke the Vercel owner");

  write(
    ".github/workflows/release.yml",
    workflow.replace("needs.release_plan.outputs.rich_menu_changed == 'true'", "true"),
  );
  rejects(root, "one independent changed-source publication job");

  write(
    ".github/workflows/release.yml",
    workflow.replace("needs.release_plan.outputs.scheduler_changed == 'true'", "true"),
  );
  rejects(root, "Attendance scheduler must be changed-source driven");

  write(
    ".github/workflows/release.yml",
    workflow.replaceAll("pnpm line:rich-menu publish all", "echo skip"),
  );
  rejects(root, "Rich Menu");

  write(
    ".github/workflows/release.yml",
    workflow.replace("pnpm github:release-plan", "gh api repos/$GITHUB_REPOSITORY/actions/runs"),
  );
  rejects(root, "thin adapter");

  write(".github/workflows/release.yml", workflow);
  assert.deepEqual(validate(root), []);
});

test("Rich Menu runtime readiness is checked before provider publication", (t) => {
  const { root, write } = fixture(t);
  const path = ".github/workflows/release.yml";
  const source = readFileSync(resolve(root, path), "utf8");
  write(path, source.replace('pnpm github:rich-menu-ready --sha "$SHA"', "echo skip-readiness"));
  rejects(root, "Rich Menu must verify compatible exact-SHA Web runtime");
});

test("Release scopes the Supabase management token and preserves identifier cutover evidence", (t) => {
  const { root, write } = fixture(t);
  const path = ".github/workflows/release.yml";
  const source = readFileSync(resolve(root, path), "utf8");
  const expectedError = "Supabase access token must be scoped to Schema and Storage sync steps";

  write(
    path,
    source.replace("          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}\n", ""),
  );
  rejects(root, expectedError);

  for (const relocate of [
    (workflow) => {
      workflow.env = { SUPABASE_ACCESS_TOKEN: "${{ secrets.SUPABASE_ACCESS_TOKEN }}" };
    },
    (workflow) => {
      workflow.jobs.supabase.env.SUPABASE_ACCESS_TOKEN = "${{ secrets.SUPABASE_ACCESS_TOKEN }}";
    },
    (workflow) => {
      workflow.jobs.supabase.steps.find(
        (step) => step.run === 'pnpm github:current-main --sha "$SHA"',
      ).env.SUPABASE_ACCESS_TOKEN = "${{ secrets.SUPABASE_ACCESS_TOKEN }}";
    },
  ]) {
    const workflow = YAML.parse(source);
    delete workflow.jobs.supabase.steps.find((step) => step.run === "pnpm schema:remote sync").env
      .SUPABASE_ACCESS_TOKEN;
    relocate(workflow);
    write(path, YAML.stringify(workflow));
    rejects(root, expectedError);
  }

  for (const evidence of [
    "plan.sql",
    "plan.sha256",
    "verification.sql",
    "migration-history.before.txt",
    "migration-history.after.txt",
    "recovery-readback.json",
    "scoped-identifier-readback.json",
  ]) {
    write(path, source.replace(`            .artifacts/supabase-remote/${evidence}\n`, ""));
    rejects(root, "preserve plan, verification, history, recovery and scoped identifier readback");
  }

  const missingStoragePublication = YAML.parse(source);
  missingStoragePublication.jobs.supabase_storage.steps.find(
    (step) => step.run === "pnpm storage:remote sync",
  ).run = "echo skip-storage";
  write(path, YAML.stringify(missingStoragePublication));
  rejects(root, "Storage must require changed-source exact-main publication");

  const missingStorageToken = YAML.parse(source);
  delete missingStorageToken.jobs.supabase_storage.steps.find(
    (step) => step.run === "pnpm storage:remote sync",
  ).env.SUPABASE_ACCESS_TOKEN;
  write(path, YAML.stringify(missingStorageToken));
  rejects(root, expectedError);

  write(path, source);
  assert.deepEqual(validate(root), []);
});

test("Release activates identifier writers only after compatible production deployment", (t) => {
  const { root, write } = fixture(t);
  const path = ".github/workflows/release.yml";
  const source = readFileSync(resolve(root, path), "utf8");
  const activationGateError =
    "identifier runtime activation must follow successful exact-SHA production deployment";
  const activationCommandError =
    "identifier runtime activation must use the canonical command with exact step-scoped production credentials and no management token";
  const activationEvidenceError =
    "identifier runtime activation must preserve activation SQL, history and scoped identifier readback evidence even on failure";

  const withoutActivation = YAML.parse(source);
  delete withoutActivation.jobs.identifier_runtime_activation;
  write(path, YAML.stringify(withoutActivation));
  rejects(root, "define planning and one job per external operation");

  for (const mutate of [
    (job) => {
      job.needs = job.needs.filter((need) => need !== "deployment");
    },
    (job) => {
      job.if = job.if.replace(
        "needs.deployment.result == 'success'",
        "needs.deployment.result == 'failure'",
      );
    },
    (job) => {
      job.concurrency["cancel-in-progress"] = true;
    },
    (job) => {
      job.steps.find((step) => step.run === 'pnpm github:current-main --sha "$SHA"').run =
        "echo skip-main";
    },
  ]) {
    const workflow = YAML.parse(source);
    mutate(workflow.jobs.identifier_runtime_activation);
    write(path, YAML.stringify(workflow));
    rejects(root, activationGateError);
  }

  for (const credential of [
    "GITHUB_TOKEN",
    "GITHUB_REPOSITORY",
    "POSTGRES_URL_NON_POOLING",
    "SUPABASE_RELEASE_SHA",
    "SUPABASE_URL",
    "SUPABASE_CONFIRM_PROJECT",
  ]) {
    const workflow = YAML.parse(source);
    const step = workflow.jobs.identifier_runtime_activation.steps.find(
      (candidate) => candidate.run === "pnpm schema:remote activate-identifiers",
    );
    delete step.env[credential];
    write(path, YAML.stringify(workflow));
    rejects(root, activationCommandError);
  }

  const wrongCommand = YAML.parse(source);
  wrongCommand.jobs.identifier_runtime_activation.steps.find(
    (step) => step.run === "pnpm schema:remote activate-identifiers",
  ).run = "pnpm schema:remote activate-identifiers --force";
  write(path, YAML.stringify(wrongCommand));
  rejects(root, activationCommandError);

  const managementCredential = YAML.parse(source);
  managementCredential.jobs.identifier_runtime_activation.steps.find(
    (step) => step.run === "pnpm schema:remote activate-identifiers",
  ).env.SUPABASE_ACCESS_TOKEN = "${{ secrets.SUPABASE_ACCESS_TOKEN }}";
  write(path, YAML.stringify(managementCredential));
  rejects(root, activationCommandError);

  const jobCredential = YAML.parse(source);
  jobCredential.jobs.identifier_runtime_activation.env.GITHUB_TOKEN = "${{ github.token }}";
  write(path, YAML.stringify(jobCredential));
  rejects(root, activationCommandError);

  for (const evidence of [
    "activate-identifiers.sql",
    "migration-history.before.txt",
    "migration-history.after.txt",
    "scoped-identifier-readback.json",
  ]) {
    const workflow = YAML.parse(source);
    const upload = workflow.jobs.identifier_runtime_activation.steps.find(
      (step) => step.uses === "actions/upload-artifact@v4",
    );
    upload.with.path = upload.with.path
      .split("\n")
      .filter((entry) => !entry.endsWith(evidence))
      .join("\n");
    write(path, YAML.stringify(workflow));
    rejects(root, activationEvidenceError);
  }

  write(path, source);
  assert.deepEqual(validate(root), []);
});

test("parallel validation preserves complete coverage and an unconditional failure gate", (t) => {
  const { root, write } = fixture(t);
  const source = readFileSync(resolve(root, ".github/workflows/validate.yml"), "utf8");
  for (const mutate of [
    (jobs) => jobs["full-validate"].strategy.matrix.group.pop(),
    (jobs) => {
      jobs["full-validate"].needs = "check";
    },
    (jobs) => {
      jobs["full-validate"].strategy["fail-fast"] = true;
    },
  ]) {
    const data = YAML.parse(source);
    mutate(data.jobs);
    write(".github/workflows/validate.yml", YAML.stringify(data));
    rejects(root, "every canonical validation group in parallel");
  }
  for (const run of ['test "$RESULT" != failure', "echo success"]) {
    const data = YAML.parse(source);
    data.jobs.validate.steps.find((step) => step.env?.RESULT).run = run;
    write(".github/workflows/validate.yml", YAML.stringify(data));
    rejects(root, "reject failed, cancelled or skipped groups");
  }
  write(".github/workflows/validate.yml", source);
  assert.deepEqual(validate(root), []);
});

test("parallel releases retain every publication gate and resource lock", (t) => {
  const { root, write } = fixture(t);
  const source = readFileSync(resolve(root, ".github/workflows/release.yml"), "utf8");
  for (const name of [
    "supabase",
    "deployment",
    "supabase_storage",
    "identifier_runtime_activation",
    "rich_menu",
    "attendance_scheduler",
  ]) {
    const data = YAML.parse(source);
    data.jobs[name].needs = data.jobs[name].needs.filter((need) => need !== "validation");
    write(".github/workflows/release.yml", YAML.stringify(data));
    rejects(root, "every external operation must require successful same-SHA validation");
  }
  for (const name of ["deployment", "rich_menu"]) {
    const data = YAML.parse(source);
    data.jobs[name].concurrency["cancel-in-progress"] = true;
    write(".github/workflows/release.yml", YAML.stringify(data));
    rejects(root, "serialize their own resource without cancelling writes");
  }
  const data = YAML.parse(source);
  data.jobs.release_plan.needs = "validation";
  write(".github/workflows/release.yml", YAML.stringify(data));
  rejects(root, "in parallel with validation");
  write(".github/workflows/release.yml", source);
  assert.deepEqual(validate(root), []);
});

test("GitHub operation command surface stays canonical", (t) => {
  const { root, write } = fixture(t);
  const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

  packageJson.scripts["github:current-main"] = "node other.mjs";
  write("package.json", JSON.stringify(packageJson));
  rejects(root, "github:current-main");

  packageJson.scripts["github:current-main"] = "node scripts/github/current-main.mjs";
  packageJson.scripts["github:release-plan"] = "node other.mjs";
  write("package.json", JSON.stringify(packageJson));
  rejects(root, "github:release-plan");
});

test("main Git integration cannot bypass controlled production release", (t) => {
  const { root, write } = fixture(t);
  const config = JSON.parse(readFileSync(resolve(root, "apps/web/vercel.json"), "utf8"));
  config.git.deploymentEnabled.main = true;
  write("apps/web/vercel.json", JSON.stringify(config));
  rejects(root, "main Git integration must not bypass");
});

test("required AGENTS scopes exist and root routes to each owner", (t) => {
  const { root, write } = fixture(t);
  write(
    "AGENTS.md",
    "[Packages](packages/AGENTS.md) [GitHub](.github/AGENTS.md) [Codex](.codex/AGENTS.md)\n",
  );
  rejects(root, "root must route to scripts/AGENTS.md");
});

test("every package scope has AGENTS and README entrypoints", (t) => {
  const { root, write } = fixture(t);
  write("packages/missing-readme/AGENTS.md", "# missing-readme\\n");
  rejects(root, "packages/missing-readme/README.md: package scope entrypoint is required");
  write("packages/missing-readme/README.md", "# missing-readme\\n");
  assert.deepEqual(validate(root), []);
});

test("package AGENTS use parent scope instead of duplicated boilerplate", (t) => {
  const { root, write } = fixture(t);
  write(
    "packages/demo/AGENTS.md",
    "# @line_bot_v1/demo\n\n- 本 package 是 owning context 的公開入口；Web 與其他 consumer 只可使用 package.json 已宣告 exports。\n- domain / application / contracts / adapters / agents surface 依需求存在，不預建空 layer。\n- 目前 facade 只為無行為變更遷移；新增功能直接放入此 context，禁止新增 legacy horizontal export。\n- 移除 facade 前必須保留型別、授權、交易、重播、隔離與既有測試。\n",
  );
  rejects(root, "duplicated package boilerplate belongs in packages/AGENTS.md");
});

test("Copilot review agents cannot gain tools beyond read and search", (t) => {
  const { root, write } = fixture(t);
  const path = ".github/agents/security-reviewer.agent.md";
  const source = readFileSync(resolve(root, path), "utf8");
  write(path, source.replace("tools: [read, search]", "tools: [read, search, execute]"));
  rejects(root, "reviewer tools must be limited to read/search");
});

test("Copilot root-cause debugger retains tools needed to reproduce and fix bugs", (t) => {
  const { root, write } = fixture(t);
  const path = ".github/agents/root-cause-debugger.agent.md";
  const source = readFileSync(resolve(root, path), "utf8");
  write(path, source.replace(", execute", ""));
  rejects(root, "debugger must grant edit and execute tools");
});

test("Copilot task prompts require valid frontmatter, local routing, and delivery output", (t) => {
  const { root, write } = fixture(t);
  const path = ".github/prompts/fix-bug.prompt.md";
  const source = readFileSync(resolve(root, path), "utf8");
  write(path, source.replace("docs/tasks/bug-fix.md", "docs/tasks/missing.md"));
  rejects(root, "task contract docs/tasks/missing.md does not exist");

  write(path, source.replace("## Delivery", "## Result"));
  rejects(root, "Delivery section is required");
});

test("VS Code tooling tasks must call existing package scripts", (t) => {
  const { root, write } = fixture(t);
  const path = ".vscode/tasks.json";
  const tasks = JSON.parse(readFileSync(resolve(root, path), "utf8"));
  tasks.tasks.find((task) => task.label === "repo: tooling rules").args = ["tooling:unknown"];
  write(path, JSON.stringify(tasks));
  rejects(root, "repo: tooling rules must call the package script tooling:rules");
});

test("issue templates retain impact and excluded-scope fields", (t) => {
  const { root, write } = fixture(t);
  write(".github/ISSUE_TEMPLATE/feature_request.md", "## 影響範圍\n");
  rejects(root, ".github/ISSUE_TEMPLATE/feature_request.md: ## 不在範圍 section is required");

  write(".github/ISSUE_TEMPLATE/architecture.md", "## Acceptance\n");
  rejects(root, ".github/ISSUE_TEMPLATE/architecture.md: ## Owner / Boundary section is required");
});

test("AGENTS hot path rejects target or proposal sections", (t) => {
  const { root, write } = fixture(t);
  write(
    "packages/demo/AGENTS.md",
    "# @line_bot_v1/demo\n\n## Future target design\n\n- Add a speculative capability later.\n",
  );
  rejects(root, "target/proposal design belongs in docs/change");

  write("packages/demo/AGENTS.md", "# @line_bot_v1/demo\n\n- Current local invariant only.\n");
  assert.deepEqual(validate(root), []);
});

test("shared dependencies require catalog", (t) => {
  const { root, write } = fixture(t);
  for (const name of ["one", "two"])
    write(
      `packages/${name}/package.json`,
      JSON.stringify({ name, dependencies: { other: "1.0.0" } }),
    );
  rejects(root, "shared dependency");
});
test("catalog references pass", (t) => {
  const { root, write } = fixture(t);
  write(
    "packages/demo/package.json",
    '{"name":"demo","devDependencies":{"typescript":"catalog:"}}',
  );
  assert.deepEqual(validate(root), []);
});
test("platform owns an executable schema:check task", (t) => {
  const { root, write } = fixture(t);
  write("packages/platform/package.json", '{"name":"@line_bot_v1/platform","scripts":{}}');
  rejects(root, "schema:check task owner");
});

test("runtime compatibility range must match the exact repository Node major and package manager", (t) => {
  const { root, write } = fixture(t);
  const data = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  data.engines = { node: ">=22", pnpm: "0.0.0" };
  write("package.json", JSON.stringify(data));
  rejects(root, "engines.node");
  rejects(root, "packageManager");

  data.engines = manifest.engines;
  write("package.json", JSON.stringify(data));
  write(".node-version", "25.0.0\n");
  rejects(root, "engines.node");

  write(".node-version", "24.x\n");
  rejects(root, ".node-version");
});
test("external skills are outside repository checks; adjacent governance remains checked", (t) => {
  const { root, write } = fixture(t);
  write(".agents/skills/demo/SKILL.md", "\uFEFF---\r\nname: other\r\n---\r\n");
  write(".agents/skills/demo/AGENTS.md", "# Future target\n");
  write(".agents/skills/demo/package.json", "{invalid upstream example\r\n");
  assert.deepEqual(validate(root), []);
  write(".agents/AGENTS.md", "\uFEFF# Skills management\r\n");
  rejects(root, ".agents/AGENTS.md: repository text must be UTF-8 without BOM");
  write(".agents/AGENTS.md", "# Skills management\n");
  write(".agents/skills-local/README.md", "\uFEFF# Repository content\n");
  rejects(root, ".agents/skills-local/README.md: repository text must be UTF-8 without BOM");
  write(".agents/skills-local/README.md", "# Repository content\n");
  assert.deepEqual(validate(root), []);
});
for (const role of ["diff-reviewer", "architecture-decider", "acceptance-decider"]) {
  test(`${role} cannot gain write access`, (t) => {
    const { root, write } = fixture(t);
    write(
      ".codex/agents/read-only-role.toml",
      `name="${role}"\ndescription="read only"\ndeveloper_instructions="read only"\nsandbox_mode="workspace-write"\n`,
    );
    rejects(root, "read-only");
  });
}
test("retired documentation taxonomy cannot reappear in current surfaces", (t) => {
  const { root, write } = fixture(t);
  const retired = ["docs", "060-engineering", "README.md"].join("/");
  write("README.md", `See ${retired}\n`);
  rejects(root, "retired documentation path");
});

test("invalid TOML fails", (t) => {
  const { root, write } = fixture(t);
  write(".codex/config.toml", "[agents");
  assert.ok(validate(root).length);
});
test("Codex config keeps active canonical instruction pointers", (t) => {
  const { root, write } = fixture(t);
  for (const reference of [
    "root AGENTS.md",
    ".codex/agents/AGENTS.md",
    "docs/reference/engineering/development-workflow.md",
  ]) {
    write(
      ".codex/config.toml",
      codexConfig("[agents]\nenabled = true\n").replace(reference, "missing.md"),
    );
    rejects(root, `developer_instructions must reference ${reference}`);
    write(".codex/config.toml", codexConfig("[agents]\nenabled = true\n"));
    assert.deepEqual(validate(root), []);
  }

  rmSync(resolve(root, "docs/reference/engineering/development-workflow.md"));
  rejects(
    root,
    "docs/reference/engineering/development-workflow.md: referenced canonical Codex instruction is required",
  );
  write("docs/reference/engineering/development-workflow.md", workflowGuidance);
  assert.deepEqual(validate(root), []);
});
test("canonical Codex guidance keeps non-empty active sections", (t) => {
  const { root, write } = fixture(t);
  for (const { path, heading, source, body } of [
    {
      path: ".codex/agents/AGENTS.md",
      heading: "Autonomous delegation",
      source: roleGuidance,
      body: "Delegate bounded work when it improves evidence.",
    },
    {
      path: "docs/reference/engineering/development-workflow.md",
      heading: "Default repository change loop",
      source: workflowGuidance,
      body: "Follow the bounded change loop.",
    },
    {
      path: "docs/reference/engineering/development-workflow.md",
      heading: "Autonomous tool selection",
      source: workflowGuidance,
      body: "Select tools that answer the current question.",
    },
  ]) {
    write(path, source.replace(`## ${heading}\n\n${body}\n`, ""));
    rejects(root, `## ${heading} section is required`);

    write(path, source.replace(`${body}\n`, ""));
    rejects(root, `## ${heading} section must not be empty`);

    write(path, source);
    assert.deepEqual(validate(root), []);
  }
});
test("custom roles keep repository governance pointers", (t) => {
  const { root, write } = fixture(t);
  const path = ".codex/agents/implementation-worker.toml";
  for (const reference of ["root AGENTS.md", ".codex/agents/AGENTS.md"]) {
    write(
      path,
      `name = "implementation-worker"\ndescription = "fixture"\ndeveloper_instructions = ${JSON.stringify(roleDeveloperInstructions.replace(reference, "missing.md"))}\n`,
    );
    rejects(root, `developer_instructions must reference ${reference}`);

    write(
      path,
      `name = "implementation-worker"\ndescription = "fixture"\ndeveloper_instructions = ${JSON.stringify(roleDeveloperInstructions)}\n`,
    );
    assert.deepEqual(validate(root), []);
  }
});
for (const prefix of ["", "[features.multi_agent_v2]\nenabled = true\n"]) {
  test(`agent limit cannot hide in wrong table: ${prefix}`, (t) => {
    const { root, write } = fixture(t);
    write(".codex/config.toml", `${prefix}max_concurrent_threads_per_session = 6\n`);
    rejects(root, "must be under [agents]");
  });
}
for (const value of ["0", "-1", "true", "1.5", "1.0", '"5"']) {
  test(`agent limit rejects ${value}`, (t) => {
    const { root, write } = fixture(t);
    write(".codex/config.toml", `[agents]\nmax_concurrent_threads_per_session = ${value}\n`);
    rejects(root, "positive integer");
  });
}
for (const [content, message] of [
  ["agents = true\n", "must be a table"],
  ['[agents]\nenabled = "true"\n', "must be a boolean"],
  ["[agents]\nmax_threads = 3\nmax_concurrent_threads_per_session = 5\n", "legacy alias"],
]) {
  test(`agent settings reject ${content}`, (t) => {
    const { root, write } = fixture(t);
    write(".codex/config.toml", content);
    rejects(root, message);
  });
}
for (const content of [
  "[agents]\nenabled = true\nmax_concurrent_threads_per_session = 5\n",
  "[agents]\nmax_threads = 2\n",
  "[agents]\nenabled = false\n",
  "[features]\nother_feature = true\n",
]) {
  test(`valid settings pass: ${content}`, (t) => {
    const { root, write } = fixture(t);
    write(".codex/config.toml", codexConfig(content));
    assert.deepEqual(validate(root), []);
  });
}
for (const [script, args, message] of [
  ["scripts/probes/check-agent.mjs", [], "--live"],
  ["scripts/probes/check-expense-card.mjs", [], "--live"],
  ["scripts/probes/check-gemini.mjs", [], "--live"],
  ["scripts/probes/check-line.mjs", [], "--live"],
  ["scripts/probes/check-receipt.mjs", [], "--live"],
  ["scripts/probes/check-redis.mjs", [], "--live"],
]) {
  test(`offline guard: ${script}`, (t) => {
    const { root } = fixture(t);
    const result = spawnSync(process.execPath, [resolve(repo, script), ...args], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, NODE_ENV: "test" },
    });
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes(message), result.stderr);
  });
}
test("wrong package manager stops before metadata checks", () => {
  const result = spawnSync(process.execPath, [resolve(repo, "scripts/tooling/check-tooling.mjs")], {
    cwd: repo,
    encoding: "utf8",
    env: { ...process.env, npm_config_user_agent: "pnpm/0.0.0" },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Expected Node/);
  assert.equal(result.stdout, "");
});
test("wrong Node stops before metadata checks", (t) => {
  const { root, write } = fixture(t);
  write(
    "scripts/tooling/check-tooling.mjs",
    readFileSync(resolve(repo, "scripts/tooling/check-tooling.mjs"), "utf8"),
  );
  write(".node-version", "0.0.0\n");
  write(".codex/config.toml", "[invalid");
  const result = spawnSync(process.execPath, [resolve(root, "scripts/tooling/check-tooling.mjs")], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, npm_config_user_agent: manifest.packageManager.replace("@", "/") },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Expected Node 0\.0\.0/);
  assert.equal(result.stdout, "");
});
test("repository text has one canonical encoding and line-ending format", (t) => {
  const { root, write, writeRaw } = fixture(t);
  writeRaw("README.md", "\uFEFF# Scope\n");
  rejects(root, "UTF-8 without BOM");

  writeRaw("README.md", "# Scope\r\n");
  rejects(root, "must use LF line endings");

  write("README.md", "# Scope\n");
  assert.deepEqual(validate(root), []);
});
test("malformed and duplicate YAML fail", (t) => {
  const { root, write } = fixture(t);
  for (const content of ["packages: [", "packages: []\npackages: []"]) {
    write("pnpm-workspace.yaml", content);
    rejects(root, "version metadata");
  }
});
test("imports cannot escape by relative path or directory junction", (t) => {
  const { root, write } = fixture(t);
  const outside = fixture(t);
  outside.write("target.mjs", "");
  write("scripts/check.mjs", importing("../../outside.mjs"));
  rejects(root, "import outside repository");
  try {
    symlinkSync(outside.root, resolve(root, "scripts/link"), "junction");
  } catch (error) {
    if (error?.code !== "EPERM") throw error;
    t.skip("Windows denied junction creation (EPERM)");
    return;
  }
  write("scripts/check.mjs", importing("./link/target.mjs"));
  rejects(root, "import outside repository");
  write("scripts/check.mjs", importing("./link/missing.mjs"));
  rejects(root, "import outside repository");
});
