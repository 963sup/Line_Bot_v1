import { isUtf8 } from "node:buffer";
import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { builtinModules, createRequire } from "node:module";
import { dirname, extname, join, relative, resolve } from "node:path";
import { Node, Project, ts as parserTs, SyntaxKind } from "ts-morph";
import resolverTs from "typescript";
import {
  inspectExistingPath,
  inventory,
  pathInside,
  selectConfig,
  sha256,
  skipReason,
  slash,
  sourceState,
} from "./core.mjs";

const require = createRequire(import.meta.url);
const tsMorphVersion = JSON.parse(
  readFileSync(require.resolve("ts-morph/package.json"), "utf8"),
).version;
const BUILTINS = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)]);

function fail(message) {
  throw new Error(message);
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function stableCompare(left, right) {
  return compareText(JSON.stringify(left), JSON.stringify(right));
}

function safeMetadataPath(root, input, recordRealpath) {
  const absolute = resolve(input);
  if (!pathInside(root, absolute)) return false;
  let existing = absolute;
  while (!existsSync(existing)) {
    if (resolve(existing) === resolve(root)) break;
    existing = dirname(existing);
  }
  try {
    if (resolve(existing) === resolve(root)) return true;
    let current = resolve(root);
    for (const part of relative(root, existing).split(/[\\/]/u).filter(Boolean)) {
      current = join(current, part);
      if (!lstatSync(current).isSymbolicLink()) continue;
      if (!slash(relative(root, current)).split("/").includes("node_modules")) return false;
      const target = realpathSync(current);
      if (!pathInside(root, target)) return false;
      recordRealpath?.(current, target);
    }
    const target = realpathSync(existing);
    if (!pathInside(root, target)) return false;
    if (resolve(target) !== resolve(existing)) recordRealpath?.(existing, target);
    return true;
  } catch {
    return false;
  }
}

function location(node) {
  const source = node.getSourceFile();
  return {
    start: source.getLineAndColumnAtPos(node.getStart()),
    end: source.getLineAndColumnAtPos(node.getEnd()),
  };
}

function diagnosticFact(diagnostic) {
  const compiler = diagnostic.compilerObject;
  const start = diagnostic.getStart();
  const source = diagnostic.getSourceFile();
  return {
    code: diagnostic.getCode(),
    message: parserTs.flattenDiagnosticMessageText(compiler.messageText, "\n"),
    ...(source && start !== undefined
      ? { location: { start: source.getLineAndColumnAtPos(start) } }
      : {}),
  };
}

function bindingIdentifiers(nameNode) {
  if (Node.isIdentifier(nameNode)) return [nameNode];
  if (Node.isObjectBindingPattern(nameNode) || Node.isArrayBindingPattern(nameNode))
    return nameNode
      .getElements()
      .flatMap((element) =>
        Node.isBindingElement(element) ? bindingIdentifiers(element.getNameNode()) : [],
      );
  return [];
}

function declarationModifiers(statement) {
  return {
    exported: statement.hasExportKeyword(),
    default: statement.hasDefaultKeyword(),
    declare: statement.hasDeclareKeyword(),
  };
}

function declarationFacts(sourceFile) {
  const facts = [];
  for (const statement of sourceFile.getStatements()) {
    if (Node.isVariableStatement(statement)) {
      const declarationKind = statement.getDeclarationKind();
      for (const declaration of statement.getDeclarations()) {
        for (const identifier of bindingIdentifiers(declaration.getNameNode())) {
          const initializer = declaration.getInitializer();
          facts.push({
            kind: "variable",
            name: identifier.getText(),
            declarationKind,
            ...declarationModifiers(statement),
            hasInitializer: initializer !== undefined,
            hasExplicitType: declaration.getTypeNode() !== undefined,
            location: location(identifier),
          });
        }
      }
      continue;
    }
    if (Node.isFunctionDeclaration(statement)) {
      const name = statement.getNameNode();
      facts.push({
        kind: "function",
        name: name?.getText() ?? null,
        ...declarationModifiers(statement),
        anonymousDefault: !name && statement.hasDefaultKeyword(),
        hasBody: statement.getBody() !== undefined,
        signatureOnly: statement.getBody() === undefined,
        location: location(name ?? statement),
      });
      continue;
    }
    if (Node.isClassDeclaration(statement)) {
      const name = statement.getNameNode();
      facts.push({
        kind: "class",
        name: name?.getText() ?? null,
        ...declarationModifiers(statement),
        anonymousDefault: !name && statement.hasDefaultKeyword(),
        location: location(name ?? statement),
      });
      continue;
    }
    const namedKinds = [
      [Node.isInterfaceDeclaration, "interface"],
      [Node.isTypeAliasDeclaration, "type-alias"],
      [Node.isEnumDeclaration, "enum"],
      [Node.isModuleDeclaration, "module"],
    ];
    const matched = namedKinds.find(([predicate]) => predicate(statement));
    if (matched) {
      const name = statement.getNameNode();
      facts.push({
        kind: matched[1],
        name: name.getText(),
        ...declarationModifiers(statement),
        location: location(name),
      });
      continue;
    }
    if (Node.isExportAssignment(statement) && !statement.isExportEquals()) {
      facts.push({
        kind: "default-expression",
        name: null,
        exported: true,
        default: true,
        location: location(statement),
      });
    }
  }
  return facts;
}

function importFacts(sourceFile) {
  return sourceFile.getImportDeclarations().map((declaration) => {
    const clauseTypeOnly = declaration.isTypeOnly();
    const bindings = [];
    const defaultImport = declaration.getDefaultImport();
    if (defaultImport)
      bindings.push({
        kind: "default",
        imported: "default",
        local: defaultImport.getText(),
        typeOnly: clauseTypeOnly,
      });
    const namespaceImport = declaration.getNamespaceImport();
    if (namespaceImport)
      bindings.push({
        kind: "namespace",
        imported: "*",
        local: namespaceImport.getText(),
        typeOnly: clauseTypeOnly,
      });
    for (const specifier of declaration.getNamedImports())
      bindings.push({
        kind: "named",
        imported: specifier.getName(),
        local: specifier.getAliasNode()?.getText() ?? specifier.getName(),
        typeOnly: clauseTypeOnly || specifier.isTypeOnly(),
      });
    return {
      specifier: declaration.getModuleSpecifierValue(),
      typeOnly: clauseTypeOnly,
      sideEffectOnly: bindings.length === 0,
      hasAttributes: declaration.getAttributes() !== undefined,
      bindings,
      location: location(declaration.getModuleSpecifier()),
    };
  });
}

function reexportFacts(sourceFile) {
  return sourceFile
    .getExportDeclarations()
    .filter((declaration) => declaration.getModuleSpecifierValue() !== undefined)
    .map((declaration) => {
      const namespace = declaration.getNamespaceExport();
      const named = declaration.getNamedExports();
      return {
        specifier: declaration.getModuleSpecifierValue(),
        kind: namespace ? "namespace" : named.length ? "named" : "star",
        typeOnly: declaration.isTypeOnly(),
        hasAttributes: declaration.getAttributes() !== undefined,
        ...(namespace ? { namespace: namespace.getName() } : {}),
        ...(named.length
          ? {
              bindings: named.map((specifier) => ({
                imported: specifier.getName(),
                exported: specifier.getAliasNode()?.getText() ?? specifier.getName(),
                typeOnly: declaration.isTypeOnly() || specifier.isTypeOnly(),
              })),
            }
          : {}),
        location: location(declaration.getModuleSpecifier()),
      };
    });
}

function localExportFacts(sourceFile) {
  return sourceFile
    .getExportDeclarations()
    .filter((declaration) => declaration.getModuleSpecifierValue() === undefined)
    .map((declaration) => ({
      kind: "named",
      typeOnly: declaration.isTypeOnly(),
      bindings: declaration.getNamedExports().map((specifier) => ({
        local: specifier.getName(),
        exported: specifier.getAliasNode()?.getText() ?? specifier.getName(),
        typeOnly: declaration.isTypeOnly() || specifier.isTypeOnly(),
      })),
      location: location(declaration),
    }));
}

function unsupportedReferences(sourceFile) {
  const facts = [];
  sourceFile.forEachDescendant((node) => {
    if (Node.isImportTypeNode(node) || Node.isImportEqualsDeclaration(node)) {
      const specifier = node.getFirstDescendantByKind(SyntaxKind.StringLiteral);
      facts.push({
        kind: Node.isImportTypeNode(node) ? "import-type" : "import-equals",
        supported: false,
        ...(specifier ? { specifier: specifier.getLiteralText() } : {}),
        location: location(node),
      });
      return;
    }
    if (!Node.isCallExpression(node)) return;
    const expression = node.getExpression();
    const dynamicImport = expression.getKind() === SyntaxKind.ImportKeyword;
    const requireCall = Node.isIdentifier(expression) && expression.getText() === "require";
    if (!dynamicImport && !requireCall) return;
    const argument = node.getArguments()[0];
    facts.push({
      kind: dynamicImport ? "dynamic-import" : "require",
      supported: false,
      ...(argument && Node.isStringLiteral(argument)
        ? { specifier: argument.getLiteralText() }
        : {}),
      location: location(node),
    });
  });
  return facts;
}

function createTracker(root) {
  const snapshots = new Map();
  const probes = new Map();
  const blockedInputs = new Set();
  const key = (kind, input) => `${kind}:${resolve(input)}`;
  const recordProbe = (kind, input, value) => {
    const probe = key(kind, input);
    const previous = probes.get(probe);
    if (previous !== undefined && previous !== value)
      fail(`Filesystem resolution probe changed during facts collection: ${kind}.`);
    probes.set(probe, value);
  };
  const allowed = (input) =>
    safeMetadataPath(root, input, (link, target) => recordProbe("realpath", link, target));
  const snapshot = (input) => {
    const absolute = resolve(input);
    const bytes = readFileSync(absolute);
    const hash = sha256(bytes);
    const previous = snapshots.get(absolute);
    if (previous !== undefined && previous !== hash)
      fail(`Read input changed during facts collection: ${slash(relative(root, absolute))}`);
    snapshots.set(absolute, hash);
    return bytes;
  };
  return {
    snapshots,
    probes,
    blockedInputs,
    allowPath: allowed,
    blocked(input, operation) {
      blockedInputs.add(`${operation}:${input}`);
    },
    fileExists(input, value) {
      if (allowed(input)) recordProbe("file", input, value);
    },
    directoryExists(input, value) {
      if (allowed(input)) recordProbe("directory", input, value);
    },
    realpath(input, value) {
      if (pathInside(root, input) && pathInside(root, value)) recordProbe("realpath", input, value);
    },
    read(input, value) {
      if (value !== undefined && allowed(input)) snapshot(input);
    },
    readFile(input) {
      if (!allowed(input)) {
        blockedInputs.add(`read:${input}`);
        return undefined;
      }
      const exists = resolverTs.sys.fileExists(input);
      recordProbe("file", input, exists);
      if (!exists) return undefined;
      const bytes = snapshot(input);
      if (!isUtf8(bytes)) fail(`Metadata input must be UTF-8: ${slash(relative(root, input))}`);
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    },
    snapshot,
  };
}

function resolverHost(root, tracker) {
  const allowed = (input) =>
    safeMetadataPath(root, input, (link, target) => tracker.realpath(link, target));
  return {
    fileExists(input) {
      const permitted = allowed(input);
      if (!permitted) tracker.blockedInputs.add(`file-exists:${input}`);
      const value = permitted && resolverTs.sys.fileExists(input);
      tracker.fileExists(input, value);
      return value;
    },
    readFile(input) {
      if (!allowed(input)) {
        tracker.blockedInputs.add(`read:${input}`);
        return undefined;
      }
      return tracker.readFile(input);
    },
    directoryExists(input) {
      const permitted = allowed(input);
      if (!permitted) tracker.blockedInputs.add(`directory-exists:${input}`);
      const value = permitted && (resolverTs.sys.directoryExists?.(input) ?? false);
      tracker.directoryExists(input, value);
      return value;
    },
    getDirectories(input) {
      if (!allowed(input)) {
        tracker.blockedInputs.add(`get-directories:${input}`);
        return [];
      }
      return resolverTs.sys.getDirectories(input);
    },
    realpath(input) {
      if (!allowed(input)) {
        tracker.blockedInputs.add(`realpath:${input}`);
        return input;
      }
      const value = resolverTs.sys.realpath?.(input) ?? input;
      tracker.realpath(input, value);
      return value;
    },
  };
}

function nearestManifest(root, start, tracker, manifests) {
  let directory = dirname(start);
  while (pathInside(root, directory) || resolve(directory) === resolve(root)) {
    const candidate = join(directory, "package.json");
    const exists = resolverTs.sys.fileExists(candidate);
    tracker.fileExists(candidate, exists);
    if (exists) {
      if (!safeMetadataPath(root, candidate, (link, target) => tracker.realpath(link, target))) {
        tracker.blockedInputs.add(`manifest:${candidate}`);
        return undefined;
      }
      const bytes = tracker.snapshot(candidate);
      if (!isUtf8(bytes)) fail(`Metadata input must be UTF-8: ${slash(relative(root, candidate))}`);
      const parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
      const path = slash(relative(root, candidate));
      manifests.set(path, {
        path,
        sha256: sha256(bytes),
        ...(typeof parsed.name === "string" ? { name: parsed.name } : {}),
        ...(Object.hasOwn(parsed, "exports") ? { exports: parsed.exports } : {}),
      });
      return path;
    }
    if (resolve(directory) === resolve(root)) break;
    directory = dirname(directory);
  }
  return undefined;
}

function resolutionCategory(root, target, scopedFiles, projectFiles) {
  const relativePath = slash(relative(root, target));
  const parts = relativePath.split("/");
  if (parts.includes("node_modules")) return "external";
  if (parts.includes("dist") || parts.includes("generated")) return "dist/generated";
  if (/\.d\.[cm]?ts$/u.test(target)) return "declaration";
  if (!projectFiles.has(resolve(target))) return "cross-project";
  if (!scopedFiles.has(relativePath)) return "out-of-scope";
  return "local";
}

function scriptKindFact(path) {
  const extension = extname(path).toLocaleLowerCase("en-US");
  const names = {
    ".js": ["JavaScript", "JS"],
    ".jsx": ["JavaScript", "JSX"],
    ".mjs": ["JavaScript", "MJS"],
    ".cjs": ["JavaScript", "CJS"],
    ".ts": ["TypeScript", "TS"],
    ".tsx": ["TypeScript", "TSX"],
    ".mts": ["TypeScript", "MTS"],
    ".cts": ["TypeScript", "CTS"],
  };
  const [language, scriptKind] = names[extension];
  return { language, scriptKind };
}

function resolveReference({
  root,
  sourcePath,
  specifier,
  config,
  scopedFiles,
  tracker,
  manifests,
  hasAttributes,
}) {
  if (!config) return { status: "not-attempted-no-config" };
  if (BUILTINS.has(specifier)) return { status: "resolved", category: "external/builtin" };
  if (hasAttributes)
    return {
      status: "unsupported-import-attributes",
      reason: "Import attributes can alter resolution conditions; facts do not guess them.",
    };
  if (
    config.parsed.options.moduleResolution === resolverTs.ModuleResolutionKind.Node16 ||
    config.parsed.options.moduleResolution === resolverTs.ModuleResolutionKind.NodeNext
  )
    return {
      status: "unsupported-node-resolution-mode",
      reason:
        "Node16/NodeNext condition selection requires per-reference resolution mode; facts do not guess it.",
    };
  const resolved = resolverTs.resolveModuleName(
    specifier,
    sourcePath,
    config.parsed.options,
    resolverHost(root, tracker),
  ).resolvedModule;
  if (!resolved) return { status: "unresolved" };
  const target = resolve(resolved.resolvedFileName);
  if (!pathInside(root, target))
    return { status: "partial", category: "external", reason: "resolved-target-outside-root" };
  const category = resolutionCategory(
    root,
    target,
    scopedFiles,
    new Set(config.parsed.fileNames.map((file) => resolve(file))),
  );
  const relativeTarget = slash(relative(root, target));
  const fact = { status: "resolved", category, target: relativeTarget };
  fact.packageManifest = nearestManifest(root, target, tracker, manifests);
  if (existsSync(target) && skipReason(relativeTarget) === undefined) {
    try {
      inspectExistingPath(root, relativeTarget, { fileOnly: true });
      const bytes = tracker.snapshot(target);
      if (isUtf8(bytes)) fact.sha256 = sha256(bytes);
      else fact.snapshot = "excluded-non-utf8";
    } catch (error) {
      fact.snapshot = error.message.includes("Symlink") ? "excluded-symlink" : "unavailable";
    }
  } else if (category !== "external") {
    fact.snapshot = "excluded-by-source-inventory-policy";
  }
  return fact;
}

function verifyConsistency(root, initial, tracker, options) {
  const currentState = sourceState(root);
  if (currentState.revision !== initial.source.revision)
    fail("Repository HEAD changed during facts collection.");
  if (currentState.dirty !== initial.source.dirty)
    fail("Repository working-tree state changed during facts collection.");
  const currentInventory = inventory(root, options);
  if (
    JSON.stringify(currentInventory.files) !== JSON.stringify(initial.inventory.files) ||
    JSON.stringify(currentInventory.coverage.skipped) !==
      JSON.stringify(initial.inventory.coverage.skipped)
  )
    fail("Scoped Git inventory changed during facts collection.");
  for (const [file, expected] of tracker.snapshots) {
    if (!existsSync(file) || sha256(readFileSync(file)) !== expected)
      fail(`Read input changed during facts collection: ${slash(relative(root, file))}`);
  }
  for (const [probe, expected] of tracker.probes) {
    const separator = probe.indexOf(":");
    const kind = probe.slice(0, separator);
    const input = probe.slice(separator + 1);
    const actual =
      kind === "file"
        ? resolverTs.sys.fileExists(input)
        : kind === "directory"
          ? existsSync(input) && statSync(input).isDirectory()
          : existsSync(input)
            ? realpathSync(input)
            : input;
    if (actual !== expected)
      fail(`Filesystem resolution probe changed during facts collection: ${kind}.`);
  }
}

export function codeFacts(root, options) {
  const source = sourceState(root);
  const inventoryResult = inventory(root, options);
  const tracker = createTracker(root);
  const project = new Project({
    useInMemoryFileSystem: true,
    skipLoadingLibFiles: true,
    compilerOptions: {
      allowJs: true,
      checkJs: false,
      jsx: parserTs.JsxEmit.Preserve,
      module: parserTs.ModuleKind.ESNext,
      target: parserTs.ScriptTarget.Latest,
    },
  });
  const skipped = [...inventoryResult.coverage.skipped];
  const snapshots = [];
  for (const path of inventoryResult.files) {
    const bytes = tracker.snapshot(join(root, path));
    if (!isUtf8(bytes)) {
      skipped.push({ path, reason: "non-utf8" });
      continue;
    }
    const text = bytes.toString("utf8");
    snapshots.push({
      path,
      absolute: join(root, path),
      sha256: sha256(bytes),
      sourceFile: project.createSourceFile(`/repo/${path}`, text),
    });
  }
  const scopedFiles = new Set(snapshots.map((snapshot) => snapshot.path));
  const manifests = new Map();
  const issues = [];
  const files = [];
  for (const snapshot of snapshots) {
    const configReads = new Set();
    const configTracker = {
      ...tracker,
      allowPath: (input) =>
        safeMetadataPath(root, input, (link, target) => tracker.realpath(link, target)),
      blocked: (input, operation) => tracker.blockedInputs.add(`${operation}:${input}`),
      read: (input, value) => {
        tracker.read(input, value);
        if (value !== undefined && extname(input).toLocaleLowerCase("en-US") === ".json")
          configReads.add(resolve(input));
      },
    };
    const config = selectConfig(root, snapshot.absolute, configTracker);
    const sourceManifest = nearestManifest(root, snapshot.absolute, tracker, manifests);
    const imports = importFacts(snapshot.sourceFile);
    const reexports = reexportFacts(snapshot.sourceFile);
    const exports = localExportFacts(snapshot.sourceFile);
    const unsupported = unsupportedReferences(snapshot.sourceFile);
    const syntaxDiagnostics = project
      .getProgram()
      .getSyntacticDiagnostics(snapshot.sourceFile)
      .map(diagnosticFact);
    const staticReferences = [
      ...imports.map((entry) => ({ kind: "import", entry })),
      ...reexports.map((entry) => ({ kind: "reexport", entry })),
    ];
    const moduleReferences = staticReferences.map(({ kind, entry }) => ({
      kind,
      supported: true,
      specifier: entry.specifier,
      location: entry.location,
      resolution: resolveReference({
        root,
        sourcePath: snapshot.absolute,
        specifier: entry.specifier,
        config,
        scopedFiles,
        tracker,
        manifests,
        hasAttributes: entry.hasAttributes,
      }),
    }));
    moduleReferences.push(...unsupported);
    if (!config) issues.push({ kind: "no-config", path: snapshot.path });
    for (const diagnostic of syntaxDiagnostics)
      issues.push({ kind: "syntax-error", path: snapshot.path, code: diagnostic.code });
    for (const reference of moduleReferences) {
      if (!reference.supported)
        issues.push({ kind: `unsupported-${reference.kind}`, path: snapshot.path });
      else if (reference.resolution.status === "unresolved")
        issues.push({
          kind: "unresolved-module",
          path: snapshot.path,
          specifier: reference.specifier,
        });
      else if (reference.resolution.status.startsWith("unsupported"))
        issues.push({
          kind: "unsupported-resolution-mode",
          path: snapshot.path,
          specifier: reference.specifier,
        });
      else if (reference.resolution.category && reference.resolution.category !== "local")
        issues.push({
          kind: "resolution-boundary",
          path: snapshot.path,
          specifier: reference.specifier,
          category: reference.resolution.category,
        });
    }
    files.push({
      path: snapshot.path,
      sha256: snapshot.sha256,
      ...scriptKindFact(snapshot.path),
      sourceManifest,
      config: config
        ? {
            status: "selected",
            path: slash(relative(root, config.file)),
            inputs: [...configReads]
              .map((input) => ({
                path: slash(relative(root, input)),
                sha256: tracker.snapshots.get(input),
              }))
              .sort((left, right) => compareText(left.path, right.path)),
          }
        : { status: "not-found", resolution: "not-attempted-no-config" },
      syntaxDiagnostics,
      imports,
      exports,
      reexports,
      declarations: declarationFacts(snapshot.sourceFile),
      moduleReferences,
    });
  }
  for (const blocked of tracker.blockedInputs)
    issues.push({ kind: "outside-root-metadata-blocked", operation: blocked.split(":", 1)[0] });
  options.beforeVerify?.();
  verifyConsistency(root, { source, inventory: inventoryResult }, tracker, {
    scopes: options.scopes,
    excludes: options.excludes,
  });
  issues.sort(stableCompare);
  return {
    operation: "facts",
    source,
    versions: {
      tsMorph: tsMorphVersion,
      parserTypeScript: parserTs.version,
      resolverTypeScript: resolverTs.version,
    },
    provenance: {
      workingTree: source.dirty ? "dirty" : "clean",
      sourceOfFacts: "working-tree-snapshots",
    },
    coverage: {
      kind: "git-inventory-syntax-facts",
      scopes: inventoryResult.coverage.scopes,
      excludes: inventoryResult.coverage.excludes,
      inventoryFiles: inventoryResult.coverage.inventoryFiles,
      candidateFiles: inventoryResult.coverage.candidateFiles,
      analyzedFiles: files.length,
      skipped: skipped.sort(stableCompare),
      partial: issues.length > 0 || skipped.length > 0,
      issues,
      resolution:
        "Static string ESM specifiers use the nearest containing test-first TypeScript config; facts do not assert runtime loading, package authorization, merged symbol identity, or repository-global completeness.",
      unsupported: [
        "dynamic-import",
        "require",
        "import-type",
        "import-equals",
        "node16/nodenext-resolution",
        "import-attribute-resolution",
      ],
      locationEncoding: "1-based UTF-16 line and column",
    },
    consultedManifests: [...manifests.values()].sort((left, right) =>
      compareText(left.path, right.path),
    ),
    files: files.sort((left, right) => compareText(left.path, right.path)),
  };
}
