// Offline metadata checks; never load application code or environment files.
import { spawnSync } from "node:child_process";
import { existsSync, globSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "smol-toml";
import YAML from "yaml";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const read = (file) => readFileSync(file, "utf8").replace(/^\uFEFF/, "");
const table = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

export function validate(root) {
  root = realpathSync(root);
  const errors = [];
  const files = (pattern) =>
    globSync(pattern, { cwd: root })
      .sort()
      .map((file) => resolve(root, file));
  try {
    const manifest = JSON.parse(read(resolve(root, "package.json")));
    const workspace = YAML.parse(read(resolve(root, "pnpm-workspace.yaml")));
    const exact = /^\d+\.\d+\.\d+$/;
    const engines = manifest.engines ?? {};
    for (const name of ["node", "pnpm"]) {
      if (!exact.test(engines[name] ?? ""))
        errors.push(`package.json: engines.${name} must be an exact version`);
    }
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
    if (Object.hasOwn(manifest.scripts ?? {}, "change:plan"))
      errors.push(
        "package.json: change:plan is retired; semantic planning and patch application are separate responsibilities",
      );
    const validationSource = read(resolve(root, "scripts/tooling/validate.mjs"));
    for (const mutableCommand of ["schema:local", "schema:remote", "line:rich-menu", "format"]) {
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
      errors.push("@line-work/platform: schema:check task owner is required");
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
    const externalSemanticBenchmarkArtifacts = new Set(["architecture/semantic-benchmark.json"]);
    const historicalUserVocabularyDocuments = new Set([
      "docs/090-governance/060-acceptance/040-schema-history-extraction.md",
      "docs/090-governance/060-acceptance/050-account-expansion-extraction.md",
      "docs/090-governance/060-acceptance/060-four-model-cutover-validation.md",
      "docs/090-governance/060-acceptance/080-atomic-schema-remote-convergence.md",
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
    for (const file of new Set(currentUserVocabularySources)) {
      const relativePath = relative(root, file).split(sep).join("/");
      if (externalSemanticBenchmarkArtifacts.has(relativePath)) continue;
      if (
        retiredUserVocabulary.test(read(file)) ||
        relative(root, file).includes(retiredHumanAccountPath)
      ) {
        errors.push(
          `${relative(root, file)}: retired User vocabulary is forbidden in current repository surfaces; use User/users`,
        );
      }
    }

    const rootAgentsFile = resolve(root, "AGENTS.md");
    const scopeAgents = [
      "packages/AGENTS.md",
      "scripts/AGENTS.md",
      ".github/AGENTS.md",
      ".agents/AGENTS.md",
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
    const webBuild = turbo.tasks?.["@line-work/web#build"] ?? {};
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
    const checkJob = workflow.jobs?.check;
    const validateJob = workflow.jobs?.validate;
    if (!checkJob || !validateJob)
      errors.push("CI: validation workflow must define PR check and main validate jobs");
    const validationJobs = [checkJob, validateJob].filter(Boolean);
    const checkoutSteps = validationJobs.flatMap((job) =>
      (job.steps ?? []).filter((step) => step.uses?.startsWith("actions/checkout@")),
    );
    if (
      checkoutSteps.length !== validationJobs.length ||
      checkoutSteps.some((step) => step.with?.["persist-credentials"] !== false)
    )
      errors.push("CI: validation checkout must not persist credentials");
    const checkCheckout = (checkJob?.steps ?? []).find((step) =>
      step.uses?.startsWith("actions/checkout@"),
    );
    if (checkCheckout?.with?.["fetch-depth"] !== 0)
      errors.push("CI: PR affected check requires full Git history");
    const setupSteps = validationJobs.flatMap((job) =>
      (job.steps ?? []).filter((step) => step.uses?.startsWith("actions/setup-node@")),
    );
    if (
      setupSteps.length !== validationJobs.length ||
      setupSteps.some(
        (step) =>
          step.with?.["node-version-file"] !== "package.json" ||
          Object.hasOwn(step.with ?? {}, "node-version"),
      )
    )
      errors.push("CI: Node version must come from package.json");
    const pullRequestTypes = workflow.on?.pull_request?.types;
    if (
      !Array.isArray(pullRequestTypes) ||
      !pullRequestTypes.includes("ready_for_review") ||
      !pullRequestTypes.includes("synchronize")
    )
      errors.push("CI: PR validation must distinguish draft iteration from review-ready updates");
    if (
      typeof checkJob?.if !== "string" ||
      !checkJob.if.includes("pull_request") ||
      !checkJob.if.includes("pull_request.draft == false") ||
      !(checkJob.steps ?? []).some((step) => step.run === "pnpm check")
    )
      errors.push("CI: ready pull requests must run affected pnpm check while drafts skip runners");
    if (
      typeof validateJob?.if !== "string" ||
      !validateJob.if.includes("push") ||
      !validateJob.if.includes("refs/heads/main") ||
      !(validateJob.steps ?? []).some((step) => step.run === "pnpm validate")
    )
      errors.push("CI: main push must run full pnpm validate");

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
    const releaseTriggers = releaseWorkflow.on;
    const releasePush = releaseTriggers?.push;
    const releaseBranches = releasePush?.branches;
    const releasePaths = releasePush?.paths;
    if (
      !table(releaseTriggers) ||
      !table(releasePush) ||
      !Array.isArray(releaseBranches) ||
      !releaseBranches.includes("main") ||
      !Array.isArray(releasePaths) ||
      !releasePaths.includes("supabase/schemas/**/*.sql") ||
      !releasePaths.includes(".github/workflows/release.yml") ||
      releasePaths.includes("scripts/supabase/remote.mjs") ||
      !releasePaths.includes("assets/line/rich-menu/**")
    )
      errors.push(
        "CI: Release must be affected-main-only for Supabase schema state, release workflow and Rich Menu desired state; reconciler-only edits must not spend remote-release minutes",
      );
    const releasePermissions = releaseWorkflow.permissions;
    if (
      !table(releasePermissions) ||
      releasePermissions.contents !== "read" ||
      releasePermissions.checks !== "read" ||
      releasePermissions.statuses !== "read" ||
      Object.values(releasePermissions).some((value) => value === "write")
    )
      errors.push("CI: Release workflow must keep read-only GitHub permissions");

    const releaseGate = releaseWorkflow.jobs?.gate;
    const releaseSupabase = releaseWorkflow.jobs?.supabase;
    const releaseDeployment = releaseWorkflow.jobs?.deployment;
    const releaseRichMenu = releaseWorkflow.jobs?.rich_menu;
    if (!releaseGate || !releaseSupabase || !releaseDeployment || !releaseRichMenu) {
      errors.push(
        "CI: Release must define gate, Supabase, deployment and Rich Menu responsibilities",
      );
    }

    const gateSteps = releaseGate?.steps ?? [];
    const detectChanges = gateSteps.findIndex(
      (step) =>
        typeof step.run === "string" &&
        step.run.includes("supabase/schemas/") &&
        step.run.includes("workflows/release") &&
        !step.run.includes("scripts/supabase/remote") &&
        step.run.includes("assets/line/rich-menu/") &&
        step.run.includes("GITHUB_OUTPUT"),
    );
    const waitValidate = gateSteps.findIndex(
      (step) =>
        typeof step.run === "string" &&
        step.run.includes("check-runs") &&
        step.run.includes('.name == "validate"'),
    );
    if (detectChanges < 0 || waitValidate <= detectChanges) {
      errors.push("CI: Release gate must detect affected source before requiring validate");
    }

    if (
      typeof releaseSupabase?.if !== "string" ||
      !releaseSupabase.if.includes("schema_changed") ||
      releaseSupabase.if.includes("schema_compat_changed") ||
      JSON.stringify(releaseSupabase?.env ?? {}).includes("secrets.")
    ) {
      errors.push(
        "CI: Supabase release must run only for schema-state changes with step-scoped secrets",
      );
    }
    const supabaseSteps = releaseSupabase?.steps ?? [];
    const supabaseMain = supabaseSteps.findIndex(
      (step) => typeof step.run === "string" && step.run.includes("branches/main"),
    );
    const supabaseSync = supabaseSteps.findIndex(
      (step) => step.run === "pnpm schema:remote sync --allow-destructive" && step.if === undefined,
    );
    const supabaseEvidence = supabaseSteps.findIndex(
      (step) =>
        step.uses === "actions/upload-artifact@v4" &&
        JSON.stringify(step.with ?? {}).includes(".artifacts/supabase-remote/plan.sql") &&
        JSON.stringify(step.with ?? {}).includes(".artifacts/supabase-remote/verification.sql") &&
        JSON.stringify(step.with ?? {}).includes("migration-history.before.txt") &&
        JSON.stringify(step.with ?? {}).includes("migration-history.after.txt"),
    );
    const redundantRemoteSteps = supabaseSteps.filter(
      (step) =>
        step.run === "pnpm schema:remote compat" ||
        step.run === "pnpm schema:remote plan" ||
        step.run === "pnpm schema:remote verify",
    );
    if (
      supabaseMain < 0 ||
      supabaseSync <= supabaseMain ||
      supabaseEvidence <= supabaseSync ||
      redundantRemoteSteps.length
    ) {
      errors.push(
        "CI: automatic Supabase release must be current-main/sync/evidence with one local schema rebuild",
      );
    }

    const deploymentSteps = releaseDeployment?.steps ?? [];
    const waitVercel = deploymentSteps.findIndex(
      (step) =>
        typeof step.run === "string" &&
        step.run.includes("commits/$SHA/status") &&
        step.run.includes('select(.context == "Vercel")') &&
        step.run.includes("https://vercel.com/96sup/mini-app-line/"),
    );
    if (
      typeof releaseDeployment?.if !== "string" ||
      !releaseDeployment.if.includes("rich_menu_changed") ||
      !JSON.stringify(releaseDeployment?.needs ?? []).includes("supabase") ||
      waitVercel < 0
    ) {
      errors.push(
        "CI: deployment evidence must follow Supabase release and gate Rich Menu publication",
      );
    }

    if (
      typeof releaseRichMenu?.if !== "string" ||
      !releaseRichMenu.if.includes("rich_menu_changed") ||
      !JSON.stringify(releaseRichMenu?.needs ?? []).includes("deployment") ||
      JSON.stringify(releaseRichMenu?.env ?? {}).includes("secrets.")
    ) {
      errors.push("CI: Rich Menu release must be affected-only after deployment evidence");
    }
    const richSteps = releaseRichMenu?.steps ?? [];
    const richBuild = richSteps.findIndex(
      (step) => typeof step.run === "string" && step.run.includes("@line-work/web^..."),
    );
    const richPreview = richSteps.findIndex(
      (step) => step.run === "pnpm line:rich-menu preview all",
    );
    const richMain = richSteps.findIndex(
      (step) => typeof step.run === "string" && step.run.includes("branches/main"),
    );
    const richPublish = richSteps.findIndex(
      (step) => step.run === "pnpm line:rich-menu publish all",
    );
    if (
      richBuild < 0 ||
      richPreview <= richBuild ||
      richMain <= richPreview ||
      richPublish <= richMain
    ) {
      errors.push(
        "CI: automatic Rich Menu release order must be build/preview/current-main/publish",
      );
    }
    if (
      JSON.stringify(releaseRichMenu ?? {}).includes("SUPABASE_") ||
      !JSON.stringify(richSteps[richPublish]?.env ?? {}).includes("LINE_CHANNEL_ACCESS_TOKEN")
    ) {
      errors.push("CI: Rich Menu release must consume only its publication secret at publish");
    }

    const replaceWorkflowFile = resolve(root, ".github/workflows/supabase-replace.yml");
    const replaceWorkflowSource = read(replaceWorkflowFile);
    const replaceWorkflow = YAML.parse(replaceWorkflowSource);
    const replaceTriggers = replaceWorkflow.on;
    if (
      !table(replaceTriggers) ||
      !Object.hasOwn(replaceTriggers, "workflow_dispatch") ||
      Object.hasOwn(replaceTriggers, "push")
    )
      errors.push("CI: destructive Supabase replacement must require workflow_dispatch");
    const replaceJob = replaceWorkflow.jobs?.replace;
    if (
      !replaceJob ||
      typeof replaceJob.if !== "string" ||
      !replaceJob.if.includes("refs/heads/main") ||
      !replaceJob.if.includes("nmssogphayjymjpbnrxv") ||
      !replaceJob.if.includes("confirm_replace") ||
      JSON.stringify(replaceJob?.env ?? {}).includes("secrets.")
    )
      errors.push(
        "CI: destructive Supabase replacement must require exact main/target confirmation",
      );
    const replaceSteps = replaceJob?.steps ?? [];
    const replaceValidate = replaceSteps.findIndex(
      (step) =>
        typeof step.run === "string" &&
        step.run.includes("check-runs") &&
        step.run.includes('.name == "validate"'),
    );
    const replaceVercel = replaceSteps.findIndex(
      (step) =>
        typeof step.run === "string" &&
        step.run.includes("commits/$SHA/status") &&
        step.run.includes("https://vercel.com/96sup/mini-app-line/"),
    );
    const replacePrepare = replaceSteps.findIndex(
      (step) => step.run === "pnpm schema:remote prepare",
    );
    const replaceSync = replaceSteps.findIndex(
      (step) => step.run === "pnpm schema:remote sync --allow-destructive",
    );
    const replaceEvidence = replaceSteps.findIndex(
      (step) =>
        step.uses === "actions/upload-artifact@v4" &&
        JSON.stringify(step.with ?? {}).includes(".artifacts/supabase-remote/plan.sql") &&
        JSON.stringify(step.with ?? {}).includes(".artifacts/supabase-remote/verification.sql") &&
        JSON.stringify(step.with ?? {}).includes("migration-history.before.txt") &&
        JSON.stringify(step.with ?? {}).includes("migration-history.after.txt"),
    );
    const redundantReplaceSteps = replaceSteps.filter(
      (step) => step.run === "pnpm schema:remote plan" || step.run === "pnpm schema:remote verify",
    );
    if (
      replaceValidate < 0 ||
      replaceVercel <= replaceValidate ||
      replacePrepare <= replaceVercel ||
      replaceSync <= replacePrepare ||
      replaceEvidence <= replaceSync ||
      redundantReplaceSteps.length
    )
      errors.push(
        "CI: destructive Supabase replacement order must be validate/deployed-Web/prepare/replace/evidence with one local schema rebuild",
      );
    if (
      !JSON.stringify(replaceSteps[replacePrepare]?.env ?? {}).includes(
        "SUPABASE_ENTERPRISE_METADATA_BACKFILL",
      )
    )
      errors.push(
        "CI: destructive Supabase replacement must scope Enterprise metadata backfill to the prepare step",
      );
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
          ["code-mapper", "change-reviewer", "baseline-reviewer"].includes(data.name) &&
          data.sandbox_mode !== "read-only"
        )
          throw new Error("review/navigation role must remain read-only");
      }
    } catch (error) {
      errors.push(`${relative(root, file)}: ${error.message}`);
    }
  }
  for (const file of files("scripts/**/*.mjs")) {
    // Literal ESM imports only; generated dist cannot substitute for source.
    for (const [, specifier] of read(file).matchAll(
      /(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)["'](\.[^"']+)["']/g,
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
  const pnpmVersion = process.env.npm_config_user_agent?.match(/^pnpm\/([^ ]+)/)?.[1];
  if (
    process.versions.node !== manifest.engines.node ||
    `pnpm@${pnpmVersion}` !== manifest.packageManager
  ) {
    console.error(
      `Expected Node ${manifest.engines.node} and ${manifest.packageManager}; got Node ${process.versions.node}, pnpm ${pnpmVersion ?? "unknown"}. Run through the project pnpm entry point.`,
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
    ["--test", "scripts/tooling/check-tooling.test.mjs", "scripts/tooling/validate.test.mjs"],
  ]) {
    const result = spawnSync(process.execPath, args, { cwd: repositoryRoot, stdio: "inherit" });
    if (result.error) console.error(`Node could not start: ${result.error.message}`);
    if (result.error || result.status !== 0) process.exit(result.status ?? 1);
  }
  console.log(
    "Tooling OK: versions, environment contract, script syntax, literal imports, AGENTS governance, skill metadata and agent TOML. Rules require tooling:rules.",
  );
}
