import { isUtf8 } from "node:buffer";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import ts from "typescript";
import { isMap, parseAllDocuments } from "yaml";
import { preparePatch } from "../changes/patch-apply.mjs";

const require = createRequire(import.meta.url);
const CODE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".mts", ".cts"]);
const RULE_LANGUAGE_EXTENSIONS = new Map([
  ["JavaScript", new Set([".js", ".jsx", ".mjs", ".cjs"])],
  ["TypeScript", new Set([".ts", ".mts", ".cts"])],
  ["Tsx", new Set([".tsx"])],
]);
const SKIPPED_DIRECTORIES = new Set(["node_modules", "dist", "generated", ".artifacts", "vendor"]);
const CREDENTIAL_EXTENSIONS = new Set([".pem", ".key", ".p12", ".pfx"]);

function fail(message) {
  throw new Error(message);
}

function slash(path) {
  return path.replaceAll("\\", "/");
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function command(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: options.encoding ?? "utf8",
    input: options.input,
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure)
    fail((result.stderr || result.stdout || `${command} failed`).trim());
  return result;
}

function git(root, args, options = {}) {
  return command("git", args, { cwd: root, ...options });
}

function sourceState(root) {
  const revision = git(root, ["rev-parse", "HEAD"]).stdout.trim();
  const status = git(root, ["status", "--porcelain=v1", "-z"]).stdout;
  return { revision, dirty: status.length > 0 };
}

