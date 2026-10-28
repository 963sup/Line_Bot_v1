import assert from "node:assert/strict";
import test from "node:test";
import { validateCommercialDocumentEvidence } from "../src/application/commercial-document-evidence.js";
import { commercialDocumentContentSchema } from "../src/contracts/input/commercial-document.js";

const resultId = "11111111-1111-4111-8111-111111111111";
const observationId = "22222222-2222-4222-8222-222222222222";
const evidenceId = "33333333-3333-4333-8333-333333333333";
const source = { fileId: resultId, fileRevisionId: observationId, sha256: "a".repeat(64) };
const context = {
  source,
  extractionResultId: resultId,
  pageCount: 2,
  observations: [{ observationId, pageNumber: 2 }],
  humanEvidence: [{ evidenceId, source, pageNumber: 1 }],
};
const missing = {
  value: null,
  missingReason: "NOT_PRESENT",
  evidenceRefs: [],
  origin: "EXTRACTION",
  correctionReason: null,
};
function content(refs: unknown[]) {
  return commercialDocumentContentSchema.parse({
    documentKind: "ESTIMATE",
    header: {
      documentNumber: missing,
      documentRevisionLabel: missing,
      title: { ...missing, value: "Synthetic", missingReason: null, evidenceRefs: refs },
      issueDate: missing,
      validUntilDate: missing,
      defaultCurrencyCode: missing,
    },
    parties: [],
    sections: [],
    rows: [],
    selectionGroups: [],
    totals: [],
    terms: [],
    extensionFields: [],
  });
}
const extraction = { kind: "EXTRACTION", extractionResultId: resultId, observationId };
test("evidence accepts qualified observations and retained human evidence", () => {
  assert.deepEqual(
    validateCommercialDocumentEvidence(
      content([extraction, { kind: "HUMAN", evidenceId }]),
      context,
    ),
    [],
  );
});
test("evidence rejects cross-result and absent observation references with a field location", () => {
  for (const ref of [
    { ...extraction, extractionResultId: evidenceId },
    { ...extraction, observationId: evidenceId },
  ]) {
    const report = validateCommercialDocumentEvidence(content([ref]), context);
    assert.equal(report[0]?.code, "INVALID_EXTRACTION_REFERENCE");
    assert.equal(report[0]?.fieldPath, "header.title.evidenceRefs.0");
  }
});
test("human evidence cannot point at another source or outside inspected page bounds", () => {
  for (const human of [
    { evidenceId, pageNumber: 1, source: { ...source, sha256: "b".repeat(64) } },
    { evidenceId, source, pageNumber: 3 },
  ]) {
    assert.ok(
      validateCommercialDocumentEvidence(content([{ kind: "HUMAN", evidenceId }]), {
        ...context,
        humanEvidence: [human],
      }).some((d) => d.code === "INVALID_EVIDENCE_CONTEXT"),
    );
  }
  assert.equal(
    validateCommercialDocumentEvidence(
      content([{ kind: "HUMAN", evidenceId: resultId }]),
      context,
    )[0]?.code,
    "INVALID_HUMAN_REFERENCE",
  );
});
test("technical evidence rejects duplicate identities and untrusted page metadata", () => {
  for (const invalid of [
    { ...context, pageCount: 0 },
    { ...context, observations: [{ observationId, pageNumber: 3 }] },
    { ...context, observations: [...context.observations, ...context.observations] },
  ]) {
    assert.ok(
      validateCommercialDocumentEvidence(content([extraction]), invalid).some(
        (d) => d.code === "INVALID_EVIDENCE_CONTEXT",
      ),
    );
  }
});

test("source validation visits row facts and typed vendor extension evidence", () => {
  const document = content([extraction]);
  const field = {
    value: "Synthetic note",
    missingReason: null,
    evidenceRefs: [{ kind: "HUMAN", evidenceId: resultId }],
    origin: "EXTRACTION",
    correctionReason: null,
  };
  const withRows = commercialDocumentContentSchema.parse({
    ...document,
    rows: [
      {
        rowType: "NOTE",
        rowId: evidenceId,
        sectionId: null,
        position: 0,
        evidenceRefs: [extraction],
        extensionFields: [
          {
            fieldId: observationId,
            label: "Vendor",
            valueType: "TEXT",
            value: "X",
            missingReason: null,
            unitLabel: null,
            evidenceRefs: [{ ...extraction, extractionResultId: evidenceId }],
          },
        ],
        text: field,
      },
    ],
  });
  assert.deepEqual(validateCommercialDocumentEvidence(withRows, context), [
    { code: "INVALID_EXTRACTION_REFERENCE", fieldPath: "rows.0.extensionFields.0.evidenceRefs.0" },
    { code: "INVALID_HUMAN_REFERENCE", fieldPath: "rows.0.text.evidenceRefs.0" },
  ]);
});

test("evidence boundary rejects malformed projections and leaves immutable evidence untouched", () => {
  const document = content([extraction]);
  const original = JSON.stringify({ document, context });
  Object.freeze(document.header.title.evidenceRefs);
  Object.freeze(context.observations);
  Object.freeze(context.source);
  Object.freeze(context);
  assert.deepEqual(validateCommercialDocumentEvidence(document, context), []);
  assert.equal(JSON.stringify({ document, context }), original);
  assert.deepEqual(
    validateCommercialDocumentEvidence(document, {
      ...context,
      source: { ...source, sha256: "invalid" },
    }),
    [{ code: "INVALID_EVIDENCE_CONTEXT", fieldPath: "evidenceContext" }],
  );
});
