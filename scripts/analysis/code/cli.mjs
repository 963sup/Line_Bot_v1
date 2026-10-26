import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { definitions, references, rename, structuralRewrite, structuralSearch } from "./core.mjs";
import { codeFacts } from "./facts.mjs";

export const usage = `Usage:
  pnpm code search --rule <yaml> --scope <path> [--scope <path>] [--exclude <path>]
  pnpm code facts --scope <path> [--scope <path>] [--exclude <path>]
  pnpm code rewrite --rule <yaml> --scope <path> [--scope <path>] [--exclude <path>] --objective <text> --out <.artifacts/plan.json>
  pnpm code definition <file> <1-based-line> <1-based-column>
  pnpm code references <file> <1-based-line> <1-based-column>
  pnpm code rename <file> <1-based-line> <1-based-column> <newName> --objective <text> --out <.artifacts/plan.json>`;

function fail(message) {
  throw new Error(message);
}

function parseOptions(args, { allowed, repeatable = new Set() }) {
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!flag?.startsWith("--") || value === undefined || value.startsWith("--"))
      fail(`Invalid option near ${flag ?? "end of command"}.`);
    const name = flag.slice(2);
    if (!allowed.has(name)) fail(`Unknown option: ${flag}`);
    if (repeatable.has(name)) {
      options[`${name}s`] = [...(options[`${name}s`] ?? []), value];
    } else if (options[name] !== undefined) {
      fail(`${flag} may be provided only once.`);
    } else {
      options[name] = value;
    }
  }
  return options;
}

function required(options, keys) {
  for (const key of keys) if (!options[key]) fail(`--${key} is required.`);
}

function positiveInteger(value, label) {
  if (!/^[1-9]\d*$/u.test(value)) fail(`${label} must be a positive 1-based integer.`);
  return Number(value);
}

export function execute(argv, { root = process.cwd() } = {}) {
  const [operation, ...args] = argv;
  if (operation === "--help" || operation === "-h") return { operation: "help", usage };
  if (operation === "facts") {
    const options = parseOptions(args, {
      allowed: new Set(["scope", "exclude"]),
      repeatable: new Set(["scope", "exclude"]),
    });
    if (!options.scopes?.length) fail("--scope is required.");
    return codeFacts(root, options);
  }
  if (operation === "search" || operation === "rewrite") {
    const options = parseOptions(args, {
      allowed: new Set(
        operation === "search"
          ? ["rule", "scope", "exclude"]
          : ["rule", "scope", "exclude", "objective", "out"],
      ),
      repeatable: new Set(["scope", "exclude"]),
    });
    required(options, ["rule"]);
    if (!options.scopes?.length) fail("--scope is required.");
    if (operation === "search") {
      return structuralSearch(root, options);
    }
    required(options, ["objective", "out"]);
    return structuralRewrite(root, options);
  }

  if (operation === "definition" || operation === "references") {
    if (args.length !== 3) fail(`${operation} requires file, line, and column.`);
    const options = {
      file: args[0],
      line: positiveInteger(args[1], "line"),
      column: positiveInteger(args[2], "column"),
    };
    return operation === "definition" ? definitions(root, options) : references(root, options);
  }

  if (operation === "rename") {
    if (args.length < 4) fail("rename requires file, line, column, and newName.");
    const [file, line, column, newName, ...rest] = args;
    const options = parseOptions(rest, { allowed: new Set(["objective", "out"]) });
    required(options, ["objective", "out"]);
    return rename(root, {
      file,
      line: positiveInteger(line, "line"),
      column: positiveInteger(column, "column"),
      newName,
      objective: options.objective,
      out: options.out,
    });
  }

  fail(usage);
}

function isCliMain() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isCliMain()) {
  try {
    const result = execute(process.argv.slice(2));
    console.log(result.operation === "help" ? result.usage : JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(usage);
    process.exitCode = 1;
  }
}
