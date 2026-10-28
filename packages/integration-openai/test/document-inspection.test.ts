import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { inspectOpenAIDocument } from "../src/structured-output.js";

test("inspection counts actual PDF pages and rejects malformed, unsupported and oversized sources before transport", async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage();
  pdf.addPage();
  const bytes = await pdf.save();
  const input = { bytes, mediaType: "application/pdf", maxInputBytes: 558512, maxPdfPages: 24 };
  assert.deepEqual(await inspectOpenAIDocument(input), { pageCount: 2 });
  await assert.rejects(inspectOpenAIDocument({ ...input, maxPdfPages: 1 }), RangeError);
  await assert.rejects(inspectOpenAIDocument({ ...input, bytes: new Uint8Array([1]) }), RangeError);
  await assert.rejects(inspectOpenAIDocument({ ...input, mediaType: "text/plain" }), RangeError);
  await assert.rejects(inspectOpenAIDocument({ ...input, maxInputBytes: 1 }), RangeError);
});
