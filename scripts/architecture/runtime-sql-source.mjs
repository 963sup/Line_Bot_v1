import ts from "typescript";

const DEFAULT_MAX_ALTERNATIVES = 64;

function normalizedSources(sources) {
  const entries = sources instanceof Map ? [...sources] : Object.entries(sources ?? {});
  return new Map(
    entries.map(([path, source]) => [String(path).replaceAll("\\", "/"), String(source)]),
  );
}

function createAnalysisProgram(sources) {
  const options = {
    allowJs: true,
    checkJs: false,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    noLib: true,
    noResolve: false,
    skipLibCheck: true,
    target: ts.ScriptTarget.ESNext,
  };
  const sourceFiles = new Map();
  for (const [path, source] of sources) {
    sourceFiles.set(
      path,
      ts.createSourceFile(
        path,
        source,
        ts.ScriptTarget.Latest,
        true,
        path.endsWith(".tsx")
          ? ts.ScriptKind.TSX
          : path.endsWith(".jsx")
            ? ts.ScriptKind.JSX
            : path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".cjs")
              ? ts.ScriptKind.JS
              : ts.ScriptKind.TS,
      ),
    );
  }
  const candidateModulePaths = (specifier, containingFile) => {
    if (!specifier.startsWith(".")) return [];
    const base = ts.normalizePath(ts.combinePaths(ts.getDirectoryPath(containingFile), specifier));
    const extension = /\.[^.\\/]+$/u.exec(base)?.[0];
    const stem = extension ? base.slice(0, -extension.length) : base;
    const candidates = [base];
    if (extension === ".mjs") candidates.push(`${stem}.mts`);
    else if (extension === ".cjs") candidates.push(`${stem}.cts`);
    else if (extension === ".js")
      candidates.push(`${stem}.ts`, `${stem}.tsx`, `${stem}.js`, `${stem}.jsx`);
    else if (extension === ".jsx") candidates.push(`${stem}.tsx`, `${stem}.jsx`);
    else if (!extension) {
      for (const suffix of ["ts", "tsx", "js", "jsx", "mts", "cts", "mjs", "cjs"]) {
        candidates.push(`${base}.${suffix}`, `${base}/index.${suffix}`);
      }
    }
    return [...new Set(candidates)];
  };
  const moduleExtension = (path) => {
    if (path.endsWith(".mts")) return ts.Extension.Mts;
    if (path.endsWith(".cts")) return ts.Extension.Cts;
    if (path.endsWith(".tsx")) return ts.Extension.Tsx;
    if (path.endsWith(".jsx")) return ts.Extension.Jsx;
    if (path.endsWith(".mjs")) return ts.Extension.Mjs;
    if (path.endsWith(".cjs")) return ts.Extension.Cjs;
    if (path.endsWith(".js")) return ts.Extension.Js;
    return ts.Extension.Ts;
  };
  const host = {
    fileExists: (path) => sourceFiles.has(ts.normalizePath(path)),
    getCanonicalFileName: (path) => path,
    getCurrentDirectory: () => "",
    getDefaultLibFileName: () => "lib.d.ts",
    getNewLine: () => "\n",
    getSourceFile: (path) => sourceFiles.get(ts.normalizePath(path)),
    readFile: (path) => sources.get(ts.normalizePath(path)),
    resolveModuleNames: (moduleNames, containingFile) =>
      moduleNames.map((specifier) => {
        const path = candidateModulePaths(specifier, containingFile).find((candidate) =>
          sourceFiles.has(candidate),
        );
        return path ? { extension: moduleExtension(path), resolvedFileName: path } : undefined;
      }),
    useCaseSensitiveFileNames: () => true,
    writeFile: () => {},
  };
  const program = ts.createProgram({ host, options, rootNames: [...sources.keys()] });
  return { checker: program.getTypeChecker(), sourceFiles };
}

function unwrapped(expression) {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isSatisfiesExpression?.(current)
  ) {
    current = current.expression;
  }
  return current;
}

function lineOf(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function containingFunction(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isFunctionLike(current)) return current;
  }
  return undefined;
}

