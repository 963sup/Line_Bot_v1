import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  processingCommand,
  resultCommand,
  uploadCommand,
} from "../src/application/commands/files.js";
import { FileError, fileErrorFromUnknown } from "../src/domain/error.js";
import { fileLimits, nextFileRevision } from "../src/domain/file.js";
import {
  beginProcessing,
  finalizeProcessing,
  finishProcessing,
  processingOutput,
  sourceLocation,
} from "../src/domain/processing-run.js";
import { assertReadable, assertWritable } from "../src/domain/values.js";

const context = () => ({ id: randomUUID(), repositoryId: "repo", actorUserId: "actor", at: 1 });
const descriptor = {
  name: "contract.xlsx",
  mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  byteLength: 12,
  sha256: "a".repeat(64),
};
const processor = { id: "test-fixture", version: "1", kind: "parser" as const };
const candidate = () =>
  processingOutput({
    documentKind: "candidate-contract",
    observations: [
      {
        id: "qty",
        label: "Quantity",
        value: "26 SET",
        source: { kind: "sheet", sheet: "Items", cell: "D26" },
        uncertain: false,
      },
      { id: "unknown", label: "Unit", value: null, source: null, uncertain: true },
    ],
  });
const code = (expected: string) => (error: unknown) =>
  error instanceof FileError && error.code === expected;

test("File identity is format-neutral; immutable revisions pin bytes and metadata", () => {
  const first = nextFileRevision(null, 0, randomUUID(), descriptor, context());
  assert.equal(first.mediaType, descriptor.mediaType);
  const next = nextFileRevision(
    first,
    1,
    first.fileId,
    { ...descriptor, name: "revision.png", mediaType: "image/png" },
    context(),
  );
  assert.equal(next.parentRevisionId, first.id);
  assert.equal(first.name, "contract.xlsx");
  assert.throws(
    () => nextFileRevision(first, 0, first.fileId, descriptor, context()),
    code("VERSION_CONFLICT"),
  );
  assert.throws(
    () => nextFileRevision(first, 1, randomUUID(), descriptor, context()),
    code("SOURCE_INVALID"),
  );
  assert.throws(
    () =>
      nextFileRevision(first, 1, first.fileId, descriptor, { ...context(), repositoryId: "other" }),
    code("SOURCE_INVALID"),
  );
  for (const invalid of [
    { name: "../secret" },
    { mediaType: "image/png;anything" },
    { byteLength: 0 },
    { byteLength: fileLimits.bytes + 1 },
    { sha256: "unknown" },
  ])
    assert.throws(
      () => nextFileRevision(null, 0, randomUUID(), { ...descriptor, ...invalid }, context()),
      code("INVALID_INPUT"),
    );
});

test("candidate parsing rejects invented shapes and retains unknowns and source locators", () => {
  const raw = candidate();
  const copy = processingOutput(raw);
  assert.notEqual(copy.observations, raw.observations);
  assert.notEqual(copy.observations[0], raw.observations[0]);
  assert.equal(copy.observations[1]?.value, null);
  for (const source of [
    { kind: "page", page: 0 },
    { kind: "image", x: 0.9, y: 0, width: 0.2, height: 1 },
    { kind: "sheet", sheet: "S", cell: "R0" },
    { kind: "text", start: 2, end: 2 },
  ])
    assert.throws(() => sourceLocation(source), code("INVALID_INPUT"));
  assert.deepEqual(sourceLocation({ kind: "image", x: 0, y: 0, width: 1, height: 1 }), {
    kind: "image",
    x: 0,
    y: 0,
    width: 1,
    height: 1,
  });
  assert.throws(() => processingOutput({ ...raw, observations: [] }), code("INVALID_INPUT"));
  assert.throws(
    () => processingOutput({ ...raw, observations: [raw.observations[0], raw.observations[0]] }),
    code("INVALID_INPUT"),
  );
  assert.throws(() => processingOutput({ ...raw, approved: true }), code("INVALID_INPUT"));
});

