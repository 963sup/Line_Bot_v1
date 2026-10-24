import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import type { GenerateContentParameters } from "@google/genai";
import { FileError } from "@line_bot_v1/file/domain/error";
import { nextFileRevision } from "@line_bot_v1/file/domain/file";
import { geminiFileProcessor } from "../src/adapters/outbound/processing/gemini.js";
import { createGeminiFileProcessor } from "../src/composition/bootstrap/processors.js";

function source() {
  const bytes = new TextEncoder().encode("%PDF-test-fixture");
  return {
    bytes,
    revision: nextFileRevision(
      null,
      0,
      randomUUID(),
      {
        name: "fixture.pdf",
        mediaType: "application/pdf",
        byteLength: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      },
      { id: randomUUID(), repositoryId: "repo", actorUserId: "actor", at: 1 },
    ),
  };
}

test("Gemini preserves processor identity and sends exact bytes and schema once", async () => {
  const calls: GenerateContentParameters[] = [];
  const raw = {
    documentKind: "test",
    observations: [
      {
        id: "q",
        label: "Quantity",
        value: "26 SET",
        source: { kind: "page", page: 1 },
        uncertain: false,
      },
      { id: "u", label: "Unknown", value: null, source: null, uncertain: true },
    ],
  };
  const adapter = geminiFileProcessor({
    model: "configured-test-model",
    models: {
      async generateContent(input) {
        calls.push(input);
        return { text: JSON.stringify(raw) };
      },
    },
  });
  const input = source();
  const snapshot = structuredClone(input);
  assert.deepEqual(await adapter.run(input), raw);
  assert.deepEqual(input, snapshot);
  assert.equal(calls.length, 1);
  assert.equal(adapter.id, "gemini");
  assert.equal(adapter.kind, "ai");
  assert.equal(adapter.version, "observations-v1:configured-test-model");
  assert.equal(calls[0]?.model, "configured-test-model");
  assert.equal(calls[0]?.config?.httpOptions?.retryOptions?.attempts, 1);
  assert.equal(calls[0]?.config?.responseMimeType, "application/json");
  assert.ok(calls[0]?.config?.responseJsonSchema);
  assert.ok(calls[0]?.config?.abortSignal);
  assert.match(
    JSON.stringify(calls[0]?.contents),
    new RegExp(Buffer.from(input.bytes).toString("base64")),
  );
  for (const mediaType of ["application/pdf", "image/png", "image/jpeg", "image/webp"]) {
    assert.equal(adapter.supports(mediaType), true);
  }
  for (const mediaType of [
    "text/plain",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ]) {
    assert.equal(adapter.supports(mediaType), false);
    await assert.rejects(
      adapter.run({ ...input, revision: { ...input.revision, mediaType } }),
      (error: unknown) => error instanceof FileError && error.code === "UNSUPPORTED_MEDIA",
    );
  }
  assert.equal(calls.length, 1);
});

test("provider failures and malformed output never retry or manufacture a result", async () => {
  for (const response of [undefined, "not json"]) {
    let calls = 0;
    const adapter = geminiFileProcessor({
      model: "test",
      models: {
        async generateContent() {
          calls++;
          return { text: response };
        },
      },
    });
    await assert.rejects(adapter.run(source()));
    assert.equal(calls, 1);
  }
  let calls = 0;
  const failure = new Error("provider failure");
  const adapter = geminiFileProcessor({
    model: "test",
    models: {
      async generateContent() {
        calls++;
        throw failure;
      },
    },
  });
  await assert.rejects(adapter.run(source()), failure);
  assert.equal(calls, 1);
});

test("operation deadline aborts one provider request without a retry", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let signal: AbortSignal | undefined;
  let calls = 0;
  const adapter = geminiFileProcessor({
    model: "test",
    models: {
      generateContent(input) {
        calls++;
        signal = input.config?.abortSignal;
        return new Promise(() => {});
      },
    },
  });
  const result = adapter.run(source());
  const rejected = assert.rejects(
    result,
    (error: unknown) => error instanceof FileError && error.code === "EXTRACTION_UNAVAILABLE",
  );
  t.mock.timers.tick(20000);
  await rejected;
  assert.equal(signal?.aborted, true);
  assert.equal(calls, 1);
});

test("public composition preserves historical processor version and rejects missing model", () => {
  const processor = createGeminiFileProcessor({
    apiKey: "offline-test-key",
    model: "configured-test-model",
  });
  assert.equal(processor.id, "gemini");
  assert.equal(processor.kind, "ai");
  assert.equal(processor.version, "observations-v1:configured-test-model");
  assert.throws(
    () => createGeminiFileProcessor({ apiKey: "offline-test-key", model: " " }),
    (error: unknown) => error instanceof FileError && error.code === "EXTRACTION_UNAVAILABLE",
  );
});
