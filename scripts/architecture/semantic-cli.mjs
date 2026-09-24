import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadSemanticArchitecture } from "./semantic-core.mjs";
import { diffSemanticModels } from "./semantic-diff.mjs";
import { diffSemanticBenchmark } from "./semantic-drift.mjs";
import { compareSemanticFeedback } from "./semantic-feedback.mjs";
import { compileAgentContext, planSemanticChange } from "./semantic-planning.mjs";
import { renderSemanticView } from "./semantic-projection.mjs";
import { querySemanticArchitecture } from "./semantic-query.mjs";

const queryVerbs = new Set([
  "owner",
  "concept",
  "benchmark",
  "resolve",
  "neighbors",
  "path",
  "impact",
  "contracts",
  "consumers",
  "dependencies",
  "invariants",
  "boundaries",
  "evidence",
  "truth",
  "explain",
]);

const usage =
  "Usage: pnpm semantic <check|owner|concept|benchmark|resolve|neighbors|path|impact|contracts|consumers|dependencies|invariants|boundaries|evidence|truth|explain|plan|context|diff|drift|feedback|view> ...";

async function readJson(path) {
  return JSON.parse(await readFile(resolve(path), "utf8"));
}

export async function runSemanticCommand(args) {
  const [verb, ...rest] = args;
  if (!verb) throw new Error(usage);
  const compiled = await loadSemanticArchitecture();

  if (verb === "check") {
    if (compiled.errors.length) {
      throw new Error("Semantic architecture is invalid:\\n" + compiled.errors.join("\\n"));
    }
    return {
      owners: compiled.owners.size,
      concepts: compiled.concepts.size,
      relationships: compiled.relationships.size,
      violations: 0,
    };
  }

  if (queryVerbs.has(verb)) {
    const result = querySemanticArchitecture(compiled, verb, rest);
    if (result === null) throw new Error("Semantic query: no result");
    return result;
  }

  if (verb === "plan") {
    const intent = rest.join(" ").trim();
    if (!intent) throw new Error('Usage: pnpm semantic plan "<change intent>"');
    return planSemanticChange(compiled, intent);
  }

  if (verb === "context") {
    const intent = rest.join(" ").trim();
    if (!intent) throw new Error('Usage: pnpm semantic context "<change intent>"');
    return compileAgentContext(compiled, intent);
  }

  if (verb === "diff") {
    if (rest.length !== 2) {
      throw new Error(
        "Usage: pnpm semantic diff <before-semantic-model.json> <after-semantic-model.json>",
      );
    }
    const [before, after] = await Promise.all(rest.map(readJson));
    const changes = diffSemanticModels(before, after);
    return {
      changes,
      breaking: changes.filter((change) => change.breaking),
      reviewRequired: changes.filter((change) => !change.breaking),
    };
  }

  if (verb === "drift") {
    if (rest.length < 2 || rest.length > 3) {
      throw new Error(
        "Usage: pnpm semantic drift <before-benchmark.json> <after-benchmark.json> [semantic-model.json]",
      );
    }
    const [before, after] = await Promise.all(rest.slice(0, 2).map(readJson));
    const semanticModel = rest[2] ? await readJson(rest[2]) : compiled.model;
    return diffSemanticBenchmark(before, after, semanticModel);
  }

  if (verb === "feedback") {
    if (rest.length !== 1) {
      throw new Error("Usage: pnpm semantic feedback <observation-bundle.json>");
    }
    return compareSemanticFeedback(compiled, await readJson(rest[0]));
  }

  if (verb === "view") {
    return renderSemanticView(compiled, rest[0] ?? "ownership");
  }

  throw new Error(usage);
}

async function main() {
  try {
    const result = await runSemanticCommand(process.argv.slice(2));
    if (typeof result === "string") console.log(result);
    else console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (import.meta.main) main();
