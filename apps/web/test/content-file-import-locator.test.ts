import assert from "node:assert/strict";
import { test } from "node:test";
import { pinnedSavedFileSource } from "../src/modules/content/content-file-import";

const runId = "11111111-1111-4111-8111-111111111111";
const revisionId = "22222222-2222-4222-8222-222222222222";

test("Content intake reuses only validated saved revision identifiers from File navigation", () => {
  assert.deepEqual(
    pinnedSavedFileSource(new URLSearchParams({ sourceRunId: runId, sourceRevisionId: revisionId })),
    { runId, revisionId },
  );
  assert.equal(pinnedSavedFileSource(new URLSearchParams()), null);
  assert.equal(
    pinnedSavedFileSource(new URLSearchParams({ sourceRunId: runId, sourceRevisionId: "bad" })),
    null,
  );
});
