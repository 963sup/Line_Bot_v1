import assert from "node:assert/strict";
import test from "node:test";
import { assertCurrentSourceCoverage } from "../src/adapters/outbound/persistence/wbs-expansion.js";
import { ContentError } from "../src/domain/error.js";

const nodes = [{ id: "work" }, { id: "task" }];

function row(sourceRowId: string, nodeIds: string[] = ["work", "task"]) {
  return {
    documentId: "document",
    revisionId: "revision",
    sourceRowId,
    disposition: "CONTENT_WORK" as const,
    nodeIds,
  };
}

test("Content WBS reader rejects provenance that points to a different revision", () => {
  assert.throws(
    () => assertCurrentSourceCoverage(nodes, [row("line-1", ["work", "removed-task"])]),
    (error) =>
      error instanceof ContentError && error.code === "SOURCE_INVALID" && error.status === 409,
  );
});

test("Content WBS reader rejects duplicate source evidence and commercial mappings", () => {
  assert.throws(
    () => assertCurrentSourceCoverage(nodes, [row("line-1"), row("line-1")]),
    (error) =>
      error instanceof ContentError && error.code === "UNAVAILABLE" && error.status === 503,
  );
  assert.throws(
    () =>
      assertCurrentSourceCoverage(nodes, [
        { ...row("line-2"), disposition: "COMMERCIAL_ONLY", nodeIds: ["work"] },
      ]),
    (error) =>
      error instanceof ContentError && error.code === "UNAVAILABLE" && error.status === 503,
  );
});
