import { existsSync, readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cruise } from "dependency-cruiser";
import ts from "typescript";
import config from "../../.dependency-cruiser.mjs";

const repository = fileURLToPath(new URL("../../", import.meta.url));
const normalize = (path) => path.replaceAll("\\", "/");

function moduleSpecifiers(root, source) {
  const ast = ts.createSourceFile(
    source,
    readFileSync(resolve(root, source), "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const specifiers = [];
  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    )
      specifiers.push(node.moduleSpecifier.text);
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteralLike(node.arguments[0])
    )
      specifiers.push(node.arguments[0].text);
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return specifiers;
}

function workspaceRoot(source) {
  return normalize(source).match(/^(?:apps|packages)\/[^/]+/)?.[0] ?? null;
}

/** Workspace boundaries are crossed through package exports, never relative private source paths. */
function checkCrossWorkspaceRelativeImports(root, source) {
  if (!/\.[cm]?[jt]sx?$/.test(source)) return [];
  const owner = workspaceRoot(source);
  if (!owner) return [];
  const errors = [];
  for (const specifier of moduleSpecifiers(root, source)) {
    if (!specifier.startsWith(".")) continue;
    const target = normalize(relative(root, resolve(root, source, "..", specifier)));
    const targetOwner = workspaceRoot(target);
    if (targetOwner && targetOwner !== owner)
      errors.push(`cross-workspace-relative-import: ${source} -> ${specifier}`);
  }
  return errors;
}

// Public feature responsibilities. Cross-feature composition is deliberately absent.
const moduleDependencies = {
  assistant: ["diary/form.ts", "expense/notice.server.ts"],
};

/** Inspect directory entries too: unused or empty route folders must not bypass the graph. */
export function checkAppRoot(root = repository) {
  const directory = resolve(root, "apps/web/src/app");
  if (!existsSync(directory)) return [];
  const folders = new Set([
    "(admin)",
    "(mobile)",
    "(onboarding)",
    "(public)",
    "(resource)",
    "(rich-menu)",
    "(system)",
    "api",
  ]);
  const files = new Set(["layout.tsx", "global-error.tsx", "globals.css", "AGENTS.md"]);
  return readdirSync(directory, { withFileTypes: true })
    .filter(
      (entry) =>
        !(
          (entry.isDirectory() && folders.has(entry.name)) ||
          (entry.isFile() && files.has(entry.name))
        ),
    )
    .map((entry) => `app-root-allowlist: apps/web/src/app/${entry.name}`);
}

