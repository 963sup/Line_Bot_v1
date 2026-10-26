import assert from "node:assert/strict";
import test from "node:test";
import {
  parseDocumentIntakeOutput,
  parseProcessingOutput,
} from "../../../../src/adapters/outbound/ai-gateway/document.js";

const valid = {
  documentKind: "receipt",
  observations: [
    { id: "total", label: "Total", value: "1260", source: { page: 1 }, uncertain: false },
  ],
};

test("AI Gateway accepts a bounded, domain-shaped processing result", () => {
  assert.deepEqual(parseProcessingOutput(valid), valid);
});

const intake = {
  header: {},
  buyer: {},
  seller: {},
  lines: [
    { sourceRowId: "row-1", sourcePages: [1], uncertain: false },
    { sourceRowId: "row-2", sourcePages: [2], uncertain: true },
  ],
  totals: {},
  terms: { text: null, sourcePages: [] },
  fieldEvidence: {},
  corrections: [],
};

test("AI Gateway preserves a complete structured intake candidate", () => {
  assert.deepEqual(parseDocumentIntakeOutput(intake), intake);
});

test("AI Gateway rejects incomplete, malformed, or duplicate candidates", () => {
  assert.throws(() => parseDocumentIntakeOutput({ ...intake, terms: undefined }), /invalid result/);
  assert.throws(
    () =>
      parseDocumentIntakeOutput({
        ...intake,
        lines: [{ ...intake.lines[0], uncertain: "false" }],
      }),
    /invalid result/,
  );
  assert.throws(
    () =>
      parseDocumentIntakeOutput({
        ...intake,
        lines: [intake.lines[0], intake.lines[0]],
      }),
    /invalid result/,
  );
});

test("AI Gateway rejects malformed observations before they reach Intelligence", () => {
  assert.throws(
    () =>
      parseProcessingOutput({
        ...valid,
        observations: [{ ...valid.observations[0], uncertain: "false" }],
      }),
    /invalid result/,
  );
  assert.throws(
    () =>
      parseProcessingOutput({ ...valid, observations: [{ ...valid.observations[0], source: [] }] }),
    /invalid result/,
  );
});
