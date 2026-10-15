import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { collectChangeState, repositoryRoot } from "../changes/state.mjs";
import { loadSemanticArchitecture } from "./semantic-core.mjs";
import { diffSemanticModels } from "./semantic-diff.mjs";
import { diffFptDomainTruth } from "./semantic-drift.mjs";
import { compareSemanticFeedback } from "./semantic-feedback.mjs";
import { compileAgentContext, planSemanticChange } from "./semantic-planning.mjs";
import { renderSemanticView } from "./semantic-projection.mjs";
import { querySemanticArchitecture } from "./semantic-query.mjs";
import { writePackageSemanticDocs } from "./write-package-semantics.mjs";

const queryVerbs = new Set([
  "owner",
  "concept",
  "capability",
  "fpt",
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
  "locators",
  "fpt-references",
  "fpt-coverage",
  "explain",
]);

const usage =
  "Usage: pnpm semantic <check|owner|concept|capability|fpt|resolve|neighbors|path|impact|contracts|consumers|dependencies|invariants|boundaries|evidence|truth|locators|fpt-references|fpt-coverage|explain|plan|context|diff|drift|feedback|view|package-docs> ...";

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
    const words = [];
    let task = "source";
    for (let at = 0; at < rest.length; at++) {
      if (rest[at] === "--task") {
        task = rest[++at];
        if (!["docs", "source", "schema"].includes(task))
          throw new Error("Usage: pnpm semantic context [--task docs|source|schema] <intent>");
      } else words.push(rest[at]);
    }
    const intent = words.join(" ").trim();
    if (!intent) throw new Error('Usage: pnpm semantic context "<change intent>"');
    const context = compileAgentContext(compiled, intent, { task });
    const state = collectChangeState();
    context.source = {
      revision: state.head,
      clean: state.clean,
      workingTreeFiles: state.workspaceFiles,
    };
    context.reading.required = await Promise.all(
      context.reading.required.map(async (entry) => {
        try {
          const bytes = await readFile(resolve(repositoryRoot, entry.path));
          return { ...entry, sha256: createHash("sha256").update(bytes).digest("hex") };
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
          return { ...entry, sha256: null };
        }
      }),
    );
    for (const entry of context.reading.required.filter((entry) => entry.sha256 === null))
      context.reading.unresolved.push({ kind: "missing-source", path: entry.path });
    if (context.reading.unresolved.length)
      context.reading.fallback =
        "Read the complete Mandatory governing set from AGENTS.md and resolve missing or ambiguous sources before implementation.";
    return context;
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
        "Usage: pnpm semantic drift <before-fpt-source.json> <after-fpt-source.json> [semantic-model.json]",
      );
    }
    const [before, after] = await Promise.all(rest.slice(0, 2).map(readJson));
    const semanticModel = rest[2] ? await readJson(rest[2]) : compiled.model;
    return diffFptDomainTruth(before, after, semanticModel);
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

  if (verb === "package-docs") {
    if (rest.length) throw new Error("Usage: pnpm semantic package-docs");
    return writePackageSemanticDocs(compiled);
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
