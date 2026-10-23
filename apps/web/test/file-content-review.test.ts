import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fileSavedSource,
  fileSourceLocator,
  observationCanPrefill,
} from "../src/modules/content/file-source";

const ids = {
  runId: "11111111-1111-4111-8111-111111111111",
  revisionId: "22222222-2222-4222-8222-222222222222",
  fileId: "33333333-3333-4333-8333-333333333333",
  fileRevisionId: "44444444-4444-4444-8444-444444444444",
};
const expected = { repositoryId: "repo-A", runId: ids.runId, revisionId: ids.revisionId };

function savedResult() {
  return {
    processing: {
      ...ids,
      repositoryId: "repo-A",
      state: "SAVED",
      savedResult: {
        documentKind: "contract",
        observations: [
          {
            id: "item-1",
            label: "合約項次",
            value: "架設配電盤 26 SET",
            uncertain: true,
            source: { kind: "page", page: 5 },
          },
        ],
      },
    },
  };
}

test("File→Content navigation includes only canonical source identities", () => {
  assert.deepEqual(
    fileSourceLocator(
      new URLSearchParams({
        sourceRunId: ids.runId,
        sourceRevisionId: ids.revisionId,
      }),
    ),
    { runId: ids.runId, revisionId: ids.revisionId },
  );
  assert.equal(fileSourceLocator(new URLSearchParams({ sourceRunId: ids.runId })), null);
  assert.equal(
    fileSourceLocator(
      new URLSearchParams({ sourceRunId: ids.runId, sourceRevisionId: "not-uuid" }),
    ),
    null,
  );
  assert.equal(fileSourceLocator(new URLSearchParams()), null);
});

test("File candidate review preserves exact immutable source and untrusted observations", () => {
  const result = fileSavedSource(savedResult(), expected);
  assert.equal(result.runId, ids.runId);
  assert.equal(result.revisionId, ids.revisionId);
  assert.equal(result.fileId, ids.fileId);
  assert.equal(result.fileRevisionId, ids.fileRevisionId);
  assert.equal(result.documentKind, "contract");
  assert.deepEqual(result.observations, [
    {
      id: "item-1",
      label: "合約項次",
      value: "架設配電盤 26 SET",
      source: { kind: "page", page: 5 },
      uncertain: true,
    },
  ]);
  const observation = result.observations[0];
  assert.ok(observation);
  assert.equal(observationCanPrefill(observation), true);
});

test("File preview fails closed for a foreign Repository, wrong revision or uncommitted Run", () => {
  const value = savedResult();
  assert.throws(() => fileSavedSource(value, { ...expected, repositoryId: "repo-B" }));
  assert.throws(() => fileSavedSource(value, { ...expected, revisionId: ids.fileRevisionId }));
  assert.throws(() =>
    fileSavedSource(
      { processing: { ...value.processing, state: "READY", savedResult: null } },
      expected,
    ),
  );
  assert.throws(() =>
    fileSavedSource({ processing: { ...value.processing, savedResult: null } }, expected),
  );
});

test("File observations are never silently truncated or guessed into plan quantities", () => {
  const value = savedResult();
  const empty = {
    processing: {
      ...value.processing,
      savedResult: {
        documentKind: "contract",
        observations: [{ ...value.processing.savedResult.observations[0], value: null }],
      },
    },
  };
  const missing = fileSavedSource(empty, expected).observations[0];
  assert.ok(missing);
  assert.equal(observationCanPrefill(missing), false);
  const long = {
    processing: {
      ...value.processing,
      savedResult: {
        documentKind: "contract",
        observations: [
          { ...value.processing.savedResult.observations[0], value: "x".repeat(2001) },
        ],
      },
    },
  };
  const candidate = fileSavedSource(long, expected);
  assert.equal(candidate.observations[0]?.value?.length, 2001);
  const longObservation = candidate.observations[0];
  assert.ok(longObservation);
  assert.equal(observationCanPrefill(longObservation), false);
  const tooLong = {
    processing: {
      ...value.processing,
      savedResult: {
        documentKind: "contract",
        observations: [
          { ...value.processing.savedResult.observations[0], value: "x".repeat(4001) },
        ],
      },
    },
  };
  assert.throws(() => fileSavedSource(tooLong, expected));
  const repeated = {
    processing: {
      ...value.processing,
      savedResult: {
        documentKind: "contract",
        observations: [
          ...value.processing.savedResult.observations,
          ...value.processing.savedResult.observations,
        ],
      },
    },
  };
  assert.throws(() => fileSavedSource(repeated, expected));
});

test("No guessed Source Location can substitute a valid File-owned observation", () => {
  const value = savedResult();
  assert.throws(() =>
    fileSavedSource(
      {
        processing: {
          ...value.processing,
          savedResult: {
            documentKind: "contract",
            observations: [
              { ...value.processing.savedResult.observations[0], source: { forged: "source" } },
            ],
          },
        },
      },
      expected,
    ),
  );
});