function pathInside(root, candidate) {
  const rel = relative(resolve(root), resolve(candidate));
  return rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

function inspectExistingPath(root, input, { fileOnly = false } = {}) {
  if (!input || input.includes("\0")) fail(`Invalid path: ${input}`);
  const candidate = resolve(root, input);
  if (!pathInside(root, candidate)) fail(`Path escapes repository: ${input}`);
  const rel = relative(resolve(root), candidate);
  let current = resolve(root);
  for (const part of rel.split(sep).filter(Boolean)) {
    current = join(current, part);
    if (!existsSync(current)) fail(`Path does not exist: ${input}`);
    if (lstatSync(current).isSymbolicLink()) fail(`Symlink traversal is not allowed: ${input}`);
  }
  if (fileOnly && !lstatSync(candidate).isFile()) fail(`Path must be a file: ${input}`);
  return { absolute: candidate, relative: slash(rel) };
}

function skipReason(path) {
  const parts = slash(path).split("/");
  const lower = parts.map((part) => part.toLocaleLowerCase("en-US"));
  if (lower.some((part) => SKIPPED_DIRECTORIES.has(part))) return "generated-or-dependency";
  if (lower[0] === ".agents" && lower[1] === "skills") return "vendored-skill";
  if (lower[0] === "architecture" && lower[1] === "domain" && lower[2] === "fpt")
    return "vendored-domain-truth";
  const name = lower.at(-1) ?? "";
  const extension = extname(name);
  if (/^\.env(?:\.|$)/.test(name)) return "environment-file";
  if (
    CREDENTIAL_EXTENSIONS.has(extension) ||
    /^(?:credentials?|secrets?)(?:\.|$)/.test(name) ||
    /^(?:id_rsa|id_ed25519)(?:\.|$)/.test(name)
  )
    return "credential-like";
  if (!CODE_EXTENSIONS.has(extension)) return "unsupported-language";
  return undefined;
}

function scopeContains(scope, path) {
  return scope === "" || path === scope || path.startsWith(`${scope}/`);
}

function inventory(root, { scopes, excludes = [] }) {
  if (!scopes?.length) fail("At least one --scope is required.");
  const normalizedScopes = scopes.map((scope) => inspectExistingPath(root, scope).relative);
  const normalizedExcludes = excludes.map((path) => inspectExistingPath(root, path).relative);
  const raw = git(root, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"]).stdout;
  const paths = [...new Set(raw.split("\0").filter(Boolean).map(slash))].sort();
  const included = [];
  const skipped = [];
  for (const path of paths) {
    if (!normalizedScopes.some((scope) => scopeContains(scope, path))) continue;
    if (normalizedExcludes.some((excluded) => scopeContains(excluded, path))) {
      skipped.push({ path, reason: "explicit-exclude" });
      continue;
    }
    const reason = skipReason(path);
    if (reason) {
      skipped.push({ path, reason });
      continue;
    }
    try {
      inspectExistingPath(root, path, { fileOnly: true });
    } catch (error) {
      skipped.push({ path, reason: error.message.includes("Symlink") ? "symlink" : "unreadable" });
      continue;
    }
    included.push(path);
  }
  return {
    files: included,
    coverage: {
      kind: "git-inventory",
      scopes: normalizedScopes,
      excludes: normalizedExcludes,
      inventoryFiles: paths.length,
      candidateFiles: included.length,
      skipped,
      completeness:
        "Eligible files in the explicit scopes are candidates; the native rule language selects analyzed files.",
      locationEncoding: "1-based UTF-16 line and column",
    },
  };
}

function astGrepBinary(root) {
  const packageFile = require.resolve("@ast-grep/cli/package.json", { paths: [root] });
  const packageRoot = dirname(packageFile);
  const manifest = JSON.parse(readFileSync(packageFile, "utf8"));
  const relativeBinary = typeof manifest.bin === "string" ? manifest.bin : manifest.bin?.sg;
  if (!relativeBinary) fail("Pinned @ast-grep/cli executable was not found.");
  return resolve(packageRoot, relativeBinary);
}

function parseJsonStream(stdout) {
  return stdout
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function nativeRule(root, rule) {
  const inspectedRule = inspectExistingPath(root, rule, { fileOnly: true });
  if (!/\.ya?ml$/iu.test(inspectedRule.relative)) fail("--rule must be a YAML file.");
  const source = readFileSync(inspectedRule.absolute, "utf8");
  const documents = parseAllDocuments(source, { merge: true });
  if (documents.length !== 1) fail("--rule must contain exactly one YAML document.");
  const document = documents[0];
  if (document.errors.length)
    fail(`Invalid YAML rule: ${document.errors.map((error) => error.message).join("; ")}`);
  if (!isMap(document.contents)) fail("--rule must contain one YAML mapping.");
  const mapping = document.toJS({ mapAsMap: true });
  if (!(mapping instanceof Map)) fail("--rule must contain one YAML mapping.");
  if (mapping.has("files") || mapping.has("ignores"))
    fail("Native rule files/ignores filters are unsupported in version 1; use --scope/--exclude.");
  const language = mapping.get("language");
  const extensions = RULE_LANGUAGE_EXTENSIONS.get(language);
  if (!extensions) fail("Rule language must be one of JavaScript, TypeScript, or Tsx.");
  return {
    path: inspectedRule.relative,
    absolute: inspectedRule.absolute,
    language,
    extensions,
    filters: { files: false, ignores: false },
  };
}

function selectRuleFiles(files, rule) {
  const analyzed = [];
  const excluded = [];
  for (const file of files) {
    if (rule.extensions.has(extname(file).toLocaleLowerCase("en-US"))) analyzed.push(file);
    else excluded.push({ path: file, reason: "native-rule-language" });
  }
  return { analyzed, excluded };
}

function astGrepMatches(root, { rule, files, binary = astGrepBinary(root) }) {
  const matches = [];
  for (let index = 0; index < files.length; index += 40) {
    const batch = files.slice(index, index + 40);
    if (!batch.length) continue;
    const result = command(
      binary,
      [
        "scan",
        "--rule",
        rule.absolute,
        "--json=stream",
        "--color",
        "never",
        "--custom-languages",
        "ignore",
        "--no-ignore",
        "hidden",
        ...batch,
      ],
      { cwd: root, allowFailure: true },
    );
    if (result.status !== 0 && result.status !== 1)
      fail((result.stderr || result.stdout || "ast-grep scan failed").trim());
    matches.push(...parseJsonStream(result.stdout));
  }
  return matches;
}

function normalizedMatch(root, match) {
  const file = inspectExistingPath(root, match.file, { fileOnly: true }).relative;
  const bytes = readFileSync(join(root, file));
  const position = (offset) => {
    const prefix = bytes.subarray(0, offset).toString("utf8");
    const lines = prefix.split("\n");
    return {
      line: lines.length,
      column: (lines.at(-1) ?? "").replace(/\r$/u, "").length + 1,
    };
  };
  return {
    path: file,
    location: {
      start: position(match.range.byteOffset.start),
      end: position(match.range.byteOffset.end),
    },
    snippet: match.lines ?? match.text,
    text: match.text,
  };
}

function scriptKind(path) {
  if (path.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (path.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (/\.(?:js|mjs|cjs)$/u.test(path)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function assertSyntax(path, source) {
  const parsed = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, false, scriptKind(path));
  if (parsed.parseDiagnostics.length) {
    const diagnostic = parsed.parseDiagnostics[0];
    fail(
      `Rewrite creates invalid syntax in ${path}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")}`,
    );
  }
}

export function applyByteReplacements(path, bytes, replacements) {
  const sorted = [...replacements].sort((left, right) => left.start - right.start);
  let cursor = 0;
  const chunks = [];
  for (const replacement of sorted) {
    if (!Number.isInteger(replacement.start) || !Number.isInteger(replacement.end))
      fail(`ast-grep returned invalid replacement offsets for ${path}.`);
    if (
      replacement.start < cursor ||
      replacement.end < replacement.start ||
      replacement.end > bytes.length
    )
      fail(`ast-grep returned overlapping or invalid replacements for ${path}.`);
    chunks.push(bytes.subarray(cursor, replacement.start), Buffer.from(replacement.text, "utf8"));
    cursor = replacement.end;
  }
  chunks.push(bytes.subarray(cursor));
  return Buffer.concat(chunks);
}

function createPlan(root, objective, replacementsByPath, expectedHashes = new Map()) {
  const changes = [];
  for (const [path, replacements] of [...replacementsByPath].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const absolute = inspectExistingPath(root, path, { fileOnly: true }).absolute;
    const beforeBytes = readFileSync(absolute);
    if (!isUtf8(beforeBytes)) fail(`File must be UTF-8 text: ${path}`);
    if (expectedHashes.has(path) && expectedHashes.get(path) !== sha256(beforeBytes))
      fail(`Source changed while the operation was running: ${path}`);
    const afterBytes = applyByteReplacements(path, beforeBytes, replacements);
    const before = beforeBytes.toString("utf8");
    const after = afterBytes.toString("utf8");
    if (before === after) continue;
    assertSyntax(path, after);
    changes.push({ path, sha256: sha256(beforeBytes), before, after });
  }
  const plan = { version: 1, objective, changes };
  preparePatch(plan, { root });
  return plan;
}

function verifySourceHashes(root, expectedHashes) {
  for (const [path, expected] of expectedHashes) {
    const file = inspectExistingPath(root, path, { fileOnly: true }).absolute;
    if (sha256(readFileSync(file)) !== expected)
      fail(`Source changed while the operation was running: ${path}`);
  }
}

function resolveOutput(root, output) {
  if (!output) fail("--out is required.");
  if (!output.toLocaleLowerCase("en-US").endsWith(".json"))
    fail("--out must use a .json extension.");
  const candidate = resolve(root, output);
  const artifacts = resolve(root, ".artifacts");
  const rel = relative(artifacts, candidate);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel))
    fail("--out must be a file below .artifacts/.");
  const artifactRootReal = existsSync(artifacts) ? realpathSync(artifacts) : artifacts;
  if (existsSync(artifacts) && lstatSync(artifacts).isSymbolicLink())
    fail("Symlink traversal is not allowed for --out.");
  let current = artifacts;
  for (const part of dirname(rel)
    .split(sep)
    .filter((part) => part !== ".")) {
    current = join(current, part);
    if (existsSync(current) && lstatSync(current).isSymbolicLink())
      fail("Symlink traversal is not allowed for --out.");
  }
  if (existsSync(candidate) && lstatSync(candidate).isSymbolicLink())
    fail("Symlink traversal is not allowed for --out.");
  if (!pathInside(artifactRootReal, candidate)) fail("--out escapes .artifacts/.");
  return candidate;
}

function writePlan(root, output, plan) {
  const file = resolveOutput(root, output);
  mkdirSync(dirname(file), { recursive: true });
  resolveOutput(root, output);
  try {
    writeFileSync(file, `${JSON.stringify(plan, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if (error?.code === "EEXIST") fail(`--out already exists: ${slash(relative(root, file))}`);
    throw error;
  }
  return slash(relative(root, file));
}

function structuralContext(root, options) {
  const { files, coverage } = inventory(root, options);
  const rule = nativeRule(root, options.rule);
  const selection = selectRuleFiles(files, rule);
  coverage.analyzedFiles = selection.analyzed.length;
  coverage.nativeRule = {
    path: rule.path,
    language: rule.language,
    filters: rule.filters,
  };
  coverage.languageExcluded = selection.excluded;
  return { files: selection.analyzed, candidateFiles: files, coverage, rule };
}

export function structuralSearch(root, options) {
  const { files, coverage, rule } = structuralContext(root, options);
  const matches = astGrepMatches(root, { rule, files, binary: options.binary });
  return {
    operation: "search",
    source: sourceState(root),
    coverage,
    hits: matches.map((match) => normalizedMatch(root, match)),
  };
}

export function structuralRewrite(root, options) {
  if (!options.objective?.trim()) fail("--objective must not be empty.");
  const { files, candidateFiles, coverage, rule } = structuralContext(root, options);
  const expectedHashes = new Map(
    candidateFiles.map((path) => [path, sha256(readFileSync(join(root, path)))]),
  );
  const matches = astGrepMatches(root, { rule, files, binary: options.binary });
  options.afterScan?.();
  verifySourceHashes(root, expectedHashes);
  const replacements = new Map();
  for (const match of matches) {
    if (typeof match.replacement !== "string" || !match.replacementOffsets)
      fail("Rewrite rules must produce native ast-grep replacements (rule fix).");
    const path = inspectExistingPath(root, match.file, { fileOnly: true }).relative;
    const entries = replacements.get(path) ?? [];
    entries.push({
      start: match.replacementOffsets.start,
      end: match.replacementOffsets.end,
      text: match.replacement,
    });
    replacements.set(path, entries);
  }
  const plan = createPlan(root, options.objective, replacements, expectedHashes);
  const output = writePlan(root, options.out, plan);
  return {
    operation: "rewrite",
    source: sourceState(root),
    coverage,
    hits: matches.map((match) => normalizedMatch(root, match)),
    plan: { applicable: true, output, changes: plan.changes.length },
  };
}

function readConfig(configFile) {
  const raw = ts.readConfigFile(configFile, ts.sys.readFile);
  if (raw.error) fail(ts.flattenDiagnosticMessageText(raw.error.messageText, " "));
  const parsed = ts.parseJsonConfigFileContent(
    raw.config,
    ts.sys,
    dirname(configFile),
    undefined,
    configFile,
  );
  if (parsed.errors.length)
    fail(ts.flattenDiagnosticMessageText(parsed.errors[0].messageText, " "));
  return parsed;
}

function configCandidates(root, file) {
  const candidates = [];
  let directory = dirname(file);
  while (pathInside(root, directory) || resolve(directory) === resolve(root)) {
    candidates.push(join(directory, "tsconfig.test.json"));
    if (resolve(directory) === resolve(root)) break;
    directory = dirname(directory);
  }
  directory = dirname(file);
  while (pathInside(root, directory) || resolve(directory) === resolve(root)) {
    candidates.push(join(directory, "tsconfig.json"));
    if (resolve(directory) === resolve(root)) break;
    directory = dirname(directory);
  }
  return candidates;
}

function selectConfig(root, file) {
  for (const candidate of configCandidates(root, file)) {
    if (!existsSync(candidate)) continue;
    const parsed = readConfig(candidate);
    if (parsed.fileNames.some((name) => resolve(name) === resolve(file)))
      return { file: candidate, parsed };
  }
  return undefined;
}

function languageService(config, overlays = new Map()) {
  const versions = new Map(config.parsed.fileNames.map((file) => [file, "0"]));
  const host = {
    getCompilationSettings: () => config.parsed.options,
    getScriptFileNames: () => config.parsed.fileNames,
    getScriptVersion: (file) => versions.get(file) ?? "0",
    getScriptSnapshot: (file) => {
      if (overlays.has(resolve(file)))
        return ts.ScriptSnapshot.fromString(overlays.get(resolve(file)));
      if (!existsSync(file)) return undefined;
      return ts.ScriptSnapshot.fromString(readFileSync(file, "utf8"));
    },
    getCurrentDirectory: () => dirname(config.file),
    getDefaultLibFileName: ts.getDefaultLibFilePath,
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
    realpath: ts.sys.realpath,
  };
  return ts.createLanguageService(host, ts.createDocumentRegistry());
}

function positionAt(source, line, column) {
  if (!Number.isInteger(line) || !Number.isInteger(column) || line < 1 || column < 1)
    fail("Line and column must be positive 1-based integers.");
  const starts = source.getLineStarts();
  if (line > starts.length) fail("Line is outside the file.");
  const start = starts[line - 1];
  const text = source.getFullText();
  let end = line === starts.length ? text.length : starts[line];
  while (end > start && (text[end - 1] === "\n" || text[end - 1] === "\r")) end -= 1;
  const position = start + column - 1;
  if (position >= end) fail("Column is outside the line.");
  return position;
}

function lineLocation(source, start, length = 0) {
  const begin = source.getLineAndCharacterOfPosition(start);
  const end = source.getLineAndCharacterOfPosition(start + length);
  return {
    start: { line: begin.line + 1, column: begin.character + 1 },
    end: { line: end.line + 1, column: end.character + 1 },
  };
}

function location(root, service, entry) {
  const program = service.getProgram();
  const source = program?.getSourceFile(entry.fileName);
  const path = pathInside(root, entry.fileName)
    ? slash(relative(root, entry.fileName))
    : entry.fileName;
  return {
    path,
    ...(source
      ? {
          location: lineLocation(source, entry.textSpan.start, entry.textSpan.length),
          snippet: source.text
            .slice(
              source.getLineStarts()[
                source.getLineAndCharacterOfPosition(entry.textSpan.start).line
              ],
              source.getLineStarts()[
                source.getLineAndCharacterOfPosition(entry.textSpan.start).line + 1
              ] ?? source.text.length,
            )
            .replace(/[\r\n]+$/u, ""),
        }
      : {}),
    declaration: /\.d\.[cm]?ts$/u.test(entry.fileName),
  };
}

function markBoundaries(context, entries) {
  const boundaries = [];
  for (const entry of entries) {
    const relativePath = pathInside(context.root, entry.fileName)
      ? slash(relative(context.root, entry.fileName))
      : entry.fileName;
    if (/\.d\.[cm]?ts$/u.test(entry.fileName))
      boundaries.push({ kind: "declaration", path: relativePath });
    if (slash(entry.fileName).split("/").includes("dist"))
      boundaries.push({ kind: "dist", path: relativePath });
    if (!context.projectFiles.has(resolve(entry.fileName)))
      boundaries.push({ kind: "cross-project", path: relativePath });
  }
  context.coverage.boundaries = boundaries.filter(
    (boundary, index) =>
      boundaries.findIndex(
        (candidate) => candidate.kind === boundary.kind && candidate.path === boundary.path,
      ) === index,
  );
  if (context.coverage.boundaries.length) context.coverage.partial = true;
}

function unresolvedImports(program, options) {
  const unresolved = [];
  const checker = program.getTypeChecker();
  const ambientModules = new Set(
    checker.getAmbientModules().map((symbol) => symbol.name.replace(/^"|"$/gu, "")),
  );
  for (const source of program.getSourceFiles()) {
    if (source.isDeclarationFile || !options.projectFiles.has(resolve(source.fileName))) continue;
    for (const specifier of source.imports) {
      const resolved =
        checker.getSymbolAtLocation(specifier) ||
        ambientModules.has(specifier.text) ||
        ts.resolveModuleName(specifier.text, source.fileName, options.compilerOptions, ts.sys)
          .resolvedModule;
      if (!resolved)
        unresolved.push({
          path: slash(relative(options.root, source.fileName)),
          specifier: specifier.text,
        });
    }
  }
  return unresolved;
}

function typescriptContext(root, inputFile) {
  const inspected = inspectExistingPath(root, inputFile, { fileOnly: true });
  if (!CODE_EXTENSIONS.has(extname(inspected.relative))) fail("Unsupported source extension.");
  const config = selectConfig(root, inspected.absolute);
  if (!config)
    return {
      unsupported: {
        operation: "typescript",
        source: sourceState(root),
        status: "unsupported",
        reason: "The file is not contained by a repository TypeScript configuration.",
        coverage: {
          exclusions: [
            {
              kind: "unconfigured-file",
              reason: "No repository TypeScript project contains this file.",
            },
          ],
          referenceCompleteness: "No project was invented for an unconfigured file.",
        },
      },
    };
  const service = languageService(config);
  const program = service.getProgram();
  const source = program?.getSourceFile(inspected.absolute);
  if (!program || !source) fail("TypeScript could not load the selected file.");
  const projectFiles = new Set(config.parsed.fileNames.map((fileName) => resolve(fileName)));
  const unresolved = unresolvedImports(program, {
    root,
    projectFiles,
    compilerOptions: config.parsed.options,
  });
  return {
    root,
    file: inspected,
    config,
    service,
    program,
    source,
    projectFiles,
    coverage: {
      kind: "typescript-project",
      config: slash(relative(root, config.file)),
      projectFiles: projectFiles.size,
      unresolvedImports: unresolved,
      boundaries: [],
      partial: unresolved.length > 0,
      exclusions: [
        {
          kind: "other-typescript-projects",
          reason: "The selected LanguageService does not claim repository-global coverage.",
        },
      ],
      referenceCompleteness:
        "Results cover the selected TypeScript project, not all repository projects.",
    },
  };
}

export function definitions(root, { file, line, column }) {
  const context = typescriptContext(root, file);
  if (context.unsupported) return { ...context.unsupported, operation: "definition" };
  const position = positionAt(context.source, line, column);
  const results = context.service.getDefinitionAtPosition(context.file.absolute, position) ?? [];
  const locations = results.map((entry) => location(root, context.service, entry));
  markBoundaries(context, results);
  return {
    operation: "definition",
    source: sourceState(root),
    coverage: context.coverage,
    definitions: locations,
  };
}

export function references(root, { file, line, column }) {
  const context = typescriptContext(root, file);
  if (context.unsupported) return { ...context.unsupported, operation: "references" };
  const position = positionAt(context.source, line, column);
  const groups = context.service.findReferences(context.file.absolute, position) ?? [];
  const entries = groups.flatMap((group) => group.references);
  const locations = entries.map((entry) => location(root, context.service, entry));
  markBoundaries(context, entries);
  return {
    operation: "references",
    source: sourceState(root),
    coverage: context.coverage,
    references: locations,
  };
}

function hasExportModifier(node) {
  const isExported = (candidate) =>
    ts.canHaveModifiers(candidate) &&
    (ts.getModifiers(candidate) ?? []).some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
    );
  if (isExported(node)) return true;
  if (ts.isVariableDeclaration(node) && ts.isVariableDeclarationList(node.parent)) {
    if (ts.isVariableStatement(node.parent.parent) && isExported(node.parent.parent)) return true;
  }
  if (ts.isClassElement(node) || ts.isTypeElement(node)) {
    const modifiers = ts.canHaveModifiers(node) ? (ts.getModifiers(node) ?? []) : [];
    const isPrivate = modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.PrivateKeyword);
    if (!isPrivate && node.parent && isExported(node.parent)) return true;
  }
  return false;
}

function isAmbientDeclaration(node) {
  return (
    (node.flags & ts.NodeFlags.Ambient) !== 0 ||
    (ts.canHaveModifiers(node) ? (ts.getModifiers(node) ?? []) : []).some(
      (modifier) => modifier.kind === ts.SyntaxKind.DeclareKeyword,
    )
  );
}

function isTopLevelDeclaration(node) {
  let root = node;
  while (root.parent && !ts.isSourceFile(root.parent)) root = root.parent;
  if (!root.parent || !ts.isSourceFile(root.parent)) return false;
  if (root === node) return true;
  return (
    (ts.isVariableDeclaration(node) || ts.isBindingElement(node)) && ts.isVariableStatement(root)
  );
}

function isProvablyLocalDeclaration(node) {
  if (ts.isParameter(node)) return !ts.isParameterPropertyDeclaration(node, node.parent);
  if (
    ts.isVariableDeclaration(node) ||
    ts.isBindingElement(node) ||
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isClassDeclaration(node) ||
    ts.isClassExpression(node)
  )
    return true;
  if (ts.isPropertyDeclaration(node) || ts.isMethodDeclaration(node))
    return (ts.getModifiers(node) ?? []).some(
      (modifier) => modifier.kind === ts.SyntaxKind.PrivateKeyword,
    );
  return false;
}

function publicOrUncertain(context, token, locations, newName) {
  const reasons = [];
  if (context.coverage.unresolvedImports.length)
    reasons.push("The selected project has unresolved imports, so rename coverage is uncertain.");
  const symbol = context.program.getTypeChecker().getSymbolAtLocation(token);
  if (!symbol) reasons.push("The selected symbol could not be classified.");
  if (symbol?.flags & ts.SymbolFlags.Alias)
    reasons.push("Imported or aliased symbols are not project-local.");
  for (const declaration of symbol?.declarations ?? []) {
    if (!isProvablyLocalDeclaration(declaration))
      reasons.push("The symbol declaration is not a provably local binding.");
    if (isAmbientDeclaration(declaration)) reasons.push("Ambient symbols are not project-local.");
    if (!ts.isExternalModule(declaration.getSourceFile()) && isTopLevelDeclaration(declaration))
      reasons.push("Top-level symbols in nonmodule files have uncertain global coverage.");
    if (hasExportModifier(declaration)) reasons.push("Exported symbols are public.");
    if (
      ts.isExportSpecifier(declaration) ||
      ts.isImportSpecifier(declaration) ||
      ts.isImportClause(declaration) ||
      ts.isNamespaceImport(declaration)
    )
      reasons.push("Import/export boundaries are not automatically renamed.");
    if (
      (ts.isPropertyDeclaration(declaration) ||
        ts.isPropertySignature(declaration) ||
        ts.isMethodDeclaration(declaration) ||
        ts.isMethodSignature(declaration)) &&
      !(ts.canHaveModifiers(declaration)
        ? (ts.getModifiers(declaration) ?? []).some(
            (modifier) => modifier.kind === ts.SyntaxKind.PrivateKeyword,
          )
        : false)
    )
      reasons.push("Non-private member symbols may be part of a public shape.");
  }
  for (const entry of locations) {
    if (entry.fileName.endsWith(".d.ts") || slash(entry.fileName).split("/").includes("dist"))
      reasons.push("A declaration or dist boundary was reached.");
    if (!context.projectFiles.has(resolve(entry.fileName)))
      reasons.push("A cross-project boundary was reached.");
    const source = context.program.getSourceFile(entry.fileName);
    if (source) {
      let current = ts.getTokenAtPosition(source, entry.textSpan.start);
      while (current && !ts.isSourceFile(current)) {
        if (
          ts.isExportSpecifier(current) ||
          ts.isExportAssignment(current) ||
          ts.isImportSpecifier(current) ||
          ts.isImportClause(current) ||
          ts.isNamespaceImport(current)
        ) {
          reasons.push("An import/export occurrence makes the symbol non-local.");
          break;
        }
        current = current.parent;
      }
    }
  }
  const checker = context.program.getTypeChecker();
  for (const fileName of new Set(locations.map((entry) => entry.fileName))) {
    const source = context.program.getSourceFile(fileName);
    if (!source) continue;
    const visit = (node) => {
      if (ts.isIdentifier(node) && node.text === newName) {
        const existing = checker.getSymbolAtLocation(node);
        if (existing && existing !== symbol)
          reasons.push(
            "The requested name already resolves to another symbol in an affected file.",
          );
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return [...new Set(reasons)];
}

function validIdentifier(name, languageVersion) {
  if (!name || !ts.isIdentifierText(name, languageVersion, ts.LanguageVariant.Standard))
    return false;
  return ts.stringToToken(name) === undefined;
}

function diagnosticKey(diagnostic) {
  return [
    diagnostic.code,
    diagnostic.start ?? -1,
    diagnostic.length ?? -1,
    ts.flattenDiagnosticMessageText(diagnostic.messageText, " "),
  ].join(":");
}

function verifyRenameSemantics(context, plan, semanticPositions) {
  const overlays = new Map(
    plan.changes.map((change) => [resolve(context.root, change.path), change.after]),
  );
  const editedService = languageService(context.config, overlays);
  const editedProgram = editedService.getProgram();
  if (!editedProgram) fail("TypeScript could not verify the rename result.");

  for (const change of plan.changes) {
    const fileName = resolve(context.root, change.path);
    const baseline = new Set(
      context.service
        .getSemanticDiagnostics(fileName)
        .map((diagnostic) => diagnosticKey(diagnostic)),
    );
    const introduced = editedService
      .getSemanticDiagnostics(fileName)
      .filter((diagnostic) => !baseline.has(diagnosticKey(diagnostic)));
    if (introduced.length)
      fail(
        `Rename introduces a TypeScript semantic error in ${change.path}: ${ts.flattenDiagnosticMessageText(introduced[0].messageText, " ")}`,
      );
  }

  const checker = editedProgram.getTypeChecker();
  let expectedSymbol;
  for (const position of semanticPositions) {
    const source = editedProgram.getSourceFile(position.fileName);
    if (!source) fail("TypeScript lost a rename source during semantic verification.");
    const token = ts.getTokenAtPosition(source, position.start);
    if (!ts.isIdentifier(token) || token.text !== position.newName)
      fail("TypeScript rename offsets became stale during semantic verification.");
    const symbol = checker.getSymbolAtLocation(token);
    if (!symbol) fail("TypeScript could not resolve a renamed identifier.");
    if (expectedSymbol === undefined) expectedSymbol = symbol;
    else if (symbol !== expectedSymbol)
      fail("Rename would capture or split references across different symbols.");
  }
}

export function rename(root, { file, line, column, newName, objective, out, beforePlan }) {
  if (!objective?.trim()) fail("--objective must not be empty.");
  const context = typescriptContext(root, file);
  if (context.unsupported) return { ...context.unsupported, operation: "rename" };
  context.coverage.renameTextCoverage =
    "Identifier occurrences only; comments and general strings are excluded.";
  if (!validIdentifier(newName, context.config.parsed.options.target ?? ts.ScriptTarget.Latest))
    fail("newName must be a valid non-keyword TypeScript identifier.");
  const position = positionAt(context.source, line, column);
  const token = ts.getTokenAtPosition(context.source, position);
  if (!ts.isIdentifier(token) || position < token.getStart() || position >= token.getEnd())
    fail("The selected position must identify a renameable identifier.");
  if (newName === token.text) fail("newName must differ from the selected identifier.");
  const info = context.service.getRenameInfo(context.file.absolute, position, {
    allowRenameOfImportPath: false,
  });
  if (!info.canRename)
    fail(info.localizedErrorMessage ?? "The selected position cannot be renamed.");
  const locations =
    context.service.findRenameLocations(context.file.absolute, position, false, false, true) ?? [];
  if (!locations.length) fail("TypeScript returned no rename locations.");
  const preview = locations.map((entry) => location(root, context.service, entry));
  markBoundaries(context, locations);
  const reasons = publicOrUncertain(context, token, locations, newName);
  if (reasons.length) {
    context.coverage.partial = true;
    return {
      operation: "rename",
      source: sourceState(root),
      coverage: context.coverage,
      preview,
      plan: { applicable: false, reasons },
    };
  }
  const replacements = new Map();
  const sourceHashes = new Map();
  const semanticPositions = [];
  const locationsByFile = new Map();
  for (const entry of locations) {
    const entries = locationsByFile.get(entry.fileName) ?? [];
    entries.push(entry);
    locationsByFile.set(entry.fileName, entries);
  }
  for (const [fileName, entries] of locationsByFile) {
    const sourceFile = context.program.getSourceFile(fileName);
    if (!sourceFile) fail("TypeScript could not snapshot a rename source.");
    const path = slash(relative(root, fileName));
    sourceHashes.set(path, sha256(Buffer.from(sourceFile.text, "utf8")));
    let delta = 0;
    for (const entry of [...entries].sort(
      (left, right) => left.textSpan.start - right.textSpan.start,
    )) {
      semanticPositions.push({
        fileName,
        start: entry.textSpan.start + delta + (entry.prefixText?.length ?? 0),
        newName,
      });
      delta +=
        (entry.prefixText?.length ?? 0) +
        newName.length +
        (entry.suffixText?.length ?? 0) -
        entry.textSpan.length;
    }
  }
  for (const entry of locations) {
    const path = slash(relative(root, entry.fileName));
    const source = readFileSync(entry.fileName, "utf8");
    if (
      source.slice(entry.textSpan.start, entry.textSpan.start + entry.textSpan.length) !==
      token.text
    )
      fail(`Source changed while TypeScript rename was running: ${path}`);
    const byteStart = Buffer.byteLength(source.slice(0, entry.textSpan.start));
    const byteEnd = Buffer.byteLength(
      source.slice(0, entry.textSpan.start + entry.textSpan.length),
    );
    const current = replacements.get(path) ?? [];
    current.push({
      start: byteStart,
      end: byteEnd,
      text: `${entry.prefixText ?? ""}${newName}${entry.suffixText ?? ""}`,
    });
    replacements.set(path, current);
  }
  beforePlan?.();
  const plan = createPlan(root, objective, replacements, sourceHashes);
  verifyRenameSemantics(context, plan, semanticPositions);
  const output = writePlan(root, out, plan);
  return {
    operation: "rename",
    source: sourceState(root),
    coverage: context.coverage,
    preview,
    plan: { applicable: true, output, changes: plan.changes.length },
  };
}
