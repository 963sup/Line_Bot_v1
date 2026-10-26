// Offline metadata checks; never load application code or environment files.
import { existsSync, globSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "smol-toml";
import ts from "typescript";
import YAML from "yaml";
import {
  createOutputDirectory,
  runBoundedCommand,
  writeBoundedDiagnostic,
} from "../../core/runtime/bounded-output.mjs";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
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
const catalogFamilies = new Set([
  "locate-research",
  "analyse-decide",
  "design-plan",
  "implement-document",
  "review",
  "runtime-diagnose",
  "validate-accept",
]);
const catalogStatuses = new Set(["candidate", "enabled", "retired"]);
const roleCatalogFields = [
  "id",
  "family",
  "status",
  "mission",
  "input",
  "deliverable",
  "stopCondition",
  "evidenceBoundary",
  "activationCriteria",
];
const atomicCatalogFields = [
  "id",
  "family",
  "status",
  "goal",
  "input",
  "must",
  "mustNot",
  "deliverable",
  "stopCondition",
  "evidenceBoundary",
  "requiredCapabilityRouteIds",
  "activationCriteria",
];
const roleIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const atomicIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*\.[a-z0-9]+(?:-[a-z0-9]+)*$/;

function validateCandidateCatalog(root, agents, errors) {
  const catalog = ".codex/catalog";
  const rolePath = resolve(root, catalog, "role-catalog.json");
  const atomicPath = resolve(root, catalog, "atomic-catalog.json");
  const schemas = [
    ".codex/schemas/role-catalog.schema.json",
    ".codex/schemas/atomic-catalog.schema.json",
  ];
  const present = [rolePath, atomicPath, ...schemas.map((path) => resolve(root, path))].filter(
    existsSync,
  );
  if (!present.length) return;
  if (present.length !== 4) {
    errors.push(".codex/catalog: role/atomic catalogs and their schemas must appear together");
    return;
  }
  let roles;
  let atomics;
  try {
    const roleCatalog = JSON.parse(read(rolePath));
    const atomicCatalog = JSON.parse(read(atomicPath));
    ({ roles } = roleCatalog);
    ({ atomics } = atomicCatalog);
    if (roleCatalog.version !== 2 || atomicCatalog.version !== 2)
      throw new Error("catalog version must be 2");
    for (const path of schemas) {
      const schema = JSON.parse(read(resolve(root, path)));
      if (typeof schema.$id !== "string" || schema.type !== "object")
        throw new Error("invalid schema");
    }
    for (const path of [
      ".codex/schemas/task-packet.schema.json",
      ".codex/schemas/handoff-result.schema.json",
    ]) {
      const schema = JSON.parse(read(resolve(root, path)));
      if (schema.properties?.atomicId?.pattern !== atomicIdPattern.source)
        throw new Error("missing atomicId packet contract");
    }
    const config = parse(read(resolve(root, ".codex/config.toml")));
    if (
      typeof config.developer_instructions !== "string" ||
      !config.developer_instructions.includes(".codex/catalog/atomic-catalog.json") ||
      !config.developer_instructions.includes("atomicId")
    )
      throw new Error("missing catalog handoff instruction");
    const roleScope = read(resolve(root, ".codex/agents/AGENTS.md"));
    if (!roleScope.includes("atomicId") || !roleScope.includes("../catalog/atomic-catalog.json"))
      throw new Error("missing role catalog handoff instruction");
  } catch {
    errors.push(".codex/catalog: catalogs, schemas, and atomic handoff instructions must be valid");
    return;
  }
  if (!Array.isArray(roles) || roles.length < 58)
    errors.push(".codex/catalog/role-catalog.json: at least 58 roles are required");
  if (!Array.isArray(atomics) || atomics.length < 181)
    errors.push(".codex/catalog/atomic-catalog.json: at least 181 atomics are required");
  if (!Array.isArray(roles) || !Array.isArray(atomics)) return;
  const roleIds = new Map();
  for (const role of roles) {
    if (!table(role) || roleCatalogFields.some((field) => !(field in role))) {
      errors.push(".codex/catalog/role-catalog.json: every role needs all required fields");
      continue;
    }
    if (!roleIdPattern.test(role.id))
      errors.push(`.codex/catalog/role-catalog.json: invalid role id ${role.id}`);
    if (roleIds.has(role.id))
      errors.push(`.codex/catalog/role-catalog.json: duplicate role id ${role.id}`);
    roleIds.set(role.id, role);
    if (!catalogFamilies.has(role.family))
      errors.push(`.codex/catalog/role-catalog.json: invalid family for ${role.id}`);
    if (!catalogStatuses.has(role.status))
      errors.push(`.codex/catalog/role-catalog.json: invalid status for ${role.id}`);
    for (const field of ["mission", "deliverable", "stopCondition", "evidenceBoundary"]) {
      if (typeof role[field] !== "string" || !role[field].trim())
        errors.push(`.codex/catalog/role-catalog.json: ${role.id} needs ${field}`);
    }
    for (const field of ["input", "activationCriteria"]) {
      if (!Array.isArray(role[field]) || !role[field].length)
        errors.push(`.codex/catalog/role-catalog.json: ${role.id} needs ${field}`);
    }
    if (role.status === "enabled") {
      if (
        !agents.has(role.id) ||
        typeof role.profilePath !== "string" ||
        !existsSync(resolve(root, role.profilePath))
      )
        errors.push(`.codex/catalog/role-catalog.json: enabled role ${role.id} lacks a profile`);
    } else if (agents.has(role.id) || Object.hasOwn(role, "profilePath")) {
      errors.push(
        `.codex/catalog/role-catalog.json: non-enabled role ${role.id} cannot have a profile`,
      );
    }
  }
  for (const agent of agents) {
    if (roleIds.get(agent)?.status !== "enabled")
      errors.push(`.codex/catalog/role-catalog.json: profile ${agent} needs one enabled role`);
  }
  const atomicIds = new Set();
  const enabledExecutors = new Set();
  for (const atomic of atomics) {
    if (!table(atomic) || atomicCatalogFields.some((field) => !(field in atomic))) {
      errors.push(".codex/catalog/atomic-catalog.json: every atomic needs all required fields");
      continue;
    }
    if (!atomicIdPattern.test(atomic.id))
      errors.push(`.codex/catalog/atomic-catalog.json: invalid atomic id ${atomic.id}`);
    if (atomicIds.has(atomic.id))
      errors.push(`.codex/catalog/atomic-catalog.json: duplicate atomic id ${atomic.id}`);
    atomicIds.add(atomic.id);
    if (!catalogFamilies.has(atomic.family))
      errors.push(`.codex/catalog/atomic-catalog.json: invalid family for ${atomic.id}`);
    if (!catalogStatuses.has(atomic.status))
      errors.push(`.codex/catalog/atomic-catalog.json: invalid status for ${atomic.id}`);
    for (const field of [
      "input",
      "must",
      "mustNot",
      "requiredCapabilityRouteIds",
      "activationCriteria",
    ]) {
      if (
        !Array.isArray(atomic[field]) ||
        (!atomic[field].length && field !== "requiredCapabilityRouteIds")
      )
        errors.push(`.codex/catalog/atomic-catalog.json: ${atomic.id} needs ${field}`);
    }
    if (atomic.status === "enabled") {
      if (typeof atomic.executorRoleId !== "string" || Object.hasOwn(atomic, "candidateRoleIds")) {
        errors.push(
          `.codex/catalog/atomic-catalog.json: enabled ${atomic.id} needs exactly one executorRoleId`,
        );
        continue;
      }
      const executor = roleIds.get(atomic.executorRoleId);
      if (!executor || executor.status !== "enabled" || !agents.has(atomic.executorRoleId))
        errors.push(
          `.codex/catalog/atomic-catalog.json: enabled ${atomic.id} needs an enabled executor profile`,
        );
      else enabledExecutors.add(atomic.executorRoleId);
    } else {
      if (Object.hasOwn(atomic, "executorRoleId"))
        errors.push(
          `.codex/catalog/atomic-catalog.json: ${atomic.status} ${atomic.id} cannot dispatch`,
        );
      if (!Array.isArray(atomic.candidateRoleIds) || !atomic.candidateRoleIds.length)
        errors.push(`.codex/catalog/atomic-catalog.json: ${atomic.id} needs candidateRoleIds`);
      for (const roleId of atomic.candidateRoleIds ?? []) {
        if (!roleIds.has(roleId))
          errors.push(
            `.codex/catalog/atomic-catalog.json: ${atomic.id} references missing ${roleId}`,
          );
      }
    }
  }
  for (const agent of agents) {
    if (!enabledExecutors.has(agent))
      errors.push(
        `.codex/catalog/atomic-catalog.json: enabled profile ${agent} needs an enabled atomic`,
      );
  }
}
const codexInstructionReferences = [
  { label: "root AGENTS.md", path: "AGENTS.md" },
  {
    label: ".codex/agents/AGENTS.md",
    path: ".codex/agents/AGENTS.md",
    sections: ["Autonomous delegation"],
  },
  {
    label: "docs/reference/engineering/development-workflow.md",
    path: "docs/reference/engineering/development-workflow.md",
    sections: ["Default repository change loop", "Autonomous tool selection"],
  },
];
function markdownSectionStatus(source, heading) {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`^##\\s+${escapedHeading}\\s*$`, "m").exec(source);
  if (!match) return "missing";
  const remainder = source.slice(match.index + match[0].length);
  const nextSection = remainder.search(/^#{1,2}\s+/m);
  const body = nextSection < 0 ? remainder : remainder.slice(0, nextSection);
  return body.split("\n").some((line) => line.trim() && !/^#{1,6}\s+/.test(line.trim()))
    ? "valid"
    : "empty";
}
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
    // CLI-managed external skills are not repository-owned source or governance.
    globSync(pattern, { cwd: root, exclude: [".agents/skills", ".agents/skills/**"] })
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
      if (/\.[cm]?tsx?$/.test(path) && !/\.d\.[cm]?ts$/.test(path)) {
        const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
        const checkDeclaration = (node) => {
          if (
            (ts.isVariableDeclaration(node) || ts.isPropertyDeclaration(node)) &&
            node.exclamationToken
          ) {
            const { line } = ast.getLineAndCharacterOfPosition(node.getStart(ast));
            errors.push(
              `${path}:${line + 1}: definite assignment assertions must use explicit initialization`,
            );
          }
          ts.forEachChild(node, checkDeclaration);
        };
        checkDeclaration(ast);
      }
      for (const retired of retiredProjectIdentities) {
        if (source.includes(retired.value))
          errors.push(`${path}: retired project ${retired.label} is forbidden in current surfaces`);
      }
    }

    const nestedScriptGuidance = ["scripts/**/README.md", "scripts/**/AGENTS.md"]
      .flatMap((pattern) => globSync(pattern, { cwd: root, nodir: true }))
      .map((entry) => entry.split(sep).join("/"))
      .filter((entry) => entry !== "scripts/README.md" && entry !== "scripts/AGENTS.md")
      .sort();
    for (const file of nestedScriptGuidance) {
      errors.push(`${file}: scripts guidance belongs at the scripts root`);
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
    if (manifest.scripts?.check !== "node scripts/governance/tooling/validate.mjs --fast")
      errors.push("package.json: check must remain the canonical read-only fast validation entry");
    if (manifest.scripts?.validate !== "node scripts/governance/tooling/validate.mjs")
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
    if (manifest.scripts?.code !== "node scripts/analysis/code/cli.mjs")
      errors.push("package.json: code must own source queries and preview-only patch generation");
    if (manifest.devDependencies?.["@ast-grep/cli"] !== "0.51.0")
      errors.push("package.json: source operations require the pinned @ast-grep/cli 0.51.0");
    if (manifest.devDependencies?.["ts-morph"] !== "27.0.2")
      errors.push(
        "package.json: source facts require the pinned direct ts-morph 27.0.2 dependency",
      );
    if (workspace.allowBuilds?.["@ast-grep/cli"] !== true)
      errors.push(
        "pnpm-workspace.yaml: the pinned ast-grep CLI requires its explicit installation build",
      );
    const semanticAliases = Object.keys(manifest.scripts ?? {}).filter((name) =>
      name.startsWith("semantic:"),
    );
    if (semanticAliases.length)
      errors.push("package.json: semantic:* aliases are forbidden; use pnpm semantic <verb>");
    if (manifest.scripts?.["patch:apply"] !== "node scripts/changes/patch-apply.mjs")
      errors.push("package.json: patch:apply must own deterministic repository patch execution");
    if (manifest.scripts?.["change:status"] !== "node scripts/changes/status.mjs")
      errors.push("package.json: change:status must own read-only local change state");
    if (Object.hasOwn(manifest.scripts ?? {}, "change:impact"))
      errors.push("package.json: change:impact is retired; use pnpm semantic plan");
    if (manifest.scripts?.["change:preflight"] !== "node scripts/changes/preflight.mjs")
      errors.push("package.json: change:preflight must own local merge-readiness checks");
    if (manifest.scripts?.["change:finalize"] !== "node scripts/changes/finalize.mjs")
      errors.push(
        "package.json: change:finalize must own preflight plus canonical full validation",
      );
    if (manifest.scripts?.["tooling:doctor"] !== "node scripts/governance/tooling/doctor.mjs")
      errors.push("package.json: tooling:doctor must own developer toolchain diagnosis");
    if (
      manifest.scripts?.["vercel:deploy:production"] !==
      "node scripts/providers/vercel/deploy-production.mjs"
    )
      errors.push(
        "package.json: vercel:deploy:production must own controlled production deployment",
      );
    if (
      manifest.scripts?.["github:current-main"] !== "node scripts/providers/github/current-main.mjs"
    )
      errors.push("package.json: github:current-main must own exact-main GitHub readback");
    if (
      manifest.scripts?.["github:release-plan"] !== "node scripts/providers/github/release-plan.mjs"
    )
      errors.push("package.json: github:release-plan must own Release affected-source routing");
    if (
      manifest.scripts?.["github:rich-menu-ready"] !==
      "node scripts/providers/github/rich-menu-ready.mjs"
    )
      errors.push("package.json: github:rich-menu-ready must own read-only Menu runtime evidence");
    if (Object.hasOwn(manifest.scripts ?? {}, "change:plan"))
      errors.push(
        "package.json: change:plan is retired; semantic planning and patch application are separate responsibilities",
      );
    const validationSource = read(resolve(root, "scripts/governance/tooling/validate.mjs"));
    if (!validationSource.includes("runBoundedCommand("))
      errors.push(
        "scripts/governance/tooling/validate.mjs: validation subprocess output must remain bounded and artifact-backed",
      );
    if (/stdio\s*:\s*["']inherit["']/.test(validationSource))
      errors.push(
        "scripts/governance/tooling/validate.mjs: validation must not stream unbounded subprocess output",
      );
    for (const file of files("scripts/**/*.mjs").filter(
      (candidate) => !candidate.endsWith(".test.mjs"),
    )) {
      const source = read(file);
      if (/stdio\s*:\s*["']inherit["']/.test(source))
        errors.push(
          `${relative(root, file)}: production subprocess output must be artifact-backed`,
        );
      if (/process\.stdout\.write\(chunk\)|process\.stderr\.write\(chunk\)/.test(source))
        errors.push(`${relative(root, file)}: child stream chunks must not be forwarded unbounded`);
    }
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
          `scripts/governance/tooling/validate.mjs: validation must not invoke mutable operation ${mutableCommand}`,
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
    for (const [group, rules] of Object.entries({
      nursery: ["noUnsafeTypeAssertion"],
      correctness: ["noUnsafeOptionalChaining"],
      complexity: ["noBannedTypes"],
      suspicious: [
        "noExplicitAny",
        "noTsIgnore",
        "noEvolvingTypes",
        "noImplicitAnyLet",
        "noUnsafeDeclarationMerging",
      ],
      style: ["noNonNullAssertion", "noEnum", "noNamespace", "useAsConstAssertion"],
    })) {
      for (const rule of rules) {
        if (biome.linter?.rules?.[group]?.[rule] !== "error")
          errors.push(`biome.json: ${group}/${rule} must remain error`);
      }
    }
    const safetyOptions = [
      "strict",
      "noUncheckedIndexedAccess",
      "exactOptionalPropertyTypes",
      "noImplicitOverride",
      "noFallthroughCasesInSwitch",
    ];
    for (const file of [
      resolve(root, "tsconfig.base.json"),
      ...workspace.packages.flatMap((pattern) => files(`${pattern}/tsconfig*.json`)),
    ]) {
      const config = ts.getParsedCommandLineOfConfigFile(
        file,
        {},
        {
          ...ts.sys,
          onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
            errors.push(
              `${relative(root, file)}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")}`,
            );
          },
        },
      );
      for (const option of safetyOptions) {
        if (config?.options[option] !== true)
          errors.push(`${relative(root, file)}: ${option} must remain true`);
      }
    }
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
    for (const file of files("packages/integration-supabase/src/migrations/**/*.sql"))
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
      ...files("packages/integration-supabase/src/**/*.{sql,md,toml}"),
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
      for (const name of ["AGENTS.md", "README.md", "SEMANTICS.md"]) {
        if (!existsSync(resolve(packageDir, name)))
          errors.push(`${packagePath}/${name}: package scope entrypoint is required`);
      }
    }
    const topologyPath = resolve(root, "architecture/implementation-topology.json");
    const semanticPath = resolve(root, "architecture/semantic-model.json");
    if (existsSync(topologyPath) && existsSync(semanticPath)) {
      const topology = JSON.parse(read(topologyPath));
      const owners = new Map(
        JSON.parse(read(semanticPath)).semanticOwners.map((owner) => [owner.id, owner.doc]),
      );
      for (const module of Object.values(topology.modules)) {
        if (!module.path?.startsWith("packages/")) continue;
        const ownerDoc = owners.get(module.semanticOwner);
        const readmePath = resolve(root, module.path, "README.md");
        if (!ownerDoc || !existsSync(readmePath)) continue;
        if (!read(readmePath).includes(`../../${ownerDoc}`))
          errors.push(
            `${module.path}/README.md: must link its ${module.semanticOwner} owner contract`,
          );
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
    for (const file of files("**/AGENTS.md")) {
      const source = read(file);
      if (hotPathTargetHeading.test(source))
        errors.push(
          `${relative(root, file)}: target/proposal design belongs in docs/change, not AGENTS hot-path context`,
        );
    }

    const webProject = resolve(root, "apps/web/package.json");
    if (existsSync(webProject)) {
      const webManifest = JSON.parse(read(webProject));
      if (webManifest.name === "@line_bot_v1/web") {
        if (!webManifest.scripts?.typecheck?.includes("tsc --noEmit -p tsconfig.test.json")) {
          errors.push("apps/web/package.json: typecheck must compile the Web test project");
        }
        const configPath = resolve(root, "apps/web/tsconfig.test.json");
        const config = existsSync(configPath)
          ? ts.getParsedCommandLineOfConfigFile(
              configPath,
              {},
              { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} },
            )
          : undefined;
        const compiled = new Set(config?.fileNames.map((file) => resolve(file)) ?? []);
        const tests = files("apps/web/test/**/*.{ts,tsx}");
        if (!config || tests.some((file) => !compiled.has(file))) {
          errors.push(
            "apps/web/tsconfig.test.json: every Web TypeScript test must participate in typecheck",
          );
        }
      }
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
    for (const [file, manifest] of manifests) {
      const directory = relative(root, dirname(file)).split(sep).join("/");
      const consumers = files(`${directory ? `${directory}/` : ""}test/**/*.{ts,mts,cts}`).filter(
        (test) =>
          literalModuleSpecifiers(test).some(
            (specifier) =>
              specifier === "@line_bot_v1/platform/testing/postgres-sessions" ||
              (specifier.startsWith(".") &&
                resolve(dirname(test), specifier).replace(/\.js$/, ".ts") ===
                  resolve(root, "packages/platform/src/testing/postgres-sessions.ts")),
          ),
      );
      if (!consumers.length) continue;
      const task = turbo.tasks?.[`${manifest.name}#test`] ?? {};
      if (task.cache !== false)
        errors.push(
          `${manifest.name}: multi-session tests must execute rather than replay cached evidence`,
        );
      const environment = new Set(
        consumers.flatMap((test) =>
          [...read(test).matchAll(/\bprocess\.env\.([A-Z][A-Z0-9_]*)/g)].map((match) => match[1]),
        ),
      );
      for (const name of environment)
        if (!task.env?.includes(name))
          errors.push(
            `${manifest.name}: multi-session tests must declare ${name} in their Turbo task env`,
          );
    }
    if (!turbo.globalDependencies?.includes("tsconfig.base.json"))
      errors.push("turbo.json: shared TypeScript configuration must invalidate task caches");
    if ((turbo.globalEnv ?? []).length)
      errors.push("turbo.json: product configuration must not use globalEnv");
    if ((turbo.globalDependencies ?? []).includes(".env.local"))
      errors.push("turbo.json: .env.local must not invalidate every workspace task");
    const testInputs = turbo.tasks?.test?.inputs ?? [];
    if (!testInputs.includes("$TURBO_ROOT$/packages/integration-supabase/src/schemas/*.sql"))
      errors.push(
        "turbo.json: product tests must hash declarative schemas so SQL changes cannot reuse stale test cache",
      );
    const webBuild = turbo.tasks?.["@line_bot_v1/web#build"] ?? {};
    if (webBuild.cache !== false)
      errors.push(
        "turbo.json: Web build must execute Sentry upload side effects instead of replaying cached output",
      );
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
    const planJob = workflow.jobs?.plan;
    const fullValidateJob = workflow.jobs?.["full-validate"];
    const validateJob = workflow.jobs?.validate;
    if (!planJob || !fullValidateJob || !validateJob || workflow.jobs?.check)
      errors.push(
        "CI: validation workflow must have one changed-owner planner, parallel validation owner and aggregate gate",
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
    if (
      !pullRequestTypes?.includes("synchronize") ||
      !pullRequestTypes?.includes("ready_for_review")
    )
      errors.push("CI: PR validation must cover every review-ready head update");
    const fullCondition =
      "(github.event_name == 'push' && github.ref == 'refs/heads/main') || (github.event_name == 'pull_request' && github.event.pull_request.draft == false)";
    if (
      planJob?.if !== fullCondition ||
      planJob?.needs ||
      !(planJob?.steps ?? []).some(
        (step) =>
          step.id === "select" &&
          step.run ===
            'echo "groups=$(pnpm --silent validate --fast --plan)" >> "$GITHUB_OUTPUT"' &&
          step.env?.VALIDATION_BASE_SHA ===
            "${{ github.event.pull_request.base.sha || github.event.before }}",
      ) ||
      fullValidateJob?.if !== fullCondition ||
      fullValidateJob?.needs !== "plan" ||
      fullValidateJob?.strategy?.["fail-fast"] !== false ||
      fullValidateJob?.strategy?.matrix?.group !== "${{ fromJSON(needs.plan.outputs.groups) }}" ||
      !(fullValidateJob?.steps ?? []).some(
        (step) =>
          step.run === 'pnpm validate --fast --group "$VALIDATION_GROUP"' &&
          step.env?.VALIDATION_GROUP === "${{ matrix.group }}" &&
          step.env?.VALIDATION_BASE_SHA ===
            "${{ github.event.pull_request.base.sha || github.event.before }}",
      )
    )
      errors.push(
        "CI: main and every non-draft pull-request head must select and run changed-owner validation groups in parallel",
      );
    const validationLogUpload = (fullValidateJob?.steps ?? []).find(
      (step) => step.uses === "actions/upload-artifact@v4" && step.if === "always()",
    );
    if (
      validationLogUpload?.with?.name !==
        "validation-${{ matrix.group }}-${{ github.event.pull_request.head.sha || github.sha }}" ||
      validationLogUpload?.with?.path !== ".artifacts/validation-*/" ||
      validationLogUpload?.with?.["if-no-files-found"] !== "error" ||
      validationLogUpload?.with?.["include-hidden-files"] !== true
    )
      errors.push(
        "CI: every validation group must preserve bounded full logs as an exact-head artifact",
      );
    if (
      JSON.stringify(validateJob?.needs) !== JSON.stringify(["plan", "full-validate"]) ||
      validateJob?.if !== "always() && (" + fullCondition + ")" ||
      !(validateJob?.steps ?? []).some(
        (step) =>
          step.env?.RESULT === "${{ needs.full-validate.result }}" &&
          step.run === "node scripts/providers/github/validation-result.mjs",
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
    const releaseStorage = releaseWorkflow.jobs?.supabase_storage;
    const releaseDeployment = releaseWorkflow.jobs?.deployment;
    const releaseIdentifierActivation = releaseWorkflow.jobs?.identifier_runtime_activation;
    const releaseRich = releaseWorkflow.jobs?.rich_menu;
    const releaseScheduler = releaseWorkflow.jobs?.attendance_scheduler;
    if (
      !releasePlan ||
      !releaseSupabase ||
      !releaseStorage ||
      !releaseDeployment ||
      !releaseIdentifierActivation ||
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
    for (const job of [
      releaseSupabase,
      releaseStorage,
      releaseDeployment,
      releaseIdentifierActivation,
      releaseRich,
      releaseScheduler,
    ]) {
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
    const syncStep = supabaseSteps[sync];
    const schemaReady =
      "(needs.supabase.result == 'success' || (needs.release_plan.outputs.schema_changed != 'true' && needs.supabase.result == 'skipped'))";
    const storageReady =
      "(needs.supabase_storage.result == 'success' || (needs.release_plan.outputs.storage_changed != 'true' && needs.supabase_storage.result == 'skipped'))";
    const storageSteps = releaseStorage?.steps ?? [];
    const storageMain = currentMainIndex(storageSteps);
    const storageSync = storageSteps.findIndex((step) => step.run === "pnpm storage:remote sync");
    const storageSyncStep = storageSteps[storageSync];
    const expectedStorageEnv = {
      GITHUB_TOKEN: "${{ github.token }}",
      GITHUB_REPOSITORY: "${{ github.repository }}",
      SUPABASE_ACCESS_TOKEN: "${{ secrets.SUPABASE_ACCESS_TOKEN }}",
      POSTGRES_URL_NON_POOLING: "${{ secrets.POSTGRES_URL_NON_POOLING }}",
      SUPABASE_RELEASE_SHA: "${{ needs.release_plan.outputs.head_sha }}",
      SUPABASE_URL: "${{ secrets.SUPABASE_URL }}",
      SUPABASE_CONFIRM_PROJECT: "nmssogphayjymjpbnrxv",
    };
    if (
      releasePlan?.outputs?.storage_changed !== "${{ steps.plan.outputs.storage_changed }}" ||
      !releaseStorage?.if?.includes("needs.release_plan.outputs.storage_changed == 'true'") ||
      !releaseStorage.if.includes(schemaReady) ||
      JSON.stringify(releaseStorage.needs) !==
        JSON.stringify(["release_plan", "validation", "supabase"]) ||
      releaseStorage.env?.SUPABASE_REMOTE_MUTATION_CONTEXT !== "validated-main" ||
      releaseStorage.concurrency?.group !== releaseSupabase?.concurrency?.group ||
      releaseStorage.concurrency?.["cancel-in-progress"] !== false ||
      storageMain < 0 ||
      storageSync <= storageMain ||
      storageSteps.filter((step) => step.run?.includes("storage:remote")).length !== 1 ||
      JSON.stringify(Object.entries(storageSyncStep?.env ?? {}).sort()) !==
        JSON.stringify(Object.entries(expectedStorageEnv).sort()) ||
      !storageSteps.some(
        (step) =>
          step.uses === "actions/upload-artifact@v4" &&
          step.if === "always()" &&
          step.with?.path === ".artifacts/supabase-remote/storage-bucket-readback.json",
      )
    ) {
      errors.push("CI: Storage must require changed-source exact-main publication and readback");
    }
    const accessTokenReference = "${{ secrets.SUPABASE_ACCESS_TOKEN }}";
    const accessTokenReferences =
      releaseWorkflowSource.match(/\$\{\{\s*secrets\.SUPABASE_ACCESS_TOKEN\s*\}\}/g) ?? [];
    const misplacedAccessToken =
      Object.hasOwn(releaseWorkflow.env ?? {}, "SUPABASE_ACCESS_TOKEN") ||
      Object.values(releaseWorkflow.jobs ?? {}).some((job) =>
        Object.hasOwn(job?.env ?? {}, "SUPABASE_ACCESS_TOKEN"),
      ) ||
      Object.values(releaseWorkflow.jobs ?? {}).some((job) =>
        (job?.steps ?? []).some(
          (step) =>
            step !== syncStep &&
            step !== storageSyncStep &&
            Object.hasOwn(step.env ?? {}, "SUPABASE_ACCESS_TOKEN"),
        ),
      );
    if (
      syncStep?.env?.SUPABASE_ACCESS_TOKEN !== accessTokenReference ||
      storageSyncStep?.env?.SUPABASE_ACCESS_TOKEN !== accessTokenReference ||
      accessTokenReferences.length !== 2 ||
      misplacedAccessToken
    ) {
      errors.push("CI: Supabase access token must be scoped to Schema and Storage sync steps");
    }
    const evidenceUpload = supabaseSteps.find(
      (step) => step.uses === "actions/upload-artifact@v4" && step.if === "always()",
    );
    const evidencePaths = new Set(
      typeof evidenceUpload?.with?.path === "string"
        ? evidenceUpload.with.path
            .split("\n")
            .map((path) => path.trim())
            .filter(Boolean)
        : [],
    );
    const requiredEvidencePaths = [
      ".artifacts/supabase-remote/plan.sql",
      ".artifacts/supabase-remote/plan.sha256",
      ".artifacts/supabase-remote/verification.sql",
      ".artifacts/supabase-remote/migration-history.before.txt",
      ".artifacts/supabase-remote/migration-history.after.txt",
      ".artifacts/supabase-remote/recovery-readback.json",
      ".artifacts/supabase-remote/scoped-identifier-readback.json",
    ];
    if (!evidenceUpload || requiredEvidencePaths.some((path) => !evidencePaths.has(path))) {
      errors.push(
        "CI: Supabase must preserve plan, verification, history, recovery and scoped identifier readback evidence even on failure",
      );
    }
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
      !releaseDeployment.if.includes(storageReady) ||
      !releaseDeployment.needs?.includes("supabase") ||
      !releaseDeployment.needs?.includes("supabase_storage") ||
      deploymentMain < 0 ||
      productionDeploy <= deploymentMain
    ) {
      errors.push(
        "CI: production deployment must be Web-affected only, follow Supabase contract convergence and Storage readiness or unchanged skip, and invoke the Vercel owner after current-main guard",
      );
    }
    const identifierActivationSteps = releaseIdentifierActivation?.steps ?? [];
    const identifierActivationMain = currentMainIndex(identifierActivationSteps);
    const identifierActivation = identifierActivationSteps.findIndex(
      (step) => step.run === "pnpm schema:remote activate-identifiers",
    );
    const expectedIdentifierActivationNeeds = [
      "release_plan",
      "validation",
      "supabase",
      "deployment",
    ];
    if (
      JSON.stringify(releaseIdentifierActivation?.needs) !==
        JSON.stringify(expectedIdentifierActivationNeeds) ||
      !releaseIdentifierActivation?.if?.includes("always()") ||
      !releaseIdentifierActivation.if.includes("needs.deployment.result == 'success'") ||
      !releaseIdentifierActivation.if.includes(schemaReady) ||
      JSON.stringify(releaseIdentifierActivation.env) !==
        JSON.stringify({ SUPABASE_REMOTE_MUTATION_CONTEXT: "validated-main" }) ||
      releaseIdentifierActivation.concurrency?.group !== releaseSupabase?.concurrency?.group ||
      releaseIdentifierActivation.concurrency?.["cancel-in-progress"] !== false ||
      identifierActivationMain < 0 ||
      identifierActivation <= identifierActivationMain
    ) {
      errors.push(
        "CI: identifier runtime activation must follow successful exact-SHA production deployment, guard current main and serialize the production database resource",
      );
    }
    const identifierActivationCommands = Object.values(releaseWorkflow.jobs ?? {}).flatMap((job) =>
      (job?.steps ?? []).filter((step) => step.run === "pnpm schema:remote activate-identifiers"),
    );
    const identifierActivationStep = identifierActivationSteps[identifierActivation];
    const expectedIdentifierActivationEnv = {
      GITHUB_TOKEN: "${{ github.token }}",
      GITHUB_REPOSITORY: "${{ github.repository }}",
      POSTGRES_URL_NON_POOLING: "${{ secrets.POSTGRES_URL_NON_POOLING }}",
      SUPABASE_RELEASE_SHA: "${{ needs.release_plan.outputs.head_sha }}",
      SUPABASE_URL: "${{ secrets.SUPABASE_URL }}",
      SUPABASE_CONFIRM_PROJECT: "nmssogphayjymjpbnrxv",
    };
    const identifierActivationEnv = identifierActivationStep?.env ?? {};
    const identifierActivationCredentialNames = Object.keys(expectedIdentifierActivationEnv);
    const misplacedIdentifierActivationCredentials =
      identifierActivationCredentialNames.some((name) =>
        Object.hasOwn(releaseWorkflow.env ?? {}, name),
      ) ||
      identifierActivationCredentialNames.some((name) =>
        Object.hasOwn(releaseIdentifierActivation?.env ?? {}, name),
      ) ||
      identifierActivationSteps.some(
        (step, index) =>
          index !== identifierActivation &&
          index !== identifierActivationMain &&
          identifierActivationCredentialNames.some((name) => Object.hasOwn(step.env ?? {}, name)),
      );
    if (
      identifierActivationCommands.length !== 1 ||
      JSON.stringify(Object.entries(identifierActivationEnv).sort()) !==
        JSON.stringify(Object.entries(expectedIdentifierActivationEnv).sort()) ||
      misplacedIdentifierActivationCredentials ||
      Object.hasOwn(identifierActivationStep?.env ?? {}, "SUPABASE_ACCESS_TOKEN")
    ) {
      errors.push(
        "CI: identifier runtime activation must use the canonical command with exact step-scoped production credentials and no management token",
      );
    }
    const identifierActivationEvidence = identifierActivationSteps.find(
      (step) =>
        step.uses === "actions/upload-artifact@v4" &&
        step.if === "always()" &&
        step.with?.name ===
          "scoped-identifier-activation-${{ needs.release_plan.outputs.head_sha }}",
    );
    const identifierActivationEvidencePaths = new Set(
      typeof identifierActivationEvidence?.with?.path === "string"
        ? identifierActivationEvidence.with.path
            .split("\n")
            .map((path) => path.trim())
            .filter(Boolean)
        : [],
    );
    const requiredIdentifierActivationEvidencePaths = [
      ".artifacts/supabase-remote/activate-identifiers.sql",
      ".artifacts/supabase-remote/migration-history.before.txt",
      ".artifacts/supabase-remote/migration-history.after.txt",
      ".artifacts/supabase-remote/scoped-identifier-readback.json",
    ];
    if (
      !identifierActivationEvidence ||
      requiredIdentifierActivationEvidencePaths.some(
        (path) => !identifierActivationEvidencePaths.has(path),
      )
    ) {
      errors.push(
        "CI: identifier runtime activation must preserve activation SQL, history and scoped identifier readback evidence even on failure",
      );
    }
    const richSteps = releaseRich?.steps ?? [];
    const richMain = currentMainIndex(richSteps);
    const publish = richSteps.findIndex((step) => step.run === "pnpm line:rich-menu publish all");
    const ready = richSteps.findIndex(
      (step) =>
        step.run === 'pnpm github:rich-menu-ready --sha "$SHA"' &&
        step.if === "needs.release_plan.outputs.rich_menu_requires_web == 'true'" &&
        step.env?.GITHUB_TOKEN === "${{ github.token }}" &&
        step.env?.GITHUB_REPOSITORY === "${{ github.repository }}" &&
        step.env?.SHA === "${{ needs.release_plan.outputs.head_sha }}",
    );
    if (
      releasePlan?.outputs?.rich_menu_requires_web !==
        "${{ steps.plan.outputs.rich_menu_requires_web }}" ||
      ready <= richMain ||
      ready >= publish
    ) {
      errors.push("CI: Rich Menu must verify compatible exact-SHA Web runtime before publication");
    }
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
  for (const reference of codexInstructionReferences) {
    const file = resolve(root, reference.path);
    if (!existsSync(file)) {
      errors.push(`${reference.path}: referenced canonical Codex instruction is required`);
      continue;
    }
    const source = read(file);
    for (const heading of reference.sections ?? []) {
      const status = markdownSectionStatus(source, heading);
      if (status === "missing") errors.push(`${reference.path}: ## ${heading} section is required`);
      if (status === "empty")
        errors.push(`${reference.path}: ## ${heading} section must not be empty`);
    }
  }
  const agents = new Set();
  const codexConfigFile = resolve(root, ".codex/config.toml");
  for (const file of [codexConfigFile, ...files(".codex/agents/*.toml")]) {
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
      if (file === codexConfigFile) {
        if (typeof data.developer_instructions !== "string" || !data.developer_instructions.trim())
          throw new Error("missing developer_instructions");
        for (const reference of codexInstructionReferences) {
          if (!data.developer_instructions.includes(reference.label))
            throw new Error(`developer_instructions must reference ${reference.label}`);
        }
      }
      if (basename(dirname(file)) === "agents") {
        for (const key of ["name", "description", "developer_instructions"]) {
          if (typeof data[key] !== "string" || !data[key].trim()) throw new Error(`missing ${key}`);
        }
        if (agents.has(data.name)) throw new Error("duplicate agent name");
        agents.add(data.name);
        if (
          ["investigator", "analyst", "decider", "reviewer", "runtime-diagnostician"].includes(
            data.name,
          ) &&
          data.sandbox_mode !== "read-only"
        )
          throw new Error("review/navigation role must remain read-only");
        for (const reference of codexInstructionReferences.slice(0, 2)) {
          if (!data.developer_instructions.includes(reference.label))
            throw new Error(`developer_instructions must reference ${reference.label}`);
        }
      }
    } catch (error) {
      errors.push(`${relative(root, file)}: ${error.message}`);
    }
  }
  validateCandidateCatalog(root, agents, errors);
  const copilotReviewers = [
    "architecture-reviewer.agent.md",
    "database-reviewer.agent.md",
    "security-reviewer.agent.md",
  ];
  const copilotAgents = [...copilotReviewers, "root-cause-debugger.agent.md"];
  for (const name of copilotAgents) {
    const path = `.github/agents/${name}`;
    const file = resolve(root, path);
    if (!existsSync(file)) {
      errors.push(`${path}: required Copilot agent is missing`);
      continue;
    }
    try {
      const source = read(file);
      const frontmatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
      if (!frontmatter) throw new Error("YAML frontmatter is required");
      const metadata = YAML.parse(frontmatter[1]);
      const expectedName = name.replace(/\.agent\.md$/, "");
      if (metadata.name !== expectedName) throw new Error(`name must be ${expectedName}`);
      if (typeof metadata.description !== "string" || !metadata.description.trim())
        throw new Error("description is required");
      if (metadata["include-custom-instructions"] !== true)
        throw new Error("include-custom-instructions must be true");
      if (!Array.isArray(metadata.tools)) throw new Error("tools must be an explicit list");
      const tools = new Set(metadata.tools.map((tool) => String(tool).toLowerCase()));
      if (!tools.has("read") || !tools.has("search"))
        throw new Error("read and search tools are required");
      if (
        copilotReviewers.includes(name) &&
        (tools.size !== 2 || tools.has("edit") || tools.has("execute"))
      )
        throw new Error("reviewer tools must be limited to read/search");
      if (name === "root-cause-debugger.agent.md" && (!tools.has("edit") || !tools.has("execute")))
        throw new Error("debugger must grant edit and execute tools");
      const taskContracts = [...source.matchAll(/`docs\/tasks\/([\w-]+\.md)`/g)];
      for (const [, contract] of taskContracts) {
        if (!existsSync(resolve(root, "docs/tasks", contract)))
          throw new Error(`task contract docs/tasks/${contract} does not exist`);
      }
    } catch (error) {
      errors.push(`${path}: ${error.message}`);
    }
  }
  const promptFiles = files(".github/prompts/*.prompt.md");
  if (promptFiles.length !== 9)
    errors.push(`.github/prompts: expected 9 task entrypoints, found ${promptFiles.length}`);
  for (const file of promptFiles) {
    const path = relative(root, file).split(sep).join("/");
    try {
      const source = read(file);
      const frontmatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
      if (!frontmatter) throw new Error("YAML frontmatter is required");
      const metadata = YAML.parse(frontmatter[1]);
      if (metadata.agent !== "agent") throw new Error("agent must reference the default agent");
      if (typeof metadata.description !== "string" || !metadata.description.trim())
        throw new Error("description is required");
      if (!source.includes("## Delivery")) throw new Error("Delivery section is required");
      const taskContracts = [...source.matchAll(/`docs\/tasks\/([\w-]+\.md)`/g)];
      for (const [, contract] of taskContracts) {
        if (!existsSync(resolve(root, "docs/tasks", contract)))
          throw new Error(`task contract docs/tasks/${contract} does not exist`);
      }
      if (taskContracts.length === 0 && !source.includes("docs/README.md"))
        throw new Error("a local task contract or docs router is required");
    } catch (error) {
      errors.push(`${path}: ${error.message}`);
    }
  }
  for (const [path, requiredHeadings] of [
    [".github/ISSUE_TEMPLATE/bug_report.md", ["## 影響範圍", "## 不在範圍"]],
    [".github/ISSUE_TEMPLATE/feature_request.md", ["## 影響範圍", "## 不在範圍"]],
    [".github/ISSUE_TEMPLATE/architecture.md", ["## Owner / Boundary", "## Acceptance"]],
  ]) {
    const file = resolve(root, path);
    if (!existsSync(file)) {
      errors.push(`${path}: issue template is required`);
      continue;
    }
    const source = read(file);
    for (const heading of requiredHeadings) {
      if (!source.includes(heading)) errors.push(`${path}: ${heading} section is required`);
    }
  }
  try {
    const packageJson = JSON.parse(read(resolve(root, "package.json")));
    const taskFile = resolve(root, ".vscode/tasks.json");
    const tasks = JSON.parse(read(taskFile)).tasks;
    for (const [label, script] of [
      ["repo: tooling doctor", "tooling:doctor"],
      ["repo: tooling check", "tooling:check"],
      ["repo: tooling rules", "tooling:rules"],
    ]) {
      const task = tasks.find((candidate) => candidate.label === label);
      if (
        task?.command !== "pnpm" ||
        task.args?.length !== 1 ||
        task.args[0] !== script ||
        typeof packageJson.scripts?.[script] !== "string"
      )
        errors.push(`.vscode/tasks.json: ${label} must call the package script ${script}`);
    }
  } catch (error) {
    errors.push(`.vscode/tasks.json: ${error.message}`);
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
    const outputDirectory =
      process.env.REPOSITORY_VALIDATION_OUTPUT_DIR ??
      createOutputDirectory(repositoryRoot, "tooling-check-");
    const report = writeBoundedDiagnostic(
      outputDirectory,
      "tooling-violations",
      failures.join("\n"),
    );
    console.error(`Tooling: ${failures.length} violations.`);
    console.error(report.diagnostic);
    console.error(`Full log: ${report.logPath}`);
    process.exit(1);
  }
  const outputDirectory =
    process.env.REPOSITORY_VALIDATION_OUTPUT_DIR ??
    createOutputDirectory(repositoryRoot, "tooling-check-");
  for (const args of [
    ...globSync("scripts/**/*.mjs", { cwd: repositoryRoot })
      .sort()
      .map((file) => ["--check", file]),
    [
      "--test",
      "scripts/governance/tooling/list-skills.test.mjs",
      "scripts/governance/tooling/check-tooling.test.mjs",
      "scripts/governance/tooling/validate.test.mjs",
      "scripts/providers/vercel/deploy-production.test.mjs",
    ],
  ]) {
    const result = runBoundedCommand(process.execPath, args, {
      cwd: repositoryRoot,
      label: args[0] === "--check" ? `syntax-${args[1]}` : "tooling-tests",
      outputDirectory,
    });
    if (result.error || result.status !== 0) {
      console.error(`Tooling command failed: node ${args.join(" ")}`);
      if (result.error) console.error(`Node could not start: ${result.error.message}`);
      if (result.diagnostic) console.error(result.diagnostic);
      console.error(`Full log: ${result.logPath}`);
      process.exit(result.status ?? 1);
    }
  }
  console.log(
    "Tooling OK: versions, environment contract, script syntax, literal imports, AGENTS governance and agent TOML. Rules require tooling:rules.",
  );
}
