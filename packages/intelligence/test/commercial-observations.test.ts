import assert from "node:assert/strict";
import test from "node:test";
import {
  stableCommercialId,
  validateCommercialObservations,
} from "../src/application/commercial-observations.js";

test("technical evidence enforces page bounds, references, item grouping and strict keys while retaining unknown hints", () => {
  const valid = {
    observations: [{ pageNumber: 1, rawLabel: "Qty", rawValue: "2" }],
    semanticHints: [
      { observationIndex: 0, target: "item.quantity", rowKey: "row1" },
      { observationIndex: 0, target: "future.extension", rowKey: null },
    ],
  };
  assert.deepEqual(validateCommercialObservations(valid, 1), valid);
  for (const value of [
    { ...valid, extra: true },
    { ...valid, observations: [{ pageNumber: 2, rawLabel: null, rawValue: "2" }] },
    { ...valid, semanticHints: [{ observationIndex: 1, target: "item.quantity", rowKey: "r" }] },
    { ...valid, semanticHints: [{ observationIndex: 0, target: "item.quantity", rowKey: null }] },
  ])
    assert.throws(() => validateCommercialObservations(value, 1));
  assert.equal(stableCommercialId("job", "result"), stableCommercialId("job", "result"));
  assert.notEqual(stableCommercialId("job", "result"), stableCommercialId("job", "observation:0"));
});

test("commercial profile pins provider schema, model, prompt, normalization and budgets independently", async () => {
  const {
    commercialProfile,
    commercialObservationSchema,
    commercialExtractionPrompt,
    commercialFingerprint,
  } = await import("../src/application/commercial-profile.js");
  assert.equal(commercialProfile.model, "gpt-4.1");
  assert.equal(
    commercialProfile.schemaFingerprint,
    commercialFingerprint(commercialObservationSchema),
  );
  assert.equal(
    commercialProfile.promptFingerprint,
    commercialFingerprint(commercialExtractionPrompt),
  );
  assert.equal(
    commercialProfile.normalizerFingerprint,
    commercialFingerprint("commercial-document/1"),
  );
  assert.equal(commercialProfile.modelFingerprint, commercialFingerprint("gpt-4.1"));
  assert.equal(commercialProfile.maxInputBytes, 558512);
  assert.equal(commercialProfile.maxPdfPages, 24);
  assert.equal(commercialProfile.inputTokenCountTimeoutMs, 10000);
  assert.equal(commercialProfile.inputTokenBudget, 64000);
  assert.equal(commercialProfile.estimatorVersion, "openai-responses-input-tokens/1");
});
