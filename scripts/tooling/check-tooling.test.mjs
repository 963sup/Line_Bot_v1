import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { validate } from "./check-tooling.mjs";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const manifest = JSON.parse(readFileSync(resolve(repo, "package.json"), "utf8"));
const exactNodeVersion = readFileSync(resolve(repo, ".node-version"), "utf8").trim();
// Generated fixture imports must not be mistaken for this test's actual imports.
const importing = (specifier) => `import ${JSON.stringify(specifier)};`;
function fixture(t) {
  const artifacts = resolve(repo, ".artifacts");
  mkdirSync(artifacts, { recursive: true });
  const root = mkdtempSync(resolve(artifacts, "tooling-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (name, content) => {
    const file = resolve(root, name);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  };
  write(".codex/config.toml", "[agents]\nenabled = true\n");
  write(
    "AGENTS.md",
    "[Packages](packages/AGENTS.md) [Scripts](scripts/AGENTS.md) [GitHub](.github/AGENTS.md) [Skills](.agents/AGENTS.md) [Codex](.codex/AGENTS.md)\\n",
  );
  for (const path of [
    "packages/AGENTS.md",
    "scripts/AGENTS.md",
    ".github/AGENTS.md",
    ".agents/AGENTS.md",
    ".codex/AGENTS.md",
  ])
    write(path, "# Scope\\n");
  write("packages/demo/AGENTS.md", "# @line-work/demo\\n");
  write("packages/demo/README.md", "# @line-work/demo\\n");
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
        "patch:apply": "node scripts/changes/patch-apply.mjs",
        "vercel:deploy:production": "node scripts/vercel/deploy-production.mjs",
      },
      devDependencies: { "@biomejs/biome": "2.5.12" },
    }),
  );
  write("scripts/tooling/validate.mjs", "export const validation = true;\\n");
  write(
    "pnpm-workspace.yaml",
    'packages: ["packages/*"]\nengineStrict: true\nsaveExact: true\nverifyDepsBeforeRun: error\ncatalog:\n  typescript: 5.9.3\n',
  );
  write(
    "biome.json",
    '{"$schema":"https://biomejs.dev/schemas/2.5.12/schema.json","assist":{"actions":{"source":{"organizeImports":"on"}}}}',
  );
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
  write(
    ".env.example",
    "POSTGRES_URL=\nPOSTGRES_URL_NON_POOLING=\nSUPABASE_URL=\nKV_REST_API_URL=\nKV_REST_API_TOKEN=\n",
  );
  write(
    "turbo.json",
    JSON.stringify({
      tasks: {
        test: {
          inputs: ["$TURBO_DEFAULT$", "$TURBO_ROOT$/supabase/schemas/*.sql"],
        },
        "@line-work/web#build": {
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
    "on:\n  pull_request:\n    types: [opened, synchronize, reopened, ready_for_review]\n  push:\n    branches: [main]\npermissions:\n  contents: read\njobs:\n  check:\n    if: github.event_name == 'pull_request' && github.event.pull_request.draft == false\n    steps:\n      - uses: actions/checkout@v6\n        with:\n          fetch-depth: 0\n          persist-credentials: false\n      - uses: actions/setup-node@v6\n        with:\n          node-version-file: .node-version\n      - run: pnpm check\n  full-validate:\n    if: github.event_name == 'pull_request' && github.event.action == 'ready_for_review'\n    steps:\n      - uses: actions/checkout@v6\n        with:\n          ref: ${{ github.event.pull_request.head.sha }}\n          fetch-depth: 0\n          persist-credentials: false\n      - uses: actions/setup-node@v6\n        with:\n          node-version-file: .node-version\n      - run: pnpm validate\n  validate:\n    if: github.event_name == 'push' && github.ref == 'refs/heads/main'\n    steps:\n      - uses: actions/checkout@v6\n        with:\n          persist-credentials: false\n      - uses: actions/setup-node@v6\n        with:\n          node-version-file: .node-version\n      - run: pnpm validate\n",
  );
  write(
    ".github/workflows/release.yml",
    "run-name: Release ${{ github.event.workflow_run.head_sha }}\non:\n  workflow_run:\n    workflows: [Validate]\n    types: [completed]\n    branches: [main]\npermissions:\n  contents: read\n  actions: read\n  checks: read\n  statuses: read\njobs:\n  gate:\n    if: github.event.workflow_run.event == 'push' && github.event.workflow_run.conclusion == 'success' && github.event.workflow_run.head_branch == 'main' && github.event.workflow_run.head_repository.full_name == github.repository\n    steps:\n      - run: echo 'branches/main VALIDATED_SHA superseded before release routing'\n      - uses: actions/checkout@v6\n        with:\n          ref: ${{ github.event.workflow_run.head_sha }}\n          fetch-depth: 0\n          persist-credentials: false\n      - run: echo 'actions/workflows/release.yml/runs status=success display_title ^Release\\ [0-9a-f]{40}$ merge-base --is-ancestor empty_tree VALIDATED_SHA ^supabase/schemas/.*\\.sql$ assets/line/rich-menu/ GITHUB_OUTPUT'\n  supabase:\n    needs: gate\n    if: needs.gate.result == 'success'\n    concurrency:\n      group: supabase-production-nmssogphayjymjpbnrxv\n      cancel-in-progress: false\n    env: {}\n    steps:\n      - run: echo branches/main\n      - run: pnpm schema:remote repair\n      - if: needs.gate.outputs.schema_changed == 'true'\n        run: pnpm schema:remote sync\n      - if: needs.gate.outputs.schema_changed != 'true'\n        run: pnpm schema:remote verify\n      - uses: actions/upload-artifact@v4\n        with:\n          path: |\n            .artifacts/supabase-remote/daily-check-in-compat.sql\n            .artifacts/supabase-remote/permission-subject-version-compat.json\n            .artifacts/supabase-remote/repository-runtime-compat.json\n            .artifacts/supabase-remote/plan.sql\n            .artifacts/supabase-remote/plan.sha256\n            .artifacts/supabase-remote/verification.sql\n            .artifacts/supabase-remote/migration-history.before.txt\n            .artifacts/supabase-remote/migration-history.after.txt\n  deployment:\n    needs: [gate, supabase]\n    if: always() && needs.gate.result == 'success' && needs.supabase.result == 'success'\n    env: {}\n    steps:\n      - uses: actions/checkout@v6\n        with:\n          ref: ${{ needs.gate.outputs.head_sha }}\n          persist-credentials: false\n      - run: echo 'branches/main superseded before Vercel production deployment'\n      - env:\n          GITHUB_TOKEN: ${{ github.token }}\n          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}\n          SHA: ${{ needs.gate.outputs.head_sha }}\n        run: pnpm vercel:deploy:production -- --live --sha \"$SHA\"\n  rich_menu:\n    needs: [gate, deployment]\n    if: needs.gate.outputs.rich_menu_changed == 'true'\n    env: {}\n    steps:\n      - uses: pnpm/action-setup@v6\n        with:\n          run_install: false\n          cache: true\n          cache_dependency_path: pnpm-lock.yaml\n      - run: pnpm exec turbo run build --filter='@line-work/web^...'\n      - run: pnpm line:rich-menu preview all\n      - run: echo branches/main\n      - env:\n          LINE_CHANNEL_ACCESS_TOKEN: ${{ secrets.LINE_CHANNEL_ACCESS_TOKEN }}\n        run: pnpm line:rich-menu publish all\n",
  );
  write(
    ".github/workflows/supabase-replace.yml",
    "on:\n  workflow_dispatch:\n    inputs:\n      operation:\n        type: choice\n        options: [prepare-plan, apply]\n      enterprise_owner_confirmed_name:\n        type: string\n      enterprise_owner_confirmed_slug:\n        type: string\n      confirm_enterprise_identity:\n        type: string\n      reviewed_plan_run_id:\n        type: string\n      reviewed_plan_sha256:\n        type: string\npermissions:\n  contents: read\n  actions: read\n  checks: read\n  statuses: read\njobs:\n  reconcile:\n    if: github.ref == \'refs/heads/main\' && inputs.confirm_project == \'nmssogphayjymjpbnrxv\' && inputs.confirm_enterprise_identity == \'enterprise owner confirmed identity nmssogphayjymjpbnrxv\' && inputs.confirm_recovery == \'recovery verified nmssogphayjymjpbnrxv\' && inputs.confirm_apply == \'apply reviewed plan nmssogphayjymjpbnrxv\'\n    concurrency:\n      group: supabase-production-nmssogphayjymjpbnrxv\n      cancel-in-progress: false\n    env: {}\n    steps:\n      - run: echo \'check-runs .name == \"validate\"\'\n      - if: inputs.operation == \'apply\'\n        run: pnpm schema:remote recovery\n        env:\n          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}\n          SUPABASE_CONFIRM_PROJECT: nmssogphayjymjpbnrxv\n      - if: inputs.operation == \'apply\'\n        run: echo \'REVIEWED_PLAN_RUN_ID REVIEWED_PLAN_SHA256 ENTERPRISE_NAME ENTERPRISE_SLUG enterprise_identity_sha256 enterpriseIdentitySha256 actions/runs/$REVIEWED_PLAN_RUN_ID supabase-manual-prepare-plan-$SHA plan-provenance.json [0-9a-f]{64}\'\n      - if: inputs.operation == \'apply\'\n        run: echo \'manual-authorization.json recoveryEvidenceSha256 enterpriseIdentitySha256 reviewedPlanRunId\'\n      - run: pnpm schema:remote prepare\n        env:\n          SUPABASE_LEGACY_ENTERPRISE_NAME: ${{ inputs.enterprise_owner_confirmed_name }}\n          SUPABASE_LEGACY_ENTERPRISE_SLUG: ${{ inputs.enterprise_owner_confirmed_slug }}\n      - if: inputs.operation == \'prepare-plan\'\n        run: pnpm schema:remote plan\n      - if: inputs.operation == \'prepare-plan\'\n        run: echo \'plan-provenance.json workflowRunId planSha256 enterpriseIdentitySha256\'\n      - if: inputs.operation == \'apply\'\n        run: pnpm schema:remote sync --reviewed-plan\n        env:\n          SUPABASE_REVIEWED_PLAN_SHA256: ${{ inputs.reviewed_plan_sha256 }}\n      - uses: actions/upload-artifact@v4\n        with:\n          path: |\n            .artifacts/supabase-remote/plan.sql\n            .artifacts/supabase-remote/plan.sha256\n            .artifacts/supabase-remote/plan-provenance.json\n            .artifacts/supabase-remote/manual-authorization.json\n            .artifacts/supabase-remote/recovery-readback.json\n            .artifacts/supabase-remote/verification.sql\n            .artifacts/supabase-remote/migration-history.before.txt\n            .artifacts/supabase-remote/migration-history.after.txt\n",
  );
  return { root, write };
}
function rejects(root, message) {
  const errors = validate(root);
  assert.ok(
    errors.some((error) => error.includes(message)),
    JSON.stringify(errors),
  );
}
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
        "@line-work/web#build": {
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

test("Next and Sentry instrumentation entrypoints stay at the Web project root", (t) => {
  const { root, write } = fixture(t);
  write("apps/web/package.json", '{"name":"@line-work/web"}');
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
  const webBuild = turbo.tasks["@line-work/web#build"];
  webBuild.env.push("SENTRY_AUTH_TOKEN");
  webBuild.passThroughEnv = [];
  write("turbo.json", JSON.stringify(turbo));
  rejects(root, "must pass through SENTRY_AUTH_TOKEN");
  rejects(root, "must not hash SENTRY_AUTH_TOKEN");
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

test("external semantic benchmark may preserve upstream vocabulary without weakening product vocabulary guard", (t) => {
  const { root, write } = fixture(t);
  const retiredType = ["User", "Account"].join("");
  write(
    "architecture/semantic-benchmark.json",
    JSON.stringify({
      role: "derived-general-management-semantic-benchmark",
      upstreamSymbol: retiredType,
    }),
  );
  assert.deepEqual(validate(root), []);

  write(
    "architecture/semantic-model.json",
    JSON.stringify({ role: "canonical-product-semantic-architecture", term: retiredType }),
  );
  rejects(root, "retired User vocabulary");
});

test("only named dated evidence may preserve retired User vocabulary", (t) => {
  const { root, write } = fixture(t);
  const retiredType = ["User", "Account"].join("");
  write(
    "docs/090-governance/060-acceptance/040-schema-history-extraction.md",
    `${retiredType} historical evidence.\n`,
  );
  assert.deepEqual(validate(root), []);

  write(
    "docs/090-governance/060-acceptance/new-current-evidence.md",
    `${retiredType} new evidence.\n`,
  );
  rejects(root, "retired User vocabulary");
});

test("GitHub validation cannot impersonate Vercel", (t) => {
  const { root, write } = fixture(t);
  const workflow = readFileSync(resolve(root, ".github/workflows/validate.yml"), "utf8");
  write(".github/workflows/validate.yml", workflow.replace("jobs:", 'env:\n  VERCEL: "1"\njobs:'));
  rejects(root, "must not impersonate the Vercel runtime");
});

test("validation workflow keeps PR affected and main full gates separate", (t) => {
  const { root, write } = fixture(t);
  write(
    ".github/workflows/validate.yml",
    "permissions:\n  contents: read\njobs:\n  check:\n    if: github.event_name == 'pull_request'\n    steps:\n      - uses: actions/checkout@v6\n        with:\n          persist-credentials: false\n      - uses: actions/setup-node@v6\n        with:\n          node-version-file: .node-version\n      - run: pnpm validate\n  validate:\n    if: github.event_name == 'pull_request'\n    steps:\n      - uses: actions/checkout@v6\n        with:\n          persist-credentials: false\n      - uses: actions/setup-node@v6\n        with:\n          node-version-file: .node-version\n      - run: pnpm check\n",
  );
  rejects(root, "full Git history");
  rejects(root, "pull requests must run affected pnpm check");
  rejects(root, "main push must run full pnpm validate");
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

test("Release routes schema and workflow changes through one reconciliation pass before publication", (t) => {
  const { root, write } = fixture(t);
  const workflow = readFileSync(resolve(root, ".github/workflows/release.yml"), "utf8");

  write(".github/workflows/release.yml", workflow.replace("run-name: Release", "run-name: Run"));
  rejects(root, "run-name must preserve");

  write(
    ".github/workflows/release.yml",
    workflow.replace("workflows: [Validate]", "workflows: [Other]"),
  );
  rejects(root, "completed main Validate");

  write(".github/workflows/release.yml", workflow.replace("actions: read", "actions: write"));
  rejects(root, "read-only GitHub permissions");

  write(".github/workflows/release.yml", workflow.replace("conclusion == 'success' && ", ""));
  rejects(root, "successful same-repository main push Validate");

  write(
    ".github/workflows/release.yml",
    workflow.replace("head_repository.full_name", "repository.full_name"),
  );
  rejects(root, "successful same-repository main push Validate");

  write(".github/workflows/release.yml", workflow.replace("status=success ", ""));
  rejects(root, "detect affected source");

  write(".github/workflows/release.yml", workflow.replace("status=success", "status=completed"));
  rejects(root, "previous fully successful Release");

  write(".github/workflows/release.yml", workflow.replace("display_title ", ""));
  rejects(root, "detect affected source");

  write(".github/workflows/release.yml", workflow.replace("merge-base --is-ancestor ", ""));
  rejects(root, "detect affected source");

  write(".github/workflows/release.yml", workflow.replace("empty_tree ", ""));
  rejects(root, "detect affected source");

  write(
    ".github/workflows/release.yml",
    workflow.replace(
      "- run: echo 'actions/workflows/release.yml/runs",
      '- run: echo \'check-runs .name == "validate" actions/workflows/release.yml/runs',
    ),
  );
  rejects(root, "must not spend runner minutes polling for Validate");

  write(
    ".github/workflows/release.yml",
    workflow.replace("supabase-production-nmssogphayjymjpbnrxv", "other-lock"),
  );
  rejects(root, "serialize the production database resource");

  write(
    ".github/workflows/release.yml",
    workflow.replace(
      "      - if: needs.gate.outputs.schema_changed == 'true'\n        run: pnpm schema:remote sync",
      "      - if: needs.gate.outputs.schema_changed == 'true'\n        run: pnpm schema:remote prepare\n      - if: needs.gate.outputs.schema_changed == 'true'\n        run: pnpm schema:remote sync",
    ),
  );
  rejects(root, "auto-sync changed declarative schemas");

  write(
    ".github/workflows/release.yml",
    workflow.replace("pnpm schema:remote sync", "echo skip-sync"),
  );
  rejects(root, "auto-sync changed declarative schemas");

  write(
    ".github/workflows/release.yml",
    workflow.replace("pnpm schema:remote sync", "pnpm schema:remote sync --reviewed-plan"),
  );
  rejects(root, "plain declarative schema sync");

  write(
    ".github/workflows/release.yml",
    workflow.replace("pnpm schema:remote verify", "echo skip-verify"),
  );
  rejects(root, "auto-sync changed declarative schemas");

  write(
    ".github/workflows/release.yml",
    workflow.replace(".artifacts/supabase-remote/permission-subject-version-compat.json", ""),
  );
  rejects(root, "before evidence");

  write(
    ".github/workflows/release.yml",
    workflow.replace(".artifacts/supabase-remote/repository-runtime-compat.json", ""),
  );
  rejects(root, "before evidence");

  write(
    ".github/workflows/release.yml",
    workflow.replace("GITHUB_TOKEN: ${{ github.token }}", "RELEASE_TOKEN: ${{ github.token }}"),
  );
  rejects(root, "production deployment must follow Supabase convergence");

  write(
    ".github/workflows/release.yml",
    workflow.replace('pnpm vercel:deploy:production -- --live --sha "$SHA"', "echo skip-deploy"),
  );
  rejects(root, "production deployment must follow Supabase convergence");

  write(
    ".github/workflows/release.yml",
    workflow.replace("pnpm line:rich-menu publish all", "echo skip"),
  );
  rejects(root, "build/preview/current-main/publish");

  write(".github/workflows/release.yml", workflow.replace("cache: true", "cache: false"));
  rejects(root, "build/preview/current-main/publish");
  write(".github/workflows/release.yml", workflow);
  assert.deepEqual(validate(root), []);
});

test("main Git integration cannot bypass controlled production release", (t) => {
  const { root, write } = fixture(t);
  const config = JSON.parse(readFileSync(resolve(root, "apps/web/vercel.json"), "utf8"));
  config.git.deploymentEnabled.main = true;
  write("apps/web/vercel.json", JSON.stringify(config));
  rejects(root, "main Git integration must not bypass");
});

test("manual Supabase reconciliation binds apply to reviewed plan and shared resource lock", (t) => {
  const { root, write } = fixture(t);
  const workflow = readFileSync(resolve(root, ".github/workflows/supabase-replace.yml"), "utf8");

  write(".github/workflows/supabase-replace.yml", workflow.replace("workflow_dispatch", "push"));
  rejects(root, "must use workflow_dispatch");

  write(
    ".github/workflows/supabase-replace.yml",
    workflow.replace("supabase-production-nmssogphayjymjpbnrxv", "other-lock"),
  );
  rejects(root, "share the production database lock");

  write(
    ".github/workflows/supabase-replace.yml",
    workflow.replace("pnpm schema:remote sync --reviewed-plan", "pnpm schema:remote sync"),
  );
  rejects(root, "verify provider recovery");

  write(
    ".github/workflows/supabase-replace.yml",
    workflow.replace("pnpm schema:remote plan", "echo skip-plan"),
  );
  rejects(root, "verify provider recovery");

  write(
    ".github/workflows/supabase-replace.yml",
    workflow.replace(
      "enterprise_owner_confirmed_slug:\n        type: string",
      "enterprise_owner_confirmed_slug:\n        type: boolean",
    ),
  );
  rejects(root, "must use workflow_dispatch");

  write(
    ".github/workflows/supabase-replace.yml",
    workflow.replace("SUPABASE_LEGACY_ENTERPRISE_SLUG", "SUPABASE_OTHER_INPUT"),
  );
  rejects(root, "owner-confirmed legacy Enterprise name/slug");

  write(
    ".github/workflows/supabase-replace.yml",
    workflow.replace("actions: read", "actions: none"),
  );
  rejects(root, "exact main/target authorization");

  write(
    ".github/workflows/supabase-replace.yml",
    workflow.replace(
      "reviewed_plan_run_id:\n        type: string",
      "reviewed_plan_run_id:\n        type: boolean",
    ),
  );
  rejects(root, "must use workflow_dispatch");

  write(
    ".github/workflows/supabase-replace.yml",
    workflow.replace("pnpm schema:remote recovery", "echo skip-recovery"),
  );
  rejects(root, "verify provider recovery");

  write(
    ".github/workflows/supabase-replace.yml",
    workflow.replace("actions/runs/$REVIEWED_PLAN_RUN_ID", "actions/runs/other"),
  );
  rejects(root, "verify provider recovery");

  write(
    ".github/workflows/supabase-replace.yml",
    workflow.replace("recoveryEvidenceSha256", "missingRecoveryEvidenceSha256"),
  );
  rejects(root, "verify provider recovery");

  write(
    ".github/workflows/supabase-replace.yml",
    workflow.replace(
      "workflowRunId planSha256 enterpriseIdentitySha256",
      "workflowRunId missingPlanSha enterpriseIdentitySha256",
    ),
  );
  rejects(root, "verify provider recovery");

  write(
    ".github/workflows/supabase-replace.yml",
    workflow.replace("manual-authorization.json", "missing-auth.json"),
  );
  rejects(root, "verify provider recovery");

  write(
    ".github/workflows/supabase-replace.yml",
    workflow.replace("pnpm schema:remote prepare", "echo skip-prepare"),
  );
  rejects(root, "verify provider recovery");

  write(".github/workflows/supabase-replace.yml", workflow);
  write(".github/workflows/rich-menu.yml", "name: duplicate\n");
  rejects(root, "retired external workflow");
});
test("required AGENTS scopes exist and root routes to each owner", (t) => {
  const { root, write } = fixture(t);
  write(
    "AGENTS.md",
    "[Packages](packages/AGENTS.md) [GitHub](.github/AGENTS.md) [Skills](.agents/AGENTS.md) [Codex](.codex/AGENTS.md)\n",
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
    "# @line-work/demo\n\n- 本 package 是 owning context 的公開入口；Web 與其他 consumer 只可使用 package.json 已宣告 exports。\n- domain / application / contracts / adapters / agents surface 依需求存在，不預建空 layer。\n- 目前 facade 只為無行為變更遷移；新增功能直接放入此 context，禁止新增 legacy horizontal export。\n- 移除 facade 前必須保留型別、授權、交易、重播、隔離與既有測試。\n",
  );
  rejects(root, "duplicated package boilerplate belongs in packages/AGENTS.md");
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
  write("packages/platform/package.json", '{"name":"@line-work/platform","scripts":{}}');
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
test("skill frontmatter rejects wrong folder", (t) => {
  const { root, write } = fixture(t);
  write(".agents/skills/demo/SKILL.md", "---\nname: other\ndescription: example\n---\n");
  rejects(root, "mismatch");
});
test("reviewer cannot gain write access", (t) => {
  const { root, write } = fixture(t);
  write(
    ".codex/agents/reviewer.toml",
    'name="change-reviewer"\ndescription="review"\ndeveloper_instructions="review only"\nsandbox_mode="workspace-write"\n',
  );
  rejects(root, "read-only");
});
test("invalid TOML fails", (t) => {
  const { root, write } = fixture(t);
  write(".codex/config.toml", "[agents");
  assert.ok(validate(root).length);
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
    write(".codex/config.toml", content);
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
test("BOM and CRLF metadata pass", (t) => {
  const { root, write } = fixture(t);
  write(".codex/config.toml", "\uFEFF[agents]\r\nmax_threads = 2\r\n");
  write(
    ".agents/skills/demo/SKILL.md",
    "\uFEFF---\r\nname: demo\r\ndescription: example\r\n---\r\n",
  );
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
  symlinkSync(outside.root, resolve(root, "scripts/link"), "junction");
  write("scripts/check.mjs", importing("./link/target.mjs"));
  rejects(root, "import outside repository");
  write("scripts/check.mjs", importing("./link/missing.mjs"));
  rejects(root, "import outside repository");
});
