import assert from "node:assert/strict";
import test from "node:test";
import { commercialDocumentContentSchema } from "../src/contracts/input/commercial-document.js";
import { collectDocumentCoverage } from "../src/domain/commercial-document-coverage.js";

const id = "11111111-1111-4111-8111-111111111111";
const obs = "22222222-2222-4222-8222-222222222222";
const ref = { kind: "EXTRACTION" as const, extractionResultId: id, observationId: obs };
const missing = {
  value: null,
  missingReason: "NOT_PRESENT",
  evidenceRefs: [],
  origin: "EXTRACTION",
  correctionReason: null,
};
const fact = { ...missing, value: "Synthetic", missingReason: null, evidenceRefs: [ref] };
const content = commercialDocumentContentSchema.parse({
  documentKind: "ESTIMATE",
  header: {
    documentNumber: missing,
    documentRevisionLabel: missing,
    title: fact,
    issueDate: missing,
    validUntilDate: missing,
    defaultCurrencyCode: missing,
  },
  parties: [],
  sections: [],
  rows: [
    {
      rowId: id,
      rowType: "ITEM",
      sectionId: null,
      position: 0,
      evidenceRefs: [ref],
      extensionFields: [],
      itemNumber: missing,
      referenceCode: missing,
      description: fact,
      quantity: missing,
      unitLabel: missing,
      unitPrice: missing,
      lineAmount: missing,
      deliveryDate: missing,
    },
  ],
  selectionGroups: [],
  totals: [],
  terms: [],
  extensionFields: [],
});
const manifest = {
  source: { fileId: id, fileRevisionId: obs, sha256: "a".repeat(64) },
  extractionResultId: id,
  pageCount: 2,
  observations: [{ observationId: obs, pageNumber: 1 }],
  humanEvidence: [],
};
const review = {
  confirmedAgainstOriginal: true as const,
  reviewedPageNumbers: [1, 2],
  reviewedEvidenceRefs: [ref],
  reviewedItemRowIds: [id],
  sourceItemCount: 1,
};
test("coverage requires original page, item and observation review together", () => {
  assert.equal(collectDocumentCoverage(content, manifest, review).complete, true);
  const report = collectDocumentCoverage(content, manifest, {
    ...review,
    reviewedPageNumbers: [1],
    reviewedItemRowIds: [],
    reviewedEvidenceRefs: [],
  });
  assert.equal(report.complete, false);
  assert.deepEqual(report.missingPageNumbers, [2]);
  assert.deepEqual(report.unreviewedItemRowIds, [id]);
  assert.deepEqual(report.unreviewedObservationIds, [obs]);
});
test("model item count cannot substitute for independent source count", () => {
  const report = collectDocumentCoverage(content, manifest, { ...review, sourceItemCount: null });
  assert.equal(report.complete, false);
  assert.equal(report.countComparison, "UNAVAILABLE");
  assert.equal(
    collectDocumentCoverage(content, manifest, { ...review, sourceItemCount: 2 }).countComparison,
    "MISMATCH",
  );
});
test("duplicate or invented review identities cannot cover the source", () => {
  for (const invalid of [
    { ...review, reviewedPageNumbers: [1, 1, 2] },
    { ...review, reviewedPageNumbers: [1, 2, 3] },
    { ...review, reviewedItemRowIds: [obs] },
    { ...review, reviewedEvidenceRefs: [{ ...ref, extractionResultId: obs }] },
  ])
    assert.equal(collectDocumentCoverage(content, manifest, invalid).complete, false);
});
test("unrepresented source observations remain visible even if user reviewed them", () => {
  const other = { ...ref, observationId: id };
  const report = collectDocumentCoverage(
    content,
    { ...manifest, observations: [...manifest.observations, { observationId: id, pageNumber: 2 }] },
    { ...review, reviewedEvidenceRefs: [ref, other] },
  );
  assert.equal(report.complete, false);
  assert.deepEqual(report.unrepresentedObservationIds, [id]);
});
