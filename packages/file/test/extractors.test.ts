import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { GenerateContentParameters } from "@google/genai";
import { filePayloadInspector } from "../src/adapters/outbound/binary/payloads.js";
import { geminiFileProcessor } from "../src/adapters/outbound/processing/gemini.js";
import { plainTextProcessor } from "../src/adapters/outbound/processing/plain-text.js";
import { nextFileRevision } from "../src/domain/file.js";
import { processingOutput } from "../src/domain/processing-run.js";

function source(bytes: Uint8Array, mediaType: string) {
  const payload = filePayloadInspector.inspect(bytes, "fixture", mediaType);
  return {
    bytes: payload.bytes,
    revision: nextFileRevision(null, 0, randomUUID(), payload.descriptor, {
      id: randomUUID(),
      repositoryId: "repo",
      actorUserId: "actor",
      at: 1,
    }),
  };
}
test("plain-text adapter preserves UTF-8 text and UTF-16 ranges without truncation", async () => {
  const input = source(new TextEncoder().encode("數量 26 SET\r\n\r\nEnd"), "text/plain");
  const result = processingOutput(await plainTextProcessor.run(input));
  assert.equal(result.observations.length, 2);
  assert.equal(plainTextProcessor.kind, "parser");
  assert.equal(result.observations[0]?.value, "數量 26 SET");
  const range = result.observations[1]?.source;
  assert.ok(range && range.kind === "text");
  assert.equal(new TextDecoder().decode(input.bytes).slice(range.start, range.end), "End");
  await assert.rejects(plainTextProcessor.run(source(Uint8Array.from([255]), "text/plain")));
  await assert.rejects(
    plainTextProcessor.run(source(new TextEncoder().encode("a".repeat(4001)), "text/plain")),
  );
  assert.equal(plainTextProcessor.supports("application/pdf"), false);
});

test("payload inspection detaches bytes and gives reproducible SHA-256", () => {
  const original = Uint8Array.from([1, 2, 3]);
  const result = filePayloadInspector.inspect(original, "a", "application/octet-stream");
  original[0] = 9;
  assert.equal(result.bytes[0], 1);
  assert.equal(
    result.descriptor.sha256,
    "039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81",
  );
});

test("Gemini adapter sends explicit bytes and schema once; fake output is still untrusted", async () => {
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
  const input = source(new TextEncoder().encode("%PDF-test-fixture"), "application/pdf");
  assert.deepEqual(processingOutput(await adapter.run(input)), raw);
  assert.equal(calls.length, 1);
  assert.equal(adapter.kind, "ai");
  assert.equal(calls[0]?.model, "configured-test-model");
  assert.equal(calls[0]?.config?.httpOptions?.retryOptions?.attempts, 1);
  assert.ok(calls[0]?.config?.abortSignal);
  assert.equal(
    adapter.supports("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    false,
  );
  await assert.rejects(
    adapter.run({ ...input, revision: { ...input.revision, mediaType: "text/plain" } }),
  );
  assert.equal(calls.length, 1);
  const broken = geminiFileProcessor({
    model: "test",
    models: {
      async generateContent() {
        return { text: "not json" };
      },
    },
  });
  await assert.rejects(broken.run(input));
  assert.throws(() =>
    geminiFileProcessor({
      model: "",
      models: {
        async generateContent() {
          return {};
        },
      },
    }),
  );
});