test("attempt fencing and source identity survive retries without rewriting reviewed evidence", () => {
  const file = nextFileRevision(null, 0, randomUUID(), descriptor, context());
  const start = beginProcessing(null, 0, randomUUID(), file, processor, context());
  const retry = beginProcessing(start, 1, start.runId, file, processor, context());
  assert.notEqual(retry.attemptId, start.attemptId);
  assert.throws(
    () =>
      beginProcessing(start, 1, start.runId, file, { ...processor, id: "different" }, context()),
    code("SOURCE_INVALID"),
  );
  assert.throws(
    () => beginProcessing(start, 1, start.runId, file, { ...processor, kind: "ai" }, context()),
    code("SOURCE_INVALID"),
  );
  assert.throws(
    () =>
      beginProcessing(start, 1, start.runId, file, { ...processor, version: "next" }, context()),
    code("SOURCE_INVALID"),
  );
  assert.throws(
    () => finishProcessing(retry, start.attemptId, candidate(), context()),
    code("VERSION_CONFLICT"),
  );
  assert.throws(
    () =>
      finishProcessing(retry, retry.attemptId, candidate(), {
        ...context(),
        repositoryId: "other",
      }),
    code("SOURCE_INVALID"),
  );
  const failed = finishProcessing(retry, retry.attemptId, null, context());
  assert.equal(failed.state, "FAILED");
  assert.equal(failed.failure, "PROCESSING_UNAVAILABLE");
  const again = beginProcessing(failed, 3, failed.runId, file, processor, context());
  const ready = finishProcessing(again, again.attemptId, candidate(), context());
  assert.throws(
    () => beginProcessing(ready, 5, ready.runId, file, processor, context()),
    code("LIFECYCLE_CONFLICT"),
  );
  const otherSource = nextFileRevision(file, 1, file.fileId, descriptor, context());
  assert.throws(
    () => beginProcessing(start, 1, start.runId, otherSource, processor, context()),
    code("SOURCE_INVALID"),
  );
});

test("Save is explicit and keeps untrusted raw values immutable", () => {
  const file = nextFileRevision(null, 0, randomUUID(), descriptor, context());
  const start = beginProcessing(null, 0, randomUUID(), file, processor, context());
  const ready = finishProcessing(start, start.attemptId, candidate(), context());
  assert.equal(ready.state, "READY");
  assert.equal(ready.savedResult, null);
  const saved = finalizeProcessing(ready, 2, { action: "save", edits: [] }, context());
  assert.equal(saved.state, "SAVED");
  assert.deepEqual(saved.savedResult?.observations, ready.rawResult?.observations);
  assert.equal(saved.savedResult?.observations[1]?.uncertain, true);
  const corrected = finalizeProcessing(
    ready,
    2,
    { action: "save", edits: [{ observationId: "unknown", action: "replace", value: "SET" }] },
    context(),
  );
  assert.equal(corrected.savedResult?.observations[1]?.value, "SET");
  assert.equal(corrected.savedResult?.observations[1]?.uncertain, true);
  assert.equal(corrected.rawResult?.observations[1]?.value, null);
  const discarded = finalizeProcessing(ready, 2, { action: "discard" }, context());
  assert.equal(discarded.state, "DISCARDED");
  assert.equal(discarded.savedResult, null);
  assert.deepEqual(discarded.rawResult, ready.rawResult);
  assert.throws(
    () => finalizeProcessing(saved, 3, { action: "discard" }, context()),
    code("LIFECYCLE_CONFLICT"),
  );
  assert.throws(
    () => finalizeProcessing(ready, 1, { action: "save", edits: [] }, context()),
    code("VERSION_CONFLICT"),
  );
  assert.throws(
    () =>
      finalizeProcessing(
        ready,
        2,
        { action: "save", edits: [{ observationId: "not-present", action: "exclude" }] },
        context(),
      ),
    code("INVALID_INPUT"),
  );
  assert.throws(
    () =>
      finalizeProcessing(
        ready,
        2,
        {
          action: "save",
          edits: [
            { observationId: "qty", action: "exclude" },
            { observationId: "unknown", action: "exclude" },
          ],
        },
        context(),
      ),
    code("INVALID_INPUT"),
  );
});

test("permissions and strict command parsing fail closed", () => {
  assert.throws(() => assertReadable([]), code("FORBIDDEN"));
  assertReadable(["read"]);
  assert.throws(() => assertWritable(["triage_plus"]), code("FORBIDDEN"));
  assertWritable(["maintain"]);
  const base = { repositoryId: "repo", requestId: randomUUID(), expectedVersion: 0 };
  const fileId = randomUUID();
  assert.equal(
    uploadCommand({ ...base, fileId, name: "a.txt", mediaType: "text/plain" }).fileId,
    fileId,
  );
  assert.deepEqual(
    uploadCommand({ ...base, fileId, name: "  a.txt  ", mediaType: " TEXT/PLAIN " }),
    uploadCommand({ ...base, fileId, name: "a.txt", mediaType: "text/plain" }),
  );
  assert.throws(
    () => uploadCommand({ ...base, fileId, name: "a", mediaType: "x/y", role: "admin" }),
    code("INVALID_INPUT"),
  );
  assert.throws(
    () => resultCommand({ ...base, runId: randomUUID(), action: "approve-contract" }),
    code("INVALID_INPUT"),
  );
  assert.throws(
    () => processingCommand({ ...base, runId: randomUUID(), fileId, fileRevisionId: "latest" }),
    code("INVALID_INPUT"),
  );
  assert.equal(fileErrorFromUnknown({ status: 403 }).code, "FORBIDDEN");
  assert.equal(fileErrorFromUnknown({ status: 404 }).code, "NOT_FOUND");
  assert.equal(
    fileErrorFromUnknown(new Error("sensitive payload")).message,
    "File operation unavailable.",
  );
});
