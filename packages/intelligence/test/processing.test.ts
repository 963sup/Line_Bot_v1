import assert from "node:assert/strict";
import test from "node:test";
import { finalizeProcessing } from "../src/domain/processing.js";

const ready = {
  id: "revision-1",
  repositoryId: "repo",
  runId: "run",
  fileId: "file",
  fileRevisionId: "file-revision",
  fileSha256: "a".repeat(64),
  version: 2,
  parentRevisionId: "revision-0",
  actorUserId: "owner",
  at: 1,
  state: "READY" as const,
  attemptId: "attempt",
  processorId: "processor",
  processorVersion: "v1",
  processorKind: "parser" as const,
  rawResult: {
    documentKind: "plain-text",
    observations: [
      {
        id: "keep",
        label: "Keep",
        value: "original",
        uncertain: false,
        source: { kind: "page", page: 1 },
      },
      { id: "drop", label: "Drop", value: "remove", uncertain: false, source: null },
    ],
  },
  savedResult: null,
  edits: [],
  failure: null,
};

test("Save applies replacement and exclusion edits while preserving rawResult", () => {
  const result = finalizeProcessing(ready, {
    id: "revision-2",
    actorUserId: "owner",
    at: 2,
    action: "save",
    edits: [
      { observationId: "keep", action: "replace", value: "corrected" },
      { observationId: "drop", action: "exclude" },
    ],
  });

  assert.equal(result.state, "SAVED");
  assert.equal(result.rawResult?.observations[0]?.value, "original");
  assert.deepEqual(result.savedResult?.observations, [
    {
      id: "keep",
      label: "Keep",
      value: "corrected",
      uncertain: false,
      source: { kind: "page", page: 1 },
    },
  ]);
});

test("Discard does not require edits and keeps savedResult empty", () => {
  const result = finalizeProcessing(ready, {
    id: "revision-3",
    actorUserId: "owner",
    at: 3,
    action: "discard",
    edits: [],
  });

  assert.equal(result.state, "DISCARDED");
  assert.equal(result.savedResult, null);
  assert.deepEqual(result.edits, []);
});
