// Offline metadata checks; never load application code or environment files.
import { spawnSync } from "node:child_process";
import { existsSync, globSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "smol-toml";
import ts from "typescript";
import YAML from "yaml";
import { validationGroups } from "./validate.mjs";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const read = (file) => readFileSync(file, "utf8");

function literalModuleSpecifiers(file) {
  const source = read(file);
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const specifiers = [];
  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      specifiers.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return specifiers;
}
const repositoryTextPatterns = [
  "*.{md,json,jsonc,yml,yaml,toml,mjs,js,ts,tsx,sql,css,html,txt}",
  ".github/**/*.{md,yml,yaml}",
  ".agents/**/*.{md,json,yml,yaml}",
  ".codex/**/*.{md,toml,rules}",
  "apps/**/*.{md,json,jsonc,yml,yaml,toml,mjs,js,ts,tsx,sql,css,html,txt}",
  "architecture/**/*.{md,json,jsonc}",
  "docs/**/*.md",
  "packages/**/*.{md,json,jsonc,yml,yaml,toml,mjs,js,ts,tsx,sql,css,html,txt}",
  "scripts/**/*.{md,json,jsonc,yml,yaml,toml,mjs,js,ts,tsx,sql,css,html,txt}",
  "supabase/**/*.{md,sql,toml}",
];
const table = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const retiredProjectIdentities = [
  { label: "workspace namespace", value: `${["@line", "work"].join("-")}/` },
  { label: "system id", value: ["line", "work", "assistant"].join("-") },
  { label: "English display name", value: ["LINE", "Work", "Assistant"].join(" ") },
  { label: "Chinese display name", value: ["LINE", ["工作", "助手"].join("")].join(" ") },
  { label: "short Chinese display name", value: ["工作", "助手"].join("") },
  { label: "legacy Rich Menu prefix", value: `${["work", "assistant"].join("-")}-` },
  { label: "legacy provider slug", value: `${["line", "work"].join("-")}-` },
  { label: "legacy runtime prefix", value: `${["line", "bot"].join("-")}:` },
  {
    label: "legacy schema operator",
    value: `${["line", "bot"].join("-")}-schema-operator`,
  },
];

export function validate(root) {
  root = realpathSync(root);
  const errors = [];
  const files = (pattern) =>
    globSync(pattern, { cwd: root })
      .sort()
      .map((file) => resolve(root, file));
  try {
    const repositoryTextFiles = new Set(
      repositoryTextPatterns.flatMap((pattern) => files(pattern)),
    );
    for (const file of repositoryTextFiles) {
      const source = read(file);
      const path = relative(root, file).split(sep).join("/");
      if (source.startsWith("\uFEFF"))
        errors.push(`${path}: repository text must be UTF-8 without BOM`);
      if (source.includes("\r")) errors.push(`${path}: repository text must use LF line endings`);
      for (const retired of retiredProjectIdentities) {
        if (source.includes(retired.value))
          errors.push(`${path}: retired project ${retired.label} is forbidden in current surfaces`);
      }
    }

    const scriptDirectories = globSync("scripts/**", { cwd: root })
      .filter((entry) => statSync(resolve(root, entry)).isDirectory())
      .sort();
    for (const directory of scriptDirectories) {
      if (!existsSync(resolve(root, directory, "README.md"))) {
        errors.push(
          `${directory}/README.md: every scripts directory requires a local script index`,
        );
      }
    }

    const manifest = JSON.parse(read(resolve(root, "package.json")));
    const workspace = YAML.parse(read(resolve(root, "pnpm-workspace.yaml")));
    const exact = /^\d+\.\d+\.\d+$/;
    const engines = manifest.engines ?? {};
    const nodeVersionFile = resolve(root, ".node-version");
    const exactNodeVersion = existsSync(nodeVersionFile) ? read(nodeVersionFile).trim() : "";
    if (!exact.test(exactNodeVersion))
      errors.push(".node-version: exact repository Node version is required");
    const exactNodeMajor = exactNodeVersion.match(/^(\d+)\./)?.[1];
    if (!exactNodeMajor || engines.node !== `${exactNodeMajor}.x`)
      errors.push(
        `package.json: engines.node must match the .node-version major as ${exactNodeMajor ?? "<major>"}.x`,
      );
    if (!exact.test(engines.pnpm ?? ""))
      errors.push("package.json: engines.pnpm must be an exact version");
    if (manifest.packageManager !== `pnpm@${engines.pnpm}`)
      errors.push("package.json: packageManager must match engines.pnpm");
    for (const name of ["engineStrict", "saveExact"]) {
      if (workspace[name] !== true) errors.push(`pnpm-workspace.yaml: ${name} must remain true`);
    }
    if (workspace.verifyDepsBeforeRun !== "error")
      errors.push("pnpm-workspace.yaml: verifyDepsBeforeRun must remain error");
    const catalog = workspace.catalog ?? {};
    for (const [name, version] of Object.entries(catalog)) {
      if (!exact.test(version)) errors.push(`catalog: ${name} must have an exact version`);
    }
    const manifests = new Map(
      [
        resolve(root, "package.json"),
        ...workspace.packages.flatMap((pattern) => files(`${pattern}/package.json`)),
      ].map((file) => [file, JSON.parse(read(file))]),
    );
    const internal = new Set([...manifests.values()].map((data) => data.name));
    if (manifest.scripts?.["schema:check"] !== "turbo run schema:check")
      errors.push("package.json: schema:check must delegate to the Turbo task owner");
    if (manifest.scripts?.check !== "node scripts/tooling/validate.mjs --fast")
      errors.push("package.json: check must remain the canonical read-only fast validation entry");
    if (manifest.scripts?.validate !== "node scripts/tooling/validate.mjs")
      errors.push(
        "package.json: validate must remain the canonical read-only full validation entry",
      );
    if (manifest.scripts?.lint !== "biome check .")
      errors.push("package.json: lint must remain the canonical read-only Biome check");
    if (manifest.scripts?.format !== "biome check --write .")
      errors.push(
        "package.json: format must apply canonical Biome formatter, lint and assist fixes",
      );
    if (manifest.scripts?.deadcode !== "knip")
      errors.push("package.json: deadcode must remain the canonical Knip reachability check");
    if (manifest.scripts?.semantic !== "node scripts/architecture/semantic-cli.mjs")
      errors.push("package.json: semantic must remain the single semantic command namespace");
    const semanticAliases = Object.keys(manifest.scripts ?? {}).filter((name) =>
      name.startsWith("semantic:"),
    );
    if (semanticAliases.length)
      errors.push("package.json: semantic:* aliases are forbidden; use pnpm semantic <verb>");
    if (manifest.scripts?.["patch:apply"] !== "node scripts/changes/patch-apply.mjs")
      errors.push("package.json: patch:apply must own deterministic repository patch execution");
    if (manifest.scripts?.["change:status"] !== "node scripts/changes/status.mjs")
      errors.push("package.json: change:status must own read-only local change state");
    if (manifest.scripts?.["change:impact"] !== "pnpm semantic plan")
      errors.push("package.json: change:impact must delegate to the semantic planning authority");
    if (manifest.scripts?.["change:preflight"] !== "node scripts/changes/preflight.mjs")
      errors.push("package.json: change:preflight must own local merge-readiness checks");
    if (manifest.scripts?.["change:finalize"] !== "node scripts/changes/finalize.mjs")
      errors.push(
        "package.json: change:finalize must own preflight plus canonical full validation",
      );
    if (manifest.scripts?.["tooling:doctor"] !== "node scripts/tooling/doctor.mjs")
      errors.push("package.json: tooling:doctor must own developer toolchain diagnosis");
    if (
      manifest.scripts?.["vercel:deploy:production"] !== "node scripts/vercel/deploy-production.mjs"
    )
      errors.push(
        "package.json: vercel:deploy:production must own controlled production deployment",
      );
    if (manifest.scripts?.["github:current-main"] !== "node scripts/github/current-main.mjs")
      errors.push("package.json: github:current-main must own exact-main GitHub readback");
    if (manifest.scripts?.["github:release-plan"] !== "node scripts/github/release-plan.mjs")
      errors.push("package.json: github:release-plan must own Release affected-source routing");
    if (Object.hasOwn(manifest.scripts ?? {}, "change:plan"))
      errors.push(
        "package.json: change:plan is retired; semantic planning and patch application are separate responsibilities",
      );
    const validationSource = read(resolve(root, "scripts/tooling/validate.mjs"));
    for (const mutableCommand of [
      "schema:local",
      "schema:remote",
      "line:rich-menu",
      "vercel:deploy:production",
      "format",
    ]) {
      const hasQuotedCommand =
        validationSource.includes(`"${mutableCommand}"`) ||
        validationSource.includes(`'${mutableCommand}'`);
      if (hasQuotedCommand)
        errors.push(
          `scripts/tooling/validate.mjs: validation must not invoke mutable operation ${mutableCommand}`,
        );
    }
    const platformManifest = manifests.get(resolve(root, "packages/platform/package.json"));
    if (platformManifest && typeof platformManifest.scripts?.["schema:check"] !== "string")
      errors.push("@line_bot_v1/platform: schema:check task owner is required");
    const uses = new Map();
    for (const [file, data] of manifests) {
      for (const section of [
        "dependencies",
        "devDependencies",
        "optionalDependencies",
        "peerDependencies",
      ]) {
        for (const [name, version] of Object.entries(data[section] ?? {})) {
          if (!uses.has(name)) uses.set(name, new Set());
          uses.get(name).add(file);
          const valid = internal.has(name)
            ? version === "workspace:*"
            : Object.hasOwn(catalog, name)
              ? version === "catalog:"
              : exact.test(version);
          if (!valid)
            errors.push(
              `${relative(root, file)}: ${name} must use workspace:*, its catalog entry, or an exact external version`,
            );
        }
      }
      for (const name of [
        "package-lock.json",
        "npm-shrinkwrap.json",
        "yarn.lock",
        "bun.lock",
        "bun.lockb",
        "pnpm-lock.yaml",
      ]) {
        if (
          existsSync(resolve(dirname(file), name)) &&
          !(dirname(file) === root && name === "pnpm-lock.yaml")
        )
          errors.push(`${relative(root, dirname(file))}/${name}: extra lockfile`);
      }
    }
    for (const [name, locations] of uses) {
      if (locations.size > 1 && !internal.has(name) && !Object.hasOwn(catalog, name))
        errors.push(`${name}: shared dependency must be in catalog`);
    }
    const biome = JSON.parse(read(resolve(root, "biome.json")));
    const configured = manifest.devDependencies["@biomejs/biome"];
    const version = configured === "catalog:" ? catalog["@biomejs/biome"] : configured;
    if (biome.$schema !== `https://biomejs.dev/schemas/${version}/schema.json`)
      errors.push("biome.json: schema version must match Biome");
    if (biome.assist?.actions?.source?.organizeImports !== "on")
      errors.push("biome.json: organizeImports must remain enabled");
    const knipSource = read(resolve(root, "knip.jsonc"));
    if (!knipSource.includes('"$schema": "https://unpkg.com/knip@6/schema-jsonc.json"'))
      errors.push("knip.jsonc: Knip 6 schema contract is required");
    if (/(?:^|[{,])\s*"ignore"\s*:/.test(knipSource))
      errors.push(
        "knip.jsonc: broad ignore is forbidden; fix ownership, entry points or typed ignore* rules",
      );
    const vscodeSettings = JSON.parse(read(resolve(root, ".vscode/settings.json")));
    for (const language of [
      "javascript",
      "typescript",
      "javascriptreact",
      "typescriptreact",
      "json",
      "jsonc",
    ]) {
      const settings = vscodeSettings[`[${language}]`] ?? {};
      if (
        settings["editor.defaultFormatter"] !== "biomejs.biome" ||
        settings["editor.formatOnSave"] !== true
      )
        errors.push(`.vscode/settings.json: ${language} must format on save with Biome`);
    }
    const codeActions = vscodeSettings["editor.codeActionsOnSave"] ?? {};
    for (const action of ["source.fixAll.biome", "source.organizeImports.biome"]) {
      if (codeActions[action] !== "explicit")
        errors.push(`.vscode/settings.json: ${action} must run on explicit save`);
    }
    const vscodeExtensions = JSON.parse(read(resolve(root, ".vscode/extensions.json")));
    if (!(vscodeExtensions.recommendations ?? []).includes("biomejs.biome"))
      errors.push(".vscode/extensions.json: Biome extension must be recommended");
    const envExampleSource = read(resolve(root, ".env.example"));
    for (const name of [
      "POSTGRES_URL",
      "POSTGRES_URL_NON_POOLING",
      "SUPABASE_URL",
      "KV_REST_API_URL",
      "KV_REST_API_TOKEN",
    ]) {
      if (!new RegExp(`^\\s*${name}\\s*=`, "m").test(envExampleSource))
        errors.push(`.env.example: missing current environment variable: ${name}`);
    }

    const vercelConfig = JSON.parse(read(resolve(root, "apps/web/vercel.json")));
    const deploymentEnabled = vercelConfig.git?.deploymentEnabled ?? {};
    if (deploymentEnabled.main !== false)
      errors.push(
        "apps/web/vercel.json: main Git integration must not bypass the controlled production release",
      );
    if (deploymentEnabled.preview !== true || deploymentEnabled["preview/**"] !== true)
      errors.push("apps/web/vercel.json: preview Git deployments must remain available");

    const remoteMigrationCommand =
      /\bsupabase(?:\.exe)?\s+(?:db\s+push|db\s+reset\b[^\n]*--linked|migration\s+(?:up|repair))\b/i;
    const remoteCommandSources = [
      resolve(root, "package.json"),
      ...files(".github/workflows/*.{yml,yaml}"),
      ...files("scripts/**/*.{mjs,ts}"),
    ];
    for (const file of remoteCommandSources) {
      if (remoteMigrationCommand.test(read(file)))
        errors.push(
          `${relative(root, file)}: remote Supabase migration-history command is forbidden; use schema reconciliation`,
        );
    }
    for (const file of files("supabase/migrations/**/*.sql"))
      errors.push(
        `${relative(root, file)}: remote migration files are not a current repository contract`,
      );

    const retiredUserVocabulary = new RegExp(
      [
        ["user", "account"].join(""),
        ["user", "_account"].join(""),
        ["user", "-account"].join(""),
        ["user", " account"].join(""),
        ["human", " account"].join(""),
        ["human", "_account"].join(""),
        ["human", "-account"].join(""),
        ["human", " facet"].join(""),
        ["human", "-facet"].join(""),
        ["human", "_facet"].join(""),
        ["human", " product-account"].join(""),
        ["human", " product account"].join(""),
      ]
        .map((value) => `${value}s?`)
        .concat([
          ["使用者", "帳號"].join(""),
          ["人類", " facet"].join(""),
          ["人類", "帳號"].join(""),
          ["人類", "產品帳號"].join(""),
          ["人的", "產品帳號"].join(""),
        ])
        .join("|"),
      "i",
    );
    const retiredHumanAccountPath = ["user", "account"].join("-");
    const externalDomainTruthPrefix = "architecture/domain/fpt/";
    const historicalUserVocabularyDocuments = new Set([
      "docs/change/evidence/schema-history-extraction.md",
      "docs/change/evidence/account-expansion-extraction.md",
      "docs/change/evidence/four-model-cutover-validation.md",
      "docs/change/evidence/atomic-schema-remote-convergence.md",
    ]);
    const currentDocumentationSources = files("docs/**/*.md").filter(
      (file) => !historicalUserVocabularyDocuments.has(relative(root, file).split(sep).join("/")),
    );
    const currentUserVocabularySources = [
      ...files("*.{md,json,jsonc,yml,yaml,toml}"),
      ...files(".github/workflows/*.{yml,yaml}"),
      ...files("architecture/**/*.{json,jsonc}"),
      ...files("packages/**/*.{ts,tsx,mts,cts,js,mjs,cjs,md,json,jsonc}"),
      ...files("apps/**/*.{ts,tsx,mts,cts,js,mjs,cjs,md,json,jsonc}"),
      ...files("scripts/**/*.{ts,tsx,mts,cts,js,mjs,cjs,md,sql,json,jsonc}"),
      ...files("supabase/**/*.{sql,md,toml}"),
      ...currentDocumentationSources,
    ];
    const retiredDocPrefixes = [
      ["docs", "000-core"].join("/"),
      ["docs", "010-domain-owners"].join("/"),
      ["docs", "020-architecture"].join("/"),
      ["docs", "030-platform"].join("/"),
      ["docs", "040-data"].join("/"),
      ["docs", "050-security"].join("/"),
      ["docs", "060-engineering"].join("/"),
      ["docs", "070-operations"].join("/"),
      ["docs", "090-governance"].join("/"),
    ];
    for (const file of new Set(currentUserVocabularySources)) {
      const relativePath = relative(root, file).split(sep).join("/");
      if (relativePath.startsWith(externalDomainTruthPrefix)) continue;
      const source = read(file);
      if (
        retiredUserVocabulary.test(source) ||
        relative(root, file).includes(retiredHumanAccountPath)
      ) {
        errors.push(
          `${relative(root, file)}: retired User vocabulary is forbidden in current repository surfaces; use User/users`,
        );
      }
      for (const prefix of retiredDocPrefixes) {
        if (source.includes(`${prefix}/`)) {
          errors.push(
            `${relative(root, file)}: retired documentation path ${prefix}/ is forbidden in current repository surfaces`,
          );
        }
      }
    }

    const rootAgentsFile = resolve(root, "AGENTS.md");
    const scopeAgents = [
      "packages/AGENTS.md",
      "scripts/AGENTS.md",
      ".github/AGENTS.md",
      ".codex/AGENTS.md",
    ];
    const rootAgentsSource = existsSync(rootAgentsFile) ? read(rootAgentsFile) : "";
    for (const path of scopeAgents) {
      if (!existsSync(resolve(root, path))) errors.push(`${path}: scope contract is required`);
      if (!rootAgentsSource.includes(`(${path})`))
        errors.push(`AGENTS.md: root must route to ${path}`);
    }
    for (const packageDir of files("packages/*").filter((path) => statSync(path).isDirectory())) {
      const packagePath = relative(root, packageDir).split(sep).join("/");
      for (const name of ["AGENTS.md", "README.md"]) {
        if (!existsSync(resolve(packageDir, name)))
          errors.push(`${packagePath}/${name}: package scope entrypoint is required`);
      }
    }

    const duplicatedPackageBoilerplate = [
      "本 package 是 owning context 的公開入口；Web 與其他 consumer 只可使用 package.json 已宣告 exports。",
      "domain / application / contracts / adapters / agents surface 依需求存在，不預建空 layer。",
      "目前 facade 只為無行為變更遷移；新增功能直接放入此 context，禁止新增 legacy horizontal export。",
      "移除 facade 前必須保留型別、授權、交易、重播、隔離與既有測試。",
    ];
    for (const file of files("packages/*/AGENTS.md")) {
      const source = read(file);
      if (duplicatedPackageBoilerplate.every((line) => source.includes(line)))
        errors.push(
          `${relative(root, file)}: duplicated package boilerplate belongs in packages/AGENTS.md`,
        );
    }

    const hotPathTargetHeading =
      /^#{1,6}\s+.*(?:target|proposal|future|planned|remaining target|後續實作|未來目標|目標設計).*$/im;
    for (const file of files("**/AGENTS.md").filter(
      (file) => !relative(root, file).split(sep).join("/").startsWith(".agents/skills/"),
    )) {
      const source = read(file);
      if (hotPathTargetHeading.test(source))
        errors.push(
          `${relative(root, file)}: target/proposal design belongs in docs/change, not AGENTS hot-path context`,
        );
    }

    const webProject = resolve(root, "apps/web/package.json");
    if (existsSync(webProject)) {
      for (const name of ["instrumentation.ts", "instrumentation-client.ts"]) {
        if (!existsSync(resolve(root, "apps/web", name)))
          errors.push(
            `apps/web/${name}: Next/Sentry framework entrypoint must live at project root`,
          );
        if (existsSync(resolve(root, "apps/web/src", name)))
          errors.push(`apps/web/src/${name}: duplicate framework entrypoint is forbidden`);
      }
    }

    const turbo = JSON.parse(read(resolve(root, "turbo.json")));
    if ((turbo.globalEnv ?? []).length)
      errors.push("turbo.json: product configuration must not use globalEnv");
    if ((turbo.globalDependencies ?? []).includes(".env.local"))
      errors.push("turbo.json: .env.local must not invalidate every workspace task");
    const testInputs = turbo.tasks?.test?.inputs ?? [];
    if (!testInputs.includes("$TURBO_ROOT$/supabase/schemas/*.sql"))
      errors.push(
        "turbo.json: product tests must hash declarative schemas so SQL changes cannot reuse stale test cache",
      );
    const webBuild = turbo.tasks?.["@line_bot_v1/web#build"] ?? {};
    const webBuildEnv = webBuild.env ?? [];
    const webBuildInputs = webBuild.inputs ?? [];
    const webBuildPassThroughEnv = webBuild.passThroughEnv ?? [];
    for (const name of ["NEXT_PUBLIC_*", "VERCEL", "VERCEL_ENV", "SENTRY_ORG", "SENTRY_PROJECT"]) {
      if (!webBuildEnv.includes(name))
        errors.push(`turbo.json: Web build must hash build-time environment ${name}`);
    }
    if (!webBuildPassThroughEnv.includes("SENTRY_AUTH_TOKEN"))
      errors.push("turbo.json: Web build must pass through SENTRY_AUTH_TOKEN");
    if (webBuildEnv.includes("SENTRY_AUTH_TOKEN"))
      errors.push("turbo.json: Web build must not hash SENTRY_AUTH_TOKEN");
    if (!webBuildInputs.includes("$TURBO_ROOT$/.env.local"))
      errors.push("turbo.json: Web build must hash the root local env file");
    if (
      webBuildEnv.some((name) =>
        /^(?:POSTGRES_|REDIS_|KV_|GEMINI_API_KEY|ATTENDANCE_WORKER_SECRET|LINE_CHANNEL_)/.test(
          name,
        ),
      )
    )
      errors.push(
        "turbo.json: runtime/operator secrets must not enter the Web build cache contract",
      );

    for (const workflowFile of files(".github/workflows/*.{yml,yaml}")) {
      const workflowData = YAML.parse(read(workflowFile));
      const setupNodeSteps = Object.values(workflowData.jobs ?? {}).flatMap((job) =>
        (job?.steps ?? []).filter((step) => step.uses?.startsWith("actions/setup-node@")),
      );
      if (
        setupNodeSteps.some(
          (step) =>
            step.with?.["node-version-file"] !== ".node-version" ||
            Object.hasOwn(step.with ?? {}, "node-version"),
        )
      )
        errors.push(
          `${relative(root, workflowFile)}: actions/setup-node must use the repository .node-version exact pin`,
        );
    }

    const validateWorkflowFile = resolve(root, ".github/workflows/validate.yml");
    const validateWorkflowSource = read(validateWorkflowFile);
    const workflow = YAML.parse(validateWorkflowSource);
    const permissions = workflow.permissions;
    if (
      permissions !== "read-all" &&
      (!table(permissions) ||
        permissions.contents !== "read" ||
        Object.values(permissions).some((value) => value === "write"))
    )
      errors.push("CI: validate workflow must use read-only token permissions");
    if (/\$\{\{\s*secrets\./.test(validateWorkflowSource))
      errors.push("CI: validate workflow must not consume repository secrets");
    if (/^\s*VERCEL:\s*["']?1["']?\s*$/m.test(validateWorkflowSource))
      errors.push("CI: GitHub validation must not impersonate the Vercel runtime");
    const fullValidateJob = workflow.jobs?.["full-validate"];
    const validateJob = workflow.jobs?.validate;
    if (!fullValidateJob || !validateJob || workflow.jobs?.check)
      errors.push(
        "CI: validation workflow must have one parallel full validation owner plus its aggregate gate",
      );
    if (!Object.hasOwn(workflow.on ?? {}, "workflow_call") || workflow.on?.push)
      errors.push(
        "CI: main validation must be called by Release without a duplicate push workflow",
      );
    const validationJobs = Object.values(workflow.jobs ?? {}).filter(
      (job) =>
        job !== validateJob ||
        (job.steps ?? []).some((step) => step.uses?.startsWith("actions/checkout@")),
    );
    for (const job of validationJobs) {
      const checkout = (job.steps ?? []).find((step) => step.uses?.startsWith("actions/checkout@"));
      if (checkout?.with?.["persist-credentials"] !== false)
        errors.push("CI: validation checkout must not persist credentials");
      if (checkout?.with?.["fetch-depth"] !== 0)
        errors.push("CI: validation requires full Git history");
      if (checkout?.with?.ref !== "${{ github.event.pull_request.head.sha || github.sha }}")
        errors.push("CI: validation must check out the exact PR or main SHA");
    }
    const pullRequestTypes = workflow.on?.pull_request?.types;
    if (!pullRequestTypes?.includes("synchronize") || !pullRequestTypes?.includes("ready_for_review"))
      errors.push("CI: PR validation must cover every review-ready head update");
    const fullCondition =
      "(github.event_name == 'push' && github.ref == 'refs/heads/main') || (github.event_name == 'pull_request' && github.event.pull_request.draft == false)";
    if (
      fullValidateJob?.if !== fullCondition ||
      fullValidateJob?.needs ||
      fullValidateJob?.strategy?.["fail-fast"] !== false ||
      JSON.stringify(fullValidateJob?.strategy?.matrix?.group) !==
        JSON.stringify(Object.keys(validationGroups)) ||
      !(fullValidateJob?.steps ?? []).some(
        (step) =>
          step.run === 'pnpm validate --group "$VALIDATION_GROUP"' &&
          step.env?.VALIDATION_GROUP === "${{ matrix.group }}",
      )
    )
      errors.push(
        "CI: main and every non-draft pull-request head must run every canonical validation group in parallel",
      );
    if (
      validateJob?.needs !== "full-validate" ||
      validateJob?.if !== "always() && (" + fullCondition + ")" ||
      !(validateJob?.steps ?? []).some(
        (step) =>
          step.env?.RESULT === "${{ needs.full-validate.result }}" &&
          step.run === "node scripts/github/validation-result.mjs",
      )
    )
      errors.push("CI: aggregate validation must reject failed, cancelled or skipped groups");

    for (const retiredWorkflow of [
      ".github/workflows/supabase-schema.yml",
      ".github/workflows/rich-menu.yml",
      ".github/workflows/supabase-schema-replace.yml",
    ]) {
      if (existsSync(resolve(root, retiredWorkflow)))
        errors.push(
          `CI: retired external workflow must not reintroduce a second owner: ${retiredWorkflow}`,
        );
    }

    const releaseWorkflowFile = resolve(root, ".github/workflows/release.yml");
    const releaseWorkflowSource = read(releaseWorkflowFile);
    const releaseWorkflow = YAML.parse(releaseWorkflowSource);
    if (releaseWorkflow["run-name"] !== "Release ${{ github.sha }}")
      errors.push("CI: Release run-name must preserve the validated SHA for routing baseline");
    const releaseTriggers = releaseWorkflow.on;
    if (
      JSON.stringify(Object.keys(releaseTriggers ?? {})) !== JSON.stringify(["push"]) ||
      JSON.stringify(releaseTriggers?.push?.branches) !== JSON.stringify(["main"])
    )
      errors.push("CI: Release must accept only main push events");
    if (releaseWorkflow.concurrency)
      errors.push("CI: Release must lock individual resources, not the whole workflow");
    const validation = releaseWorkflow.jobs?.validation;
    if (
      validation?.uses !== "./.github/workflows/validate.yml" ||
      validation.needs ||
      validation.if ||
      validation.secrets ||
      JSON.stringify(validation.permissions) !== JSON.stringify({ contents: "read" })
    )
      errors.push("CI: Release must start secret-free full validation independently of planning");
    const releasePermissions = releaseWorkflow.permissions;
    if (
      !table(releasePermissions) ||
      releasePermissions.contents !== "read" ||
      releasePermissions.actions !== "read" ||
      releasePermissions.checks !== "read" ||
      releasePermissions.statuses !== "read" ||
      Object.values(releasePermissions).some((value) => value === "write")
    )
      errors.push("CI: Release workflow must keep read-only GitHub permissions");

    const releasePlan = releaseWorkflow.jobs?.release_plan;
    const releaseSupabase = releaseWorkflow.jobs?.supabase;
    const releaseDeployment = releaseWorkflow.jobs?.deployment;
    const releaseRich = releaseWorkflow.jobs?.rich_menu;
    const releaseScheduler = releaseWorkflow.jobs?.attendance_scheduler;
    if (
      !releasePlan ||
      !releaseSupabase ||
      !releaseDeployment ||
      !releaseRich ||
      !releaseScheduler
    ) {
      errors.push("CI: Release must define planning and one job per external operation");
    }

    const forbiddenInlineReleaseLogic = [
      "gh api ",
      "git diff ",
      "git merge-base ",
      "git cat-file ",
      "turbo query affected",
      "find_owner_baseline",
      "release-runs.tsv",
      "grep -E",
    ];
    if (forbiddenInlineReleaseLogic.some((token) => releaseWorkflowSource.includes(token))) {
      errors.push(
        "CI: release.yml must remain a thin adapter and call canonical GitHub operation commands instead of implementing routing logic inline",
      );
    }

    const planSteps = releasePlan?.steps ?? [];
    if (
      releasePlan?.if !== "github.event_name == 'push' && github.ref == 'refs/heads/main'" ||
      releasePlan.needs
    ) {
      errors.push("CI: release_plan must run on main push in parallel with validation");
    }
    for (const job of [releaseSupabase, releaseDeployment, releaseRich, releaseScheduler]) {
      if (
        !job?.needs?.includes("validation") ||
        !job?.needs?.includes("release_plan") ||
        !job?.if?.includes("needs.validation.result == 'success'") ||
        !job?.if?.includes("needs.release_plan.result == 'success'")
      )
        errors.push(
          "CI: every external operation must require successful same-SHA validation and planning",
        );
      const checkout = (job?.steps ?? []).find((step) =>
        step.uses?.startsWith("actions/checkout@"),
      );
      if (
        checkout?.with?.ref !== "${{ needs.release_plan.outputs.head_sha }}" ||
        checkout?.with?.["persist-credentials"] !== false
      )
        errors.push(
          "CI: every external operation must check out the exact planned SHA without persisted credentials",
        );
    }
    for (const [job, resource] of [
      [releaseRich, "line-rich-menu-production"],
      [releaseDeployment, "vercel-production-mini-app-line"],
    ]) {
      if (
        job?.concurrency?.group !== resource ||
        job?.concurrency?.["cancel-in-progress"] !== false
      )
        errors.push(
          "CI: LINE and Vercel must serialize their own resource without cancelling writes",
        );
    }
    const releaseCheckout = planSteps.findIndex(
      (step) =>
        step.uses?.startsWith("actions/checkout@") &&
        step.with?.ref === "${{ github.sha }}" &&
        step.with?.["fetch-depth"] === 0 &&
        step.with?.["persist-credentials"] === false,
    );
    const planCommand = planSteps.findIndex(
      (step) =>
        step.run === 'pnpm github:release-plan --sha "$SHA"' &&
        JSON.stringify(step.env ?? {}).includes("GITHUB_TOKEN") &&
        JSON.stringify(step.env ?? {}).includes("GITHUB_REPOSITORY"),
    );
    if (releaseCheckout < 0 || planCommand <= releaseCheckout) {
      errors.push(
        "CI: release_plan must checkout exact validated history and delegate routing to github:release-plan",
      );
    }

    const currentMainIndex = (steps) =>
      steps.findIndex(
        (step) =>
          step.run === 'pnpm github:current-main --sha "$SHA"' &&
          JSON.stringify(step.env ?? {}).includes("GITHUB_TOKEN") &&
          JSON.stringify(step.env ?? {}).includes("GITHUB_REPOSITORY"),
      );

    if (
      !releaseSupabase?.if?.includes("needs.release_plan.outputs.schema_changed == 'true'") ||
      releaseSupabase?.env?.SUPABASE_REMOTE_MUTATION_CONTEXT !== "validated-main" ||
      JSON.stringify(releaseSupabase?.env ?? {}).includes("secrets.")
    )
      errors.push("CI: Supabase must run only for changed schema with step-scoped secrets");
    if (
      releaseSupabase?.concurrency?.group !== "supabase-production-nmssogphayjymjpbnrxv" ||
      releaseSupabase?.concurrency?.["cancel-in-progress"] !== false
    ) {
      errors.push("CI: automatic Supabase release must serialize the production database resource");
    }
    const supabaseSteps = releaseSupabase?.steps ?? [];
    const sync = supabaseSteps.findIndex((step) => step.run === "pnpm schema:remote sync");
    const main = currentMainIndex(supabaseSteps);
    const remoteCommands = supabaseSteps.filter((step) => step.run?.includes("schema:remote"));
    if (remoteCommands.length !== 1 || sync < 0) {
      errors.push("CI: automatic Release must use plain declarative schema sync only");
    }
    if (main < 0 || sync <= main) errors.push("CI: Supabase must guard current main before sync");
    if (
      !supabaseSteps.some(
        (step) =>
          step.uses === "actions/upload-artifact@v4" &&
          step.if === "always()" &&
          JSON.stringify(step.with ?? {}).includes("migration-history.before.txt") &&
          JSON.stringify(step.with ?? {}).includes("migration-history.after.txt"),
      )
    ) {
      errors.push("CI: Supabase must preserve migration-history evidence even on failure");
    }
    const schemaReady =
      "(needs.supabase.result == 'success' || (needs.release_plan.outputs.schema_changed != 'true' && needs.supabase.result == 'skipped'))";
    const webReady =
      "(needs.deployment.result == 'success' || (needs.release_plan.outputs.web_affected != 'true' && needs.deployment.result == 'skipped'))";
    const deploymentSteps = releaseDeployment?.steps ?? [];
    const deploymentMain = currentMainIndex(deploymentSteps);
    const productionDeploy = deploymentSteps.findIndex(
      (step) =>
        step.run === 'pnpm vercel:deploy:production --live --sha "$SHA"' &&
        JSON.stringify(step.env ?? {}).includes("GITHUB_TOKEN") &&
        JSON.stringify(step.env ?? {}).includes("VERCEL_TOKEN"),
    );
    if (
      !releaseDeployment?.if?.includes("always()") ||
      !releaseDeployment.if.includes("needs.release_plan.outputs.web_affected == 'true'") ||
      !releaseDeployment.if.includes(schemaReady) ||
      !releaseDeployment.needs?.includes("supabase") ||
      deploymentMain < 0 ||
      productionDeploy <= deploymentMain
    ) {
      errors.push(
        "CI: production deployment must be Web-affected only, follow Supabase contract convergence or unchanged skip, and invoke the Vercel owner after current-main guard",
      );
    }
    const richSteps = releaseRich?.steps ?? [];
    const richMain = currentMainIndex(richSteps);
    const publish = richSteps.findIndex((step) => step.run === "pnpm line:rich-menu publish all");
    if (
      JSON.stringify(releaseRich?.needs) !== JSON.stringify(["release_plan", "validation"]) ||
      !releaseRich?.if?.includes("needs.release_plan.outputs.rich_menu_changed == 'true'") ||
      richMain < 0 ||
      publish <= richMain ||
      !JSON.stringify(richSteps[publish]?.env ?? {}).includes("LINE_CHANNEL_ACCESS_TOKEN") ||
      JSON.stringify(releaseRich).includes("SUPABASE_") ||
      releaseWorkflow.jobs?.rich_menu_direct ||
      releaseWorkflow.jobs?.rich_menu_after_deployment
    ) {
      errors.push(
        "CI: Rich Menu must use one independent changed-source publication job with current-main guard",
      );
    }
    const schedulerSteps = releaseScheduler?.steps ?? [];
    const schedulerMain = currentMainIndex(schedulerSteps);
    const reconcile = schedulerSteps.findIndex(
      (step) => step.run === 'pnpm attendance:scheduler reconcile --live --sha "$SHA"',
    );
    if (
      !releaseScheduler?.if?.includes("always()") ||
      !releaseScheduler.if.includes("needs.release_plan.outputs.scheduler_changed == 'true'") ||
      !releaseScheduler.if.includes(schemaReady) ||
      !releaseScheduler.if.includes(webReady) ||
      !releaseScheduler.needs?.includes("supabase") ||
      !releaseScheduler.needs?.includes("deployment") ||
      releaseScheduler.env?.SUPABASE_REMOTE_MUTATION_CONTEXT !== "validated-main" ||
      releaseScheduler.concurrency?.group !== releaseSupabase?.concurrency?.group ||
      releaseScheduler.concurrency?.["cancel-in-progress"] !== false ||
      schedulerMain < 0 ||
      reconcile <= schedulerMain
    ) {
      errors.push(
        "CI: Attendance scheduler must be changed-source driven, guard current main and accept only successful or unchanged skipped dependencies",
      );
    }
  } catch (error) {
    errors.push(`version metadata: ${error.message}`);
  }
  const names = new Set();
  for (const file of files(".agents/skills/*/SKILL.md")) {
    try {
      const match = read(file).match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
      if (!match) throw new Error("missing YAML frontmatter");
      const data = YAML.parse(match[1]);
      const name = data?.name;
      if (typeof name !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || name.length > 64)
        throw new Error("invalid skill name");
      if (name !== basename(dirname(file)) || names.has(name))
        throw new Error("duplicate name or folder/name mismatch");
      names.add(name);
      if (typeof data.description !== "string" || !data.description.trim())
        throw new Error("missing description");
      if (data.source !== "repository")
        throw new Error(
          "Project skills must declare source: repository; use runtime skills for external guides",
        );
    } catch (error) {
      errors.push(`${relative(root, file)}: ${error.message}`);
    }
  }
  const agents = new Set();
  for (const file of [resolve(root, ".codex/config.toml"), ...files(".codex/agents/*.toml")]) {
    try {
      // Preserve TOML integer types, rejecting floats including 1.0.
      const data = parse(read(file), { integersAsBigInt: true });
      const settings = data.agents ?? {};
      if (!table(settings)) throw new Error("agents must be a table");
      if (Object.hasOwn(settings, "enabled") && typeof settings.enabled !== "boolean")
        throw new Error("agents.enabled must be a boolean");
      const limits = ["max_concurrent_threads_per_session", "max_threads"];
      if (limits.every((key) => Object.hasOwn(settings, key)))
        throw new Error("use one agent concurrency key, not both the current key and legacy alias");
      const pending = [["", data]];
      while (pending.length) {
        const [path, current] = pending.pop();
        for (const [key, value] of Object.entries(current)) {
          if (limits.includes(key)) {
            if (path !== "agents")
              throw new Error(`${path ? `${path}.` : ""}${key} must be under [agents]`);
            if (typeof value !== "bigint" || value < 1n)
              throw new Error(
                `agents.${key} must be a positive integer; disable with agents.enabled = false`,
              );
          }
          if (table(value)) pending.push([path ? `${path}.${key}` : key, value]);
        }
      }
      if (basename(dirname(file)) === "agents") {
        for (const key of ["name", "description", "developer_instructions"]) {
          if (typeof data[key] !== "string" || !data[key].trim()) throw new Error(`missing ${key}`);
        }
        if (agents.has(data.name)) throw new Error("duplicate agent name");
        agents.add(data.name);
        if (
          [
            "repository-mapper",
            "root-cause-analyst",
            "architecture-analyst",
            "technical-researcher",
            "diff-reviewer",
            "evidence-verifier",
            "architecture-decider",
            "acceptance-decider",
          ].includes(data.name) &&
          data.sandbox_mode !== "read-only"
        )
          throw new Error("review/navigation role must remain read-only");
      }
    } catch (error) {
      errors.push(`${relative(root, file)}: ${error.message}`);
    }
  }
  for (const file of files("scripts/**/*.mjs")) {
    // Parse actual module syntax so fixture strings and prose cannot masquerade as dependencies.
    for (const specifier of literalModuleSpecifiers(file).filter((value) =>
      value.startsWith("."),
    )) {
      let target = resolve(dirname(file), specifier);
      let ancestor = target;
      while (!existsSync(ancestor) && dirname(ancestor) !== ancestor) ancestor = dirname(ancestor);
      target = resolve(realpathSync(ancestor), relative(ancestor, target));
      const path = relative(root, target);
      if (path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path)) {
        errors.push(`${relative(root, file)}: import outside repository: ${specifier}`);
        continue;
      }
      const parts = path.split(sep);
      if (parts.length > 3 && parts[0] === "packages" && parts[2] === "dist") {
        parts[2] = "src";
        target = resolve(root, ...parts).replace(
          /\.(js|mjs|cjs)$/,
          (_, extension) => ({ js: ".ts", mjs: ".mts", cjs: ".cts" })[extension],
        );
      }
      if (!existsSync(target) || !statSync(target).isFile())
        errors.push(`${relative(root, file)}: missing source for ${specifier}`);
    }
  }
  return errors;
}

if (import.meta.main) {
  const manifest = JSON.parse(read(resolve(repositoryRoot, "package.json")));
  const exactNodeVersion = read(resolve(repositoryRoot, ".node-version")).trim();
  const pnpmVersion = process.env.npm_config_user_agent?.match(/^pnpm\/([^ ]+)/)?.[1];
  if (
    process.versions.node !== exactNodeVersion ||
    `pnpm@${pnpmVersion}` !== manifest.packageManager
  ) {
    console.error(
      `Expected Node ${exactNodeVersion} and ${manifest.packageManager}; got Node ${process.versions.node}, pnpm ${pnpmVersion ?? "unknown"}. Run through the repository-pinned toolchain.`,
    );
    process.exit(1);
  }
  const failures = validate(repositoryRoot);
  if (failures.length) {
    console.error(failures.join("\n"));
    process.exit(1);
  }
  for (const args of [
    ...globSync("scripts/**/*.mjs", { cwd: repositoryRoot })
      .sort()
      .map((file) => ["--check", file]),
    [
      "--test",
      "scripts/tooling/check-tooling.test.mjs",
      "scripts/tooling/validate.test.mjs",
      "scripts/vercel/deploy-production.test.mjs",
    ],
  ]) {
    const result = spawnSync(process.execPath, args, { cwd: repositoryRoot, stdio: "inherit" });
    if (result.error) console.error(`Node could not start: ${result.error.message}`);
    if (result.error || result.status !== 0) process.exit(result.status ?? 1);
  }
  console.log(
    "Tooling OK: versions, environment contract, script syntax, literal imports, AGENTS governance, skill metadata and agent TOML. Rules require tooling:rules.",
  );
}
