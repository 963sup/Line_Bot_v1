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
  header: {
    documentNumber: null,
    revision: null,
    issueDate: null,
    title: null,
    currency: null,
  },
  buyer: { name: null, registrationNumber: null },
  seller: { name: null, registrationNumber: null },
  lines: [
    {
      sourceRowId: "row-1",
      itemNumber: null,
      category: null,
      materialCode: null,
      description: null,
      quantity: null,
      unit: null,
      unitPrice: null,
      grossAmount: null,
      discountAmount: null,
      netAmount: null,
      deliveryDate: null,
      sourcePages: [1],
      uncertain: false,
    },
    {
      sourceRowId: "row-2",
      itemNumber: null,
      category: null,
      materialCode: null,
      description: null,
      quantity: null,
      unit: null,
      unitPrice: null,
      grossAmount: null,
      discountAmount: null,
      netAmount: null,
      deliveryDate: null,
      sourcePages: [2],
      uncertain: true,
    },
  ],
  totals: { gross: null, discount: null, net: null, tax: null, total: null },
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