function immediateReturns(fn) {
  if (!fn.body) return [];
  if (!ts.isBlock(fn.body)) return [fn.body];
  const returns = [];
  const visit = (node) => {
    if (node !== fn.body && ts.isFunctionLike(node)) return;
    if (ts.isReturnStatement(node)) {
      if (node.expression) returns.push(node.expression);
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(fn.body);
  return returns;
}

function localFunctionForSymbol(symbol) {
  for (const declaration of symbol?.declarations ?? []) {
    if (ts.isFunctionDeclaration(declaration) || ts.isMethodDeclaration(declaration))
      return declaration;
    if (
      ts.isVariableDeclaration(declaration) &&
      declaration.initializer &&
      (ts.isArrowFunction(declaration.initializer) ||
        ts.isFunctionExpression(declaration.initializer))
    ) {
      return declaration.initializer;
    }
  }
  return undefined;
}

function symbolAt(checker, node) {
  return resolvedSymbol(checker, checker.getSymbolAtLocation(node));
}

function resolvedSymbol(checker, initial) {
  let symbol = initial;
  if (symbol && (symbol.flags & ts.SymbolFlags.Alias) !== 0) {
    try {
      symbol = checker.getAliasedSymbol(symbol);
    } catch {
      // An unresolved import remains unresolved and is reported at its SQL consumer.
    }
  }
  return symbol;
}

function functionSymbol(checker, fn) {
  if (fn.name) return symbolAt(checker, fn.name);
  if (ts.isVariableDeclaration(fn.parent) && ts.isIdentifier(fn.parent.name)) {
    return symbolAt(checker, fn.parent.name);
  }
  return undefined;
}

function moduleExports(sourceFile, checker) {
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile) ?? sourceFile.symbol;
  if (!moduleSymbol) return [];
  try {
    return checker.getExportsOfModule(moduleSymbol);
  } catch {
    return [];
  }
}

function collectPublicSymbols(sourceFiles, checker, publicEntryPoints) {
  const symbols = new Set();
  const functions = new Set();
  const errors = [];
  let entries;
  if (publicEntryPoints === undefined) {
    entries = [...sourceFiles.values()];
  } else {
    entries = [];
    for (const rawPath of publicEntryPoints) {
      const path = String(rawPath).replaceAll("\\", "/");
      const sourceFile = sourceFiles.get(path);
      if (!sourceFile) {
        errors.push(`public entry point ${path}: source is not present in the analyzed source set`);
        continue;
      }
      if (!checker.getSymbolAtLocation(sourceFile) && !sourceFile.symbol) {
        errors.push(`public entry point ${path}: source is not an external module`);
        continue;
      }
      entries.push(sourceFile);
    }
  }
  for (const sourceFile of entries) {
    for (const statement of sourceFile.statements) {
      const typeOnlyNamedExport =
        ts.isExportDeclaration(statement) &&
        statement.exportClause &&
        ts.isNamedExports(statement.exportClause) &&
        statement.exportClause.elements.length > 0 &&
        statement.exportClause.elements.every((element) => element.isTypeOnly);
      if (
        ts.isExportDeclaration(statement) &&
        !statement.isTypeOnly &&
        !typeOnlyNamedExport &&
        statement.moduleSpecifier &&
        !checker.getSymbolAtLocation(statement.moduleSpecifier)
      ) {
        errors.push(
          `public entry point ${sourceFile.fileName}: cannot resolve reexport ${statement.moduleSpecifier.getText(sourceFile)}`,
        );
      }
    }
    for (const exported of moduleExports(sourceFile, checker)) {
      const symbol = resolvedSymbol(checker, exported);
      if (symbol) symbols.add(symbol);
    }
  }

  const expandedSymbols = new Set();
  const expandedValues = new Set();
  const expandValue = (node) => {
    const value = unwrapped(node);
    if (expandedValues.has(value)) return;
    expandedValues.add(value);
    if (ts.isIdentifier(value)) {
      const symbol = symbolAt(checker, value);
      if (symbol) symbols.add(symbol);
      return;
    }
    if (ts.isArrowFunction(value) || ts.isFunctionExpression(value)) {
      functions.add(value);
      for (const returned of immediateReturns(value)) expandValue(returned);
      return;
    }
    if (ts.isArrayLiteralExpression(value)) {
      for (const element of value.elements) {
        if (!ts.isSpreadElement(element)) expandValue(element);
      }
      return;
    }
    if (ts.isNewExpression(value)) {
      const symbol = symbolAt(checker, value.expression);
      if (symbol) symbols.add(symbol);
      return;
    }
    if (ts.isCallExpression(value)) {
      const symbol = symbolAt(checker, value.expression);
      if (symbol) symbols.add(symbol);
      return;
    }
    if (ts.isConditionalExpression(value)) {
      expandValue(value.whenTrue);
      expandValue(value.whenFalse);
      return;
    }
    if (!ts.isObjectLiteralExpression(value)) return;
    for (const property of value.properties) {
      if (ts.isShorthandPropertyAssignment(property)) {
        const symbol = resolvedSymbol(
          checker,
          checker.getShorthandAssignmentValueSymbol(property) ??
            checker.getSymbolAtLocation(property.name),
        );
        if (symbol) symbols.add(symbol);
      } else if (ts.isPropertyAssignment(property)) {
        expandValue(property.initializer);
      } else if (ts.isMethodDeclaration(property)) {
        functions.add(property);
      }
    }
  };
  let changed = true;
  while (changed) {
    changed = false;
    for (const symbol of symbols) {
      if (expandedSymbols.has(symbol)) continue;
      expandedSymbols.add(symbol);
      changed = true;
      for (const declaration of symbol.declarations ?? []) {
        if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
          expandValue(declaration.initializer);
        } else if (ts.isExportAssignment(declaration)) {
          expandValue(declaration.expression);
        } else if (ts.isFunctionDeclaration(declaration) || ts.isMethodDeclaration(declaration)) {
          for (const returned of immediateReturns(declaration)) expandValue(returned);
        } else if (ts.isSourceFile(declaration)) {
          for (const exported of moduleExports(declaration, checker)) {
            const nested = resolvedSymbol(checker, exported);
            if (nested) symbols.add(nested);
          }
        }
      }
    }
  }
  return { errors, functions, symbols };
}

function enclosingClass(fn) {
  if (
    (ts.isMethodDeclaration(fn) || ts.isConstructorDeclaration(fn)) &&
    (ts.isClassDeclaration(fn.parent) || ts.isClassExpression(fn.parent))
  ) {
    return { classNode: fn.parent, member: fn };
  }
  if (
    (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) &&
    ts.isPropertyDeclaration(fn.parent) &&
    (ts.isClassDeclaration(fn.parent.parent) || ts.isClassExpression(fn.parent.parent))
  ) {
    return { classNode: fn.parent.parent, member: fn.parent };
  }
  return undefined;
}

function isExternallyCallable(fn, publicApi, checker) {
  if (publicApi.functions.has(fn)) return true;
  const symbol = functionSymbol(checker, fn);
  if (symbol && publicApi.symbols.has(symbol)) return true;
  const owner = enclosingClass(fn);
  if (!owner?.classNode.name) return false;
  const classSymbol = symbolAt(checker, owner.classNode.name);
  if (!classSymbol || !publicApi.symbols.has(classSymbol)) return false;
  const modifiers = ts.canHaveModifiers(owner.member) ? (ts.getModifiers(owner.member) ?? []) : [];
  return !modifiers.some(
    (modifier) =>
      modifier.kind === ts.SyntaxKind.PrivateKeyword ||
      modifier.kind === ts.SyntaxKind.ProtectedKeyword,
  );
}