function workspaceSources(root) {
  const entries = [];
  const alias = {};
  for (const parent of ["apps", "packages"]) {
    for (const entry of readdirSync(resolve(root, parent), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const directory = `${parent}/${entry.name}`;
      if (!existsSync(resolve(root, directory, "package.json"))) {
        throw new Error(`${directory}: source workspace requires package.json`);
      }
      if (!existsSync(resolve(root, directory, "tsconfig.json"))) {
        throw new Error(`${directory}: source workspace requires tsconfig.json`);
      }
      if (existsSync(resolve(root, directory, "src"))) entries.push(`${directory}/src`);
      const manifest = JSON.parse(readFileSync(resolve(root, directory, "package.json"), "utf8"));
      for (const [subpath, target] of Object.entries(manifest.exports ?? {})) {
        const compiled = typeof target === "string" ? target : target.default;
        if (
          typeof compiled !== "string" ||
          !compiled.startsWith("./dist/") ||
          subpath.includes("*")
        ) {
          throw new Error(
            `${directory}: unsupported export ${subpath}; define its source mapping before validation`,
          );
        }
        const source = compiled.replace("./dist/", "./src/").replace(/\.js$/, ".ts");
        // Exact aliases preserve package exports: no wildcard that permits private deep imports.
        alias[`${manifest.name}${subpath === "." ? "" : subpath.slice(1)}$`] = resolve(
          root,
          directory,
          source,
        );
      }
    }
  }
  return { entries, alias };
}

function isClientModule(root, source) {
  const ast = ts.createSourceFile(
    source,
    readFileSync(resolve(root, source), "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  for (const statement of ast.statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) break;
    if (statement.expression.text === "use client") return true;
  }
  return false;
}

/** Protect the browser graph by owner responsibility rather than a horizontal layer package. */
export function isServerOnlyPackageSource(source) {
  const target = normalize(source);
  if (
    !/^packages\/[^/]+\/src\/(?:adapters(?:\.ts|\/)|agents(?:\.ts|\/)|testing(?:\.ts|\/)|database(?:\.ts|\/)|migration(?:\.ts|\/))/.test(
      target,
    )
  )
    return false;
  return !/\/browser(?:\.ts|\/)/.test(target);
}

export async function checkArchitecture(root = repository) {
  const previous = process.cwd();
  process.chdir(root);
  try {
    const { entries, alias } = workspaceSources(root);
    const result = await cruise(
      entries,
      { ...config.options, validate: true, ruleSet: config, outputType: "json" },
      {
        ...config.options.enhancedResolveOptions,
        exportsFields: ["exports"],
        alias,
        bustTheCache: true,
      },
    );
    const graph = typeof result.output === "string" ? JSON.parse(result.output) : result.output;
    const errors = graph.summary.violations.map(
      (item) => `${item.rule.name}: ${item.from} -> ${item.to}`,
    );
    errors.push(...checkAppRoot(root));
    const modules = new Map(graph.modules.map((module) => [normalize(module.source), module]));
    const isolatedFromMobileShell =
      /^apps\/web\/src\/app\/\((?:admin|onboarding|public|rich-menu|system)\)\//;
    for (const source of modules.keys()) {
      errors.push(...checkCrossWorkspaceRelativeImports(root, source));
      if (isolatedFromMobileShell.test(source)) {
        for (const dependency of modules.get(source).dependencies ?? []) {
          const target = normalize(dependency.resolved);
          if (target.startsWith("apps/web/src/app/(mobile)/_shell/")) {
            errors.push(`route-group-does-not-borrow-mobile-shell: ${source} -> ${target}`);
          }
        }
      }
      const owner = source.match(/^apps\/([^/]+)\/src\/modules\/([^/]+)\//);
      if (owner) {
        const prefix = `apps/${owner[1]}/src/modules/`;
        for (const dependency of modules.get(source).dependencies ?? []) {
          const target = normalize(dependency.resolved);
          if (!target.startsWith(prefix)) continue;
          const responsibility = target.slice(prefix.length);
          if (
            !responsibility.startsWith(`${owner[2]}/`) &&
            (!moduleDependencies[owner[2]]?.includes(responsibility) ||
              responsibility.endsWith("/composition.server.ts"))
          )
            errors.push(`modules-use-public-responsibilities: ${source} -> ${target}`);
        }
      }
      if (!/^apps\/[^/]+\/src\/.*\.[cm]?[jt]sx?$/.test(source) || !isClientModule(root, source))
        continue;
      const queue = [[source]];
      const visited = new Set();
      while (queue.length) {
        const chain = queue.shift();
        const current = chain.at(-1);
        if (visited.has(current)) continue;
        visited.add(current);
        for (const dependency of modules.get(current)?.dependencies ?? []) {
          const target = normalize(dependency.resolved);
          const next = [...chain, target];
          if (
            dependency.coreModule ||
            /^(apps\/[^/]+\/src\/(?:server\/|shared\/server\/|modules\/.*(?:\.server\.[cm]?[jt]sx?$|\/server\/)|app\/.*\.server\.[cm]?[jt]sx?$|app\/(?:.*\/)?route\.[cm]?[jt]s$))/.test(
              target,
            ) ||
            isServerOnlyPackageSource(target)
          ) {
            errors.push(`client-cannot-reach-server: ${next.join(" -> ")}`);
          } else if (modules.has(target) && !/(^|\/)node_modules\//.test(target)) queue.push(next);
        }
      }
    }
    return { errors, moduleCount: graph.modules.length };
  } finally {
    process.chdir(previous);
  }
}

if (process.argv[1] && relative(resolve(process.argv[1]), fileURLToPath(import.meta.url)) === "") {
  const result = await checkArchitecture();
  for (const error of result.errors) console.error(error);
  console.log(`Architecture: ${result.moduleCount} modules, ${result.errors.length} violations.`);
  process.exitCode = result.errors.length ? 1 : 0;
}