function functionEscapesStaticCalls(fn, sourceFiles, checker) {
  const symbol = functionSymbol(checker, fn);
  if (!symbol) return false;
  let escaped = false;
  for (const sourceFile of sourceFiles.values()) {
    const visit = (node) => {
      if (escaped) return;
      if (ts.isIdentifier(node) && symbolAt(checker, node) === symbol) {
        const parent = node.parent;
        const declaration =
          (fn.name === node && ts.isFunctionLike(fn)) ||
          (ts.isVariableDeclaration(parent) && parent.name === node) ||
          (ts.isMethodDeclaration(parent) && parent.name === node);
        const directIdentifierCall = ts.isCallExpression(parent) && parent.expression === node;
        const directMemberCall =
          ts.isPropertyAccessExpression(parent) &&
          parent.name === node &&
          ts.isCallExpression(parent.parent) &&
          parent.parent.expression === parent;
        const moduleLink =
          ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent) || ts.isImportClause(parent);
        if (!declaration && !directIdentifierCall && !directMemberCall && !moduleLink) {
          escaped = true;
          return;
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    if (escaped) break;
  }
  return escaped;
}

function resolveTransportContractSymbols(contracts, sourceFiles, checker) {
  const symbols = new Set();
  for (const contract of contracts ?? []) {
    if (!contract || typeof contract.path !== "string" || typeof contract.exportName !== "string") {
      continue;
    }
    const path = contract.path.replaceAll("\\", "/");
    const sourceFile = sourceFiles.get(path);
    if (!sourceFile) continue;
    const exported = moduleExports(sourceFile, checker).find(
      (candidate) => candidate.getName() === contract.exportName,
    );
    const symbol = resolvedSymbol(checker, exported);
    if (symbol) symbols.add(symbol);
  }
  return symbols;
}

function isConstDeclaration(declaration) {
  return (
    ts.isVariableDeclaration(declaration) &&
    ts.isVariableDeclarationList(declaration.parent) &&
    (declaration.parent.flags & ts.NodeFlags.Const) !== 0
  );
}

function numericInterpolation(expression, checker) {
  const node = unwrapped(expression);
  if (ts.isNumericLiteral(node)) return true;
  if (ts.isPrefixUnaryExpression(node)) return numericInterpolation(node.operand, checker);
  if (ts.isPropertyAccessExpression(node) && node.name.text === "length") {
    try {
      if (checker.typeToString(checker.getTypeAtLocation(node)) === "number") return true;
    } catch {
      // Fall through to syntax evidence when the no-lib analysis lacks array members.
    }
    const target = unwrapped(node.expression);
    if (ts.isStringLiteral(target) || ts.isArrayLiteralExpression(target)) return true;
    if (ts.isIdentifier(target)) {
      const symbol = symbolAt(checker, target);
      for (const declaration of symbol?.declarations ?? []) {
        let type = declaration.type;
        while (type && ts.isTypeOperatorNode(type)) type = type.type;
        if (
          type &&
          (ts.isArrayTypeNode(type) ||
            ts.isTupleTypeNode(type) ||
            type.kind === ts.SyntaxKind.StringKeyword ||
            (ts.isTypeReferenceNode(type) &&
              ts.isIdentifier(type.typeName) &&
              (type.typeName.text === "Array" || type.typeName.text === "ReadonlyArray")))
        ) {
          return true;
        }
        if (
          ts.isVariableDeclaration(declaration) &&
          declaration.initializer &&
          (ts.isArrayLiteralExpression(declaration.initializer) ||
            ts.isStringLiteral(declaration.initializer))
        ) {
          return true;
        }
      }
    }
    return false;
  }
  if (ts.isBinaryExpression(node)) {
    return numericInterpolation(node.left, checker) && numericInterpolation(node.right, checker);
  }
  if (ts.isIdentifier(node)) {
    try {
      return checker.typeToString(checker.getTypeAtLocation(node)) === "number";
    } catch {
      return false;
    }
  }
  return false;
}

function createEvaluator(checker, maxAlternatives) {
  const cache = new Map();

  const limited = (values, node) => {
    const unique = [...new Set(values)];
    return unique.length <= maxAlternatives
      ? { values: unique }
      : { error: `static SQL expansion exceeds ${maxAlternatives} alternatives`, node };
  };

  const product = (left, right, node) => {
    if (left.error) return left;
    if (right.error) return right;
    const values = [];
    for (const prefix of left.values) {
      for (const suffix of right.values) values.push(`${prefix}${suffix}`);
    }
    return limited(values, node);
  };

  const evaluate = (expression, bindings = new Map(), stack = new Set()) => {
    const node = unwrapped(expression);
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      return { values: [node.text] };
    }
    if (ts.isNumericLiteral(node)) return { values: [node.text] };
    if (node.kind === ts.SyntaxKind.TrueKeyword) return { values: ["true"] };
    if (node.kind === ts.SyntaxKind.FalseKeyword) return { values: ["false"] };
    if (ts.isConditionalExpression(node)) {
      const yes = evaluate(node.whenTrue, bindings, stack);
      const no = evaluate(node.whenFalse, bindings, stack);
      if (yes.error) return yes;
      if (no.error) return no;
      return limited([...yes.values, ...no.values], node);
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      return product(
        evaluate(node.left, bindings, stack),
        evaluate(node.right, bindings, stack),
        node,
      );
    }
    if (ts.isTemplateExpression(node)) {
      let result = { values: [node.head.text] };
      for (const span of node.templateSpans) {
        let inserted = evaluate(span.expression, bindings, stack);
        if (
          inserted.error &&
          result.values.every((value) => value.endsWith("$")) &&
          numericInterpolation(span.expression, checker)
        ) {
          inserted = { values: ["1"] };
        }
        result = product(result, inserted, span.expression);
        if (result.error) return result;
        result = limited(
          result.values.map((value) => `${value}${span.literal.text}`),
          span.literal,
        );
      }
      return result;
    }
    if (ts.isIdentifier(node)) {
      const symbol = symbolAt(checker, node);
      if (!symbol) return { error: `unresolved identifier ${node.text}`, node };
      if (bindings.has(symbol)) return { values: bindings.get(symbol) };
      const declaration = (symbol.declarations ?? []).find(isConstDeclaration);
      if (!declaration?.initializer) {
        return { error: `identifier ${node.text} is not a statically initialized const`, node };
      }
      if (stack.has(symbol)) return { error: `cyclic static SQL reference ${node.text}`, node };
      if (bindings.size === 0 && cache.has(symbol)) return cache.get(symbol);
      const nextStack = new Set(stack).add(symbol);
      const result = evaluate(declaration.initializer, bindings, nextStack);
      if (bindings.size === 0) cache.set(symbol, result);
      return result;
    }
    if (ts.isCallExpression(node)) {
      if (
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === "join" &&
        ts.isCallExpression(node.expression.expression) &&
        ts.isPropertyAccessExpression(node.expression.expression.expression) &&
        node.expression.expression.expression.name.text === "split"
      ) {
        const splitCall = node.expression.expression;
        const source = evaluate(splitCall.expression.expression, bindings, stack);
        const separator = splitCall.arguments[0]
          ? evaluate(splitCall.arguments[0], bindings, stack)
          : { values: [","] };
        const joiner = node.arguments[0]
          ? evaluate(node.arguments[0], bindings, stack)
          : { values: [","] };
        if (source.error) return source;
        if (separator.error) return separator;
        if (joiner.error) return joiner;
        const values = [];
        for (const text of source.values) {
          for (const splitOn of separator.values) {
            for (const joinWith of joiner.values) values.push(text.split(splitOn).join(joinWith));
          }
        }
        return limited(values, node);
      }
      const symbol = symbolAt(checker, node.expression);
      const fn = localFunctionForSymbol(symbol);
      if (!fn)
        return {
          error: `call ${node.expression.getText()} is not a local static SQL function`,
          node,
        };
      if (symbol && stack.has(symbol)) {
        return { error: `recursive static SQL function ${node.expression.getText()}`, node };
      }
      const nextBindings = new Map(bindings);
      for (let index = 0; index < fn.parameters.length; index += 1) {
        const parameter = fn.parameters[index];
        if (!ts.isIdentifier(parameter.name)) {
          return { error: "destructured static SQL parameters are unsupported", node: parameter };
        }
        const parameterSymbol = symbolAt(checker, parameter.name);
        const argument = node.arguments[index] ?? parameter.initializer;
        if (!parameterSymbol || !argument) {
          return { error: `missing static argument ${parameter.name.text}`, node };
        }
        if (!parameterIsUnmodified(fn, parameterSymbol, checker)) {
          return {
            error: `static SQL parameter ${parameter.name.text} is modified inside its function`,
            node: parameter,
          };
        }
        const evaluated = evaluate(argument, bindings, stack);
        if (evaluated.error) return evaluated;
        nextBindings.set(parameterSymbol, evaluated.values);
      }
      const returns = immediateReturns(fn);
      if (returns.length === 0) return { error: "static SQL function has no return value", node };
      const results = [];
      const nextStack = symbol ? new Set(stack).add(symbol) : stack;
      for (const returned of returns) {
        const evaluated = evaluate(returned, nextBindings, nextStack);
        if (evaluated.error) return evaluated;
        results.push(...evaluated.values);
      }
      return limited(results, node);
    }
    return { error: `unsupported dynamic SQL expression ${node.getText()}`, node };
  };

  return evaluate;
}

function invocationBindings(fn, callSites, checker, evaluate) {
  const symbol = functionSymbol(checker, fn);
  if (!symbol) return [];
  const contexts = [];
  for (const call of callSites.get(symbol) ?? []) {
    const bindings = new Map();
    for (let index = 0; index < fn.parameters.length; index += 1) {
      const parameter = fn.parameters[index];
      if (!ts.isIdentifier(parameter.name)) continue;
      const parameterSymbol = symbolAt(checker, parameter.name);
      const argument = call.arguments[index] ?? parameter.initializer;
      if (!parameterSymbol || !argument) continue;
      if (!parameterIsUnmodified(fn, parameterSymbol, checker)) continue;
      const result = evaluate(argument);
      if (!result.error) bindings.set(parameterSymbol, result.values);
    }
    contexts.push(bindings);
  }
  return contexts;
}

function queryMembers(expression, evaluate) {
  if (ts.isPropertyAccessExpression(expression)) {
    return expression.name.text === "query" || expression.name.text === "exec"
      ? [{ name: expression.name.text, receiver: expression.expression }]
      : [];
  }
  if (ts.isElementAccessExpression(expression)) {
    const key = expression.argumentExpression;
    if (!key) return [];
    const result = evaluate(key);
    if (result.error) return [];
    return [...new Set(result.values)]
      .filter((name) => name === "query" || name === "exec")
      .map((name) => ({ name, receiver: expression.expression }));
  }
  return [];
}

function stringCallableStatus(expression, checker) {
  try {
    const type = checker.getTypeAtLocation(expression);
    if ((type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0) return "unknown";
    const signatures = type.getCallSignatures();
    if (signatures.length === 0) return "no";
    let unknown = false;
    const matched = signatures.some((signature) => {
      const first = signature.parameters[0];
      if (!first) return false;
      const declaration = first.valueDeclaration ?? first.declarations?.[0] ?? expression;
      const parameterType = checker.getTypeOfSymbolAtLocation(first, declaration);
      if ((parameterType.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0) {
        unknown = true;
        return false;
      }
      return /\bstring\b/u.test(checker.typeToString(parameterType));
    });
    if (matched) return "yes";
    return unknown ? "unknown" : "no";
  } catch {
    return "unknown";
  }
}

const canBeStringCallable = (expression, checker) =>
  stringCallableStatus(expression, checker) !== "no";

function bindingPropertyNames(element, evaluate) {
  const property = element.propertyName ?? element.name;
  if (ts.isIdentifier(property) || ts.isStringLiteral(property)) return [property.text];
  if (!ts.isComputedPropertyName(property)) return [];
  const result = evaluate(property.expression);
  return result.error ? undefined : [...new Set(result.values)];
}

function visitBindingLeaves(pattern, evaluate, visit) {
  for (const element of pattern.elements) {
    if (ts.isOmittedExpression(element)) continue;
    if (ts.isIdentifier(element.name)) {
      visit(element, bindingPropertyNames(element, evaluate));
    } else if (ts.isObjectBindingPattern(element.name) || ts.isArrayBindingPattern(element.name)) {
      visitBindingLeaves(element.name, evaluate, visit);
    }
  }
}

function hasOnlyReceiverBindArgument(call) {
  return call.arguments.length === 1 && !ts.isSpreadElement(call.arguments[0]);
}

function collectQueryAliases(sourceFiles, checker, evaluate) {
  const aliases = new Map();
  const errors = [];
  const reportedBindings = new Set();
  const declarations = [];
  for (const sourceFile of sourceFiles.values()) {
    const visit = (node) => {
      if (ts.isVariableDeclaration(node)) declarations.push(node);
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const declaration of declarations) {
      if (!declaration.initializer) continue;
      if (ts.isObjectBindingPattern(declaration.name)) {
        visitBindingLeaves(declaration.name, evaluate, (element, propertyNames) => {
          if (
            propertyNames === undefined &&
            receiverMayHaveSqlMethod(declaration.initializer, checker) &&
            !reportedBindings.has(element)
          ) {
            const sourceFile = declaration.getSourceFile();
            errors.push(
              `${sourceFile.fileName}:${lineOf(sourceFile, element)}: computed destructured SQL method key cannot be analyzed safely`,
            );
            reportedBindings.add(element);
            return;
          }
          const names = (propertyNames ?? []).filter((name) => name === "query" || name === "exec");
          const symbol = symbolAt(checker, element.name);
          if (
            propertyNames &&
            names.length > 0 &&
            (names.length !== 1 || propertyNames.length !== 1) &&
            !reportedBindings.has(element)
          ) {
            const sourceFile = declaration.getSourceFile();
            errors.push(
              `${sourceFile.fileName}:${lineOf(sourceFile, element)}: computed destructured SQL method key cannot be analyzed safely`,
            );
            reportedBindings.add(element);
            return;
          }
          if (!symbol || names.length !== 1 || aliases.has(symbol)) return;
          if (!isConstDeclaration(declaration)) {
            const sourceFile = declaration.getSourceFile();
            errors.push(
              `${sourceFile.fileName}:${lineOf(sourceFile, declaration)}: mutable SQL method alias cannot be analyzed safely`,
            );
            return;
          }
          aliases.set(symbol, { name: names[0], receiver: declaration.initializer });
          changed = true;
        });
        continue;
      }
      if (!ts.isIdentifier(declaration.name)) continue;
      const symbol = symbolAt(checker, declaration.name);
      if (!symbol || aliases.has(symbol)) continue;
      let methods = queryMembers(declaration.initializer, evaluate);
      if (methods.length > 0 && !canBeStringCallable(declaration.initializer, checker))
        methods = [];
      if (
        methods.length === 0 &&
        ts.isCallExpression(declaration.initializer) &&
        ts.isPropertyAccessExpression(declaration.initializer.expression) &&
        declaration.initializer.expression.name.text === "bind"
      ) {
        if (!hasOnlyReceiverBindArgument(declaration.initializer)) continue;
        methods = queryMembers(declaration.initializer.expression.expression, evaluate);
        if (
          methods.length > 0 &&
          !canBeStringCallable(declaration.initializer.expression.expression, checker)
        ) {
          methods = [];
        }
      }
      if (methods.length === 0 && ts.isIdentifier(declaration.initializer)) {
        const target = symbolAt(checker, declaration.initializer);
        const method = target ? aliases.get(target) : undefined;
        if (method) methods = [method];
      }
      if (methods.length === 1) {
        if (!isConstDeclaration(declaration)) {
          const sourceFile = declaration.getSourceFile();
          errors.push(
            `${sourceFile.fileName}:${lineOf(sourceFile, declaration)}: mutable SQL method alias cannot be analyzed safely`,
          );
          continue;
        }
        aliases.set(symbol, methods[0]);
        changed = true;
      }
    }
  }
  return { aliases, errors };
}

function aliasedQueryMethod(call, aliases, checker, evaluate) {
  const direct = queryMembers(call.expression, evaluate);
  if (direct.length > 0) return direct;
  if (
    ts.isCallExpression(call.expression) &&
    ts.isPropertyAccessExpression(call.expression.expression) &&
    call.expression.expression.name.text === "bind"
  ) {
    if (!hasOnlyReceiverBindArgument(call.expression)) return [];
    const bound = queryMembers(call.expression.expression.expression, evaluate);
    if (bound.length > 0 && canBeStringCallable(call.expression.expression.expression, checker)) {
      return bound;
    }
  }
  if (!ts.isIdentifier(call.expression)) return [];
  const symbol = symbolAt(checker, call.expression);
  const method = symbol ? aliases.get(symbol) : undefined;
  return method ? [method] : [];
}

function typeMayNameSqlMethod(type) {
  if (type.isUnion?.()) return type.types.some(typeMayNameSqlMethod);
  return (
    (type.flags & ts.TypeFlags.StringLiteral) !== 0 &&
    (type.value === "query" || type.value === "exec")
  );
}

function receiverHasSqlMethod(receiver, checker) {
  try {
    const type = checker.getTypeAtLocation(receiver);
    for (const name of ["query", "exec"]) {
      const property = type.getProperty(name);
      if (!property) continue;
      const declaration = property.valueDeclaration ?? property.declarations?.[0] ?? receiver;
      const propertyType = checker.getTypeOfSymbolAtLocation(property, declaration);
      for (const signature of propertyType.getCallSignatures()) {
        const first = signature.parameters[0];
        if (!first) continue;
        const parameterDeclaration = first.valueDeclaration ?? first.declarations?.[0] ?? receiver;
        const parameterType = checker.getTypeOfSymbolAtLocation(first, parameterDeclaration);
        if (
          (parameterType.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0 ||
          /\bstring\b/u.test(checker.typeToString(parameterType))
        ) {
          return true;
        }
      }
    }
  } catch {
    return false;
  }
  return false;
}

function receiverMayHaveSqlMethod(receiver, checker) {
  try {
    const type = checker.getTypeAtLocation(receiver);
    if ((type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0) return true;
  } catch {
    return true;
  }
  return receiverHasSqlMethod(receiver, checker);
}

function assignmentPatternSqlStatus(pattern, evaluate) {
  if (!ts.isObjectLiteralExpression(pattern)) return "no";
  let unknown = false;
  for (const property of pattern.properties) {
    if (ts.isSpreadAssignment(property)) {
      unknown = true;
      continue;
    }
    if (ts.isShorthandPropertyAssignment(property)) {
      if (property.name.text === "query" || property.name.text === "exec") return "yes";
      continue;
    }
    if (!ts.isPropertyAssignment(property)) continue;
    let names;
    if (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) {
      names = [property.name.text];
    } else if (ts.isComputedPropertyName(property.name)) {
      const result = evaluate(property.name.expression);
      if (result.error) {
        unknown = true;
        names = [];
      } else {
        names = result.values;
      }
    } else {
      names = [];
    }
    if (names.some((name) => name === "query" || name === "exec")) return "yes";
    const nested = assignmentPatternSqlStatus(property.initializer, evaluate);
    if (nested === "yes") return "yes";
    if (nested === "unknown") unknown = true;
  }
  return unknown ? "unknown" : "no";
}

function unsupportedQueryFormErrors(sourceFiles, checker, evaluate) {
  const errors = [];
  const calledSymbols = new Set();
  for (const sourceFile of sourceFiles.values()) {
    const collect = (node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        const symbol = symbolAt(checker, node.expression);
        if (symbol) calledSymbols.add(symbol);
      }
      ts.forEachChild(node, collect);
    };
    collect(sourceFile);
  }
  for (const sourceFile of sourceFiles.values()) {
    const report = (node, message) =>
      errors.push(`${sourceFile.fileName}:${lineOf(sourceFile, node)}: ${message}`);
    const visit = (node) => {
      if (ts.isParameter(node) && ts.isObjectBindingPattern(node.name)) {
        visitBindingLeaves(node.name, evaluate, (element, names) => {
          const symbol = symbolAt(checker, element.name);
          if (
            symbol &&
            calledSymbols.has(symbol) &&
            (names === undefined || names.some((name) => name === "query" || name === "exec"))
          ) {
            report(element, "destructured SQL method parameter cannot be analyzed safely");
          }
        });
      }
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
        node.operatorToken.kind <= ts.SyntaxKind.LastAssignment &&
        ts.isObjectLiteralExpression(node.left)
      ) {
        const status = assignmentPatternSqlStatus(node.left, evaluate);
        if (
          status === "yes" ||
          (status === "unknown" && receiverMayHaveSqlMethod(node.right, checker))
        ) {
          report(node, "SQL method assignment pattern cannot be analyzed safely");
        }
      }
      if (ts.isCallExpression(node) && ts.isElementAccessExpression(node.expression)) {
        const key = node.expression.argumentExpression;
        if (key && evaluate(key).error) {
          let reported = false;
          if (ts.isIdentifier(key)) {
            const symbol = symbolAt(checker, key);
            const declaration = (symbol?.declarations ?? []).find(ts.isVariableDeclaration);
            if (declaration?.initializer && !isConstDeclaration(declaration)) {
              const initial = evaluate(declaration.initializer);
              if (
                !initial.error &&
                initial.values.some((value) => value === "query" || value === "exec")
              ) {
                report(node, "mutable computed SQL method key cannot be analyzed safely");
                reported = true;
              }
            }
          }
          if (
            !reported &&
            (typeMayNameSqlMethod(checker.getTypeAtLocation(key)) ||
              receiverMayHaveSqlMethod(node.expression.expression, checker))
          ) {
            report(node, "computed SQL method key cannot be analyzed safely");
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return errors;
}

function queryAliasEscapeErrors(sourceFiles, aliases, checker, evaluate, publicApi) {
  const errors = [];
  const report = (node, message) => {
    const sourceFile = node.getSourceFile();
    errors.push(`${sourceFile.fileName}:${lineOf(sourceFile, node)}: ${message}`);
  };
  for (const sourceFile of sourceFiles.values()) {
    const visit = (node) => {
      if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
        if (queryMembers(node, evaluate).length > 0 && canBeStringCallable(node, checker)) {
          const parent = node.parent;
          const directCall = ts.isCallExpression(parent) && parent.expression === node;
          const aliasDeclaration = ts.isVariableDeclaration(parent) && parent.initializer === node;
          const bindCall =
            ts.isPropertyAccessExpression(parent) &&
            parent.expression === node &&
            parent.name.text === "bind" &&
            ts.isCallExpression(parent.parent) &&
            parent.parent.expression === parent
              ? parent.parent
              : undefined;
          const invalidBindArguments = Boolean(bindCall && !hasOnlyReceiverBindArgument(bindCall));
          if (invalidBindArguments) {
            report(bindCall, "pre-bound SQL bind arguments cannot be analyzed safely");
          }
          const boundUse = bindCall?.parent;
          const boundAliasSymbol =
            bindCall &&
            ts.isVariableDeclaration(boundUse) &&
            boundUse.initializer === bindCall &&
            ts.isIdentifier(boundUse.name)
              ? symbolAt(checker, boundUse.name)
              : undefined;
          const trackedBoundAlias = Boolean(
            boundAliasSymbol && isConstDeclaration(boundUse) && aliases.has(boundAliasSymbol),
          );
          const directBoundCall = Boolean(
            bindCall &&
              ts.isCallExpression(boundUse) &&
              boundUse.expression === bindCall &&
              !invalidBindArguments,
          );
          if (
            !invalidBindArguments &&
            !directCall &&
            !aliasDeclaration &&
            !trackedBoundAlias &&
            !directBoundCall
          ) {
            report(node, "SQL method reference escapes static analysis");
          }
        }
      }
      if (ts.isIdentifier(node)) {
        const parent = node.parent;
        const symbol =
          ts.isShorthandPropertyAssignment(parent) && parent.name === node
            ? resolvedSymbol(
                checker,
                checker.getShorthandAssignmentValueSymbol(parent) ??
                  checker.getSymbolAtLocation(node),
              )
            : symbolAt(checker, node);
        if (symbol && aliases.has(symbol)) {
          const declaration =
            (ts.isVariableDeclaration(parent) && parent.name === node) ||
            (ts.isBindingElement(parent) && parent.name === node);
          if (declaration && publicApi.symbols.has(symbol)) {
            report(node, "public SQL method alias escapes static analysis");
            return;
          }
          const directCall = ts.isCallExpression(parent) && parent.expression === node;
          const aliasChain =
            ts.isVariableDeclaration(parent) &&
            parent.initializer === node &&
            isConstDeclaration(parent);
          if (!declaration && !directCall && !aliasChain) {
            report(node, "SQL method alias escapes static analysis");
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return errors;
}

function isProvenNonSqlCall(call, method, checker) {
  if (method.name === "exec" && ts.isRegularExpressionLiteral(unwrapped(method.receiver))) {
    return true;
  }
  if (call.arguments.length !== 0) return false;
  const signature = checker.getResolvedSignature(call);
  return Boolean(signature && signature.parameters.length === 0);
}

function isFormalParameterArgument(argument, checker) {
  const node = unwrapped(argument);
  if (!ts.isIdentifier(node)) return false;
  const symbol = symbolAt(checker, node);
  return Boolean((symbol?.declarations ?? []).some(ts.isParameter));
}

function nodeContainsSymbol(node, expected, checker) {
  let found = false;
  const visit = (current) => {
    if (found) return;
    if (
      ts.isShorthandPropertyAssignment(current) &&
      resolvedSymbol(checker, checker.getShorthandAssignmentValueSymbol(current)) === expected
    ) {
      found = true;
      return;
    }
    if (ts.isIdentifier(current) && symbolAt(checker, current) === expected) {
      found = true;
      return;
    }
    ts.forEachChild(current, visit);
  };
  visit(node);
  return found;
}

function parameterIsUnmodified(callback, parameterSymbol, checker) {
  let modified = false;
  const visit = (node) => {
    if (modified) return;
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      node.operatorToken.kind <= ts.SyntaxKind.LastAssignment &&
      nodeContainsSymbol(node.left, parameterSymbol, checker)
    ) {
      modified = true;
      return;
    }
    if (
      (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
      (node.operator === ts.SyntaxKind.PlusPlusToken ||
        node.operator === ts.SyntaxKind.MinusMinusToken) &&
      nodeContainsSymbol(node.operand, parameterSymbol, checker)
    ) {
      modified = true;
      return;
    }
    if (
      (ts.isForInStatement(node) || ts.isForOfStatement(node)) &&
      nodeContainsSymbol(node.initializer, parameterSymbol, checker)
    ) {
      modified = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  if (callback.body) visit(callback.body);
  return !modified;
}

function sqlTransportFactory(call, argument, checker, contractSymbols) {
  const callback = containingFunction(call);
  if (!callback || callback.parameters.length === 0) return null;
  const firstParameter = callback.parameters[0];
  if (!ts.isIdentifier(firstParameter.name)) return null;
  const argumentNode = unwrapped(argument);
  if (!ts.isIdentifier(argumentNode)) return null;
  const argumentSymbol = symbolAt(checker, argumentNode);
  const parameterSymbol = symbolAt(checker, firstParameter.name);
  if (!argumentSymbol || argumentSymbol !== parameterSymbol) return null;
  const parameterUnmodified = parameterIsUnmodified(callback, parameterSymbol, checker);

  const factoryCall = callback.parent;
  if (!ts.isCallExpression(factoryCall) || !factoryCall.arguments.includes(callback)) return null;
  const factorySymbol = symbolAt(checker, factoryCall.expression);
  const declaration = (factorySymbol?.declarations ?? []).find(
    (candidate) =>
      ts.isFunctionDeclaration(candidate) ||
      (ts.isVariableDeclaration(candidate) &&
        candidate.initializer &&
        (ts.isArrowFunction(candidate.initializer) ||
          ts.isFunctionExpression(candidate.initializer))),
  );
  if (!declaration) return null;
  const factoryFunction = ts.isVariableDeclaration(declaration)
    ? declaration.initializer
    : declaration;
  const exported = ts.canHaveModifiers(declaration)
    ? (ts.getModifiers(declaration) ?? []).some(
        (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
      )
    : false;
  let returnsSql = false;
  if (factoryFunction) {
    const signature = checker.getSignatureFromDeclaration(factoryFunction);
    if (signature) {
      returnsSql = /\bSql\b/u.test(
        checker.typeToString(checker.getReturnTypeOfSignature(signature)),
      );
    }
    if (!returnsSql && factoryFunction.type) {
      returnsSql = /\bSql\b/u.test(factoryFunction.type.getText(factoryFunction.getSourceFile()));
    }
  }
  return {
    exported,
    name: factorySymbol?.name ?? factoryCall.expression.getText(),
    path: declaration.getSourceFile().fileName,
    parameterUnmodified,
    publicContract: Boolean(
      parameterUnmodified && factorySymbol && contractSymbols.has(factorySymbol),
    ),
    returnsSql,
  };
}

/**
 * Extract finite SQL strings from TypeScript/JavaScript runtime sources.
 * The caller owns runtime-source classification and SQL parsing.
 */
export function extractRuntimeSql(sources, options = {}) {
  const normalized = normalizedSources(sources);
  const maxAlternatives = options.maxAlternatives ?? DEFAULT_MAX_ALTERNATIVES;
  if (!Number.isSafeInteger(maxAlternatives) || maxAlternatives < 1) {
    throw new TypeError("maxAlternatives must be a positive safe integer");
  }
  const { checker, sourceFiles } = createAnalysisProgram(normalized);
  const evaluate = createEvaluator(checker, maxAlternatives);
  const publicApi = collectPublicSymbols(sourceFiles, checker, options.publicEntryPoints);
  const transportContractSymbols = resolveTransportContractSymbols(
    options.sqlTransportContracts,
    sourceFiles,
    checker,
  );
  const queryAliasAnalysis = collectQueryAliases(sourceFiles, checker, evaluate);
  const queryAliases = queryAliasAnalysis.aliases;
  const callSites = new Map();
  const sqlCalls = [];
  const sourceErrors = [
    ...publicApi.errors,
    ...queryAliasAnalysis.errors,
    ...queryAliasEscapeErrors(sourceFiles, queryAliases, checker, evaluate, publicApi),
    ...unsupportedQueryFormErrors(sourceFiles, checker, evaluate),
  ];

  for (const sourceFile of sourceFiles.values()) {
    for (const diagnostic of sourceFile.parseDiagnostics ?? []) {
      const line = sourceFile.getLineAndCharacterOfPosition(diagnostic.start ?? 0).line + 1;
      sourceErrors.push(
        `${sourceFile.fileName}:${line}: TypeScript parse failure: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")}`,
      );
    }
    const visit = (node) => {
      if (ts.isCallExpression(node)) {
        const calledSymbol = symbolAt(checker, node.expression);
        if (calledSymbol) {
          const calls = callSites.get(calledSymbol) ?? [];
          calls.push(node);
          callSites.set(calledSymbol, calls);
        }
        const methods = aliasedQueryMethod(node, queryAliases, checker, evaluate);
        for (const method of methods) {
          if (!isProvenNonSqlCall(node, method, checker)) {
            sqlCalls.push({ call: node, method, sourceFile });
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }

  const queries = [];
  const errors = [...sourceErrors];
  const forwarded = [];
  for (const { call, method, sourceFile } of sqlCalls) {
    const path = sourceFile.fileName;
    const line = lineOf(sourceFile, call);
    const argument = call.arguments[0];
    if (!argument) {
      errors.push(`${path}:${line}: SQL call has no query argument`);
      continue;
    }
    const forwardingContext = {
      argumentIsParameter: isFormalParameterArgument(argument, checker),
      argumentText: argument.getText(sourceFile),
      callText: call.getText(sourceFile),
      line,
      path,
      receiverText: method.receiver.getText(sourceFile),
      sqlTransportFactory: sqlTransportFactory(call, argument, checker, transportContractSymbols),
    };

    let results = [evaluate(argument)];
    if (results[0].error) {
      const fn = containingFunction(call);
      if (fn) {
        if (isExternallyCallable(fn, publicApi, checker)) {
          results = [
            {
              error: "public SQL wrapper may have callers outside the analyzed source set",
              node: argument,
            },
          ];
        } else if (functionEscapesStaticCalls(fn, sourceFiles, checker)) {
          results = [
            {
              error: "SQL wrapper escapes direct statically enumerable calls",
              node: argument,
            },
          ];
        } else {
          const contexts = invocationBindings(fn, callSites, checker, evaluate);
          if (contexts.length > 0)
            results = contexts.map((bindings) => evaluate(argument, bindings));
        }
      }
    }
    const failures = results.filter((result) => result.error);
    if (failures.length > 0) {
      if (options.isForwardedQuery?.(forwardingContext) === true) {
        forwarded.push({ path, line, reason: "neutral SQL transport forwards caller-owned text" });
        continue;
      }
      const reasons = [...new Set(failures.map((failure) => failure.error))].join("; ");
      errors.push(`${path}:${line}: cannot statically determine SQL: ${reasons}`);
      continue;
    }
    const alternatives = [...new Set(results.flatMap((result) => result.values))];
    if (alternatives.length > maxAlternatives) {
      errors.push(
        `${path}:${line}: cannot statically determine SQL: expansion exceeds ${maxAlternatives} alternatives`,
      );
      continue;
    }
    for (const sql of alternatives) queries.push({ path, line, sql });
  }

  const key = (item) => `${item.path}\u0000${item.line}\u0000${item.sql ?? item.reason}`;
  return {
    queries: [...new Map(queries.map((item) => [key(item), item])).values()].sort((a, b) =>
      key(a).localeCompare(key(b)),
    ),
    errors: [...new Set(errors)].sort(),
    forwarded: [...new Map(forwarded.map((item) => [key(item), item])).values()].sort((a, b) =>
      key(a).localeCompare(key(b)),
    ),
  };
}
