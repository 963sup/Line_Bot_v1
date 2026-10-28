import { commercialDocumentContentSchema } from "../src/contracts/input/commercial-document.js";
export const id = "11111111-1111-4111-8111-111111111111";
export const obs = "22222222-2222-4222-8222-222222222222";
export const evidence = { kind: "EXTRACTION" as const, extractionResultId: id, observationId: obs };
const absent = {
  value: null,
  missingReason: "NOT_PRESENT",
  evidenceRefs: [],
  origin: "EXTRACTION",
  correctionReason: null,
};
const text = { ...absent, value: "Synthetic work", missingReason: null, evidenceRefs: [evidence] };
export const context = {
  source: { fileId: id, fileRevisionId: obs, sha256: "a".repeat(64) },
  extractionResultId: id,
  pageCount: 1,
  observations: [{ observationId: obs, pageNumber: 1 }],
  humanEvidence: [],
};
export function draft() {
  return commercialDocumentContentSchema.parse({
    documentKind: "ESTIMATE",
    header: {
      documentNumber: absent,
      documentRevisionLabel: absent,
      title: text,
      issueDate: absent,
      validUntilDate: absent,
      defaultCurrencyCode: absent,
    },
    parties: [],
    sections: [],
    rows: [
      {
        rowType: "ITEM",
        rowId: id,
        sectionId: null,
        position: 0,
        evidenceRefs: [evidence],
        extensionFields: [],
        itemNumber: absent,
        referenceCode: absent,
        description: text,
        quantity: absent,
        unitLabel: absent,
        unitPrice: absent,
        lineAmount: absent,
        deliveryDate: absent,
      },
    ],
    selectionGroups: [],
    totals: [],
    terms: [],
    extensionFields: [],
  });
}
export function review(sourceFingerprint: string) {
  return {
    sourceFingerprint,
    confirmedAgainstOriginal: true as const,
    reviewedPageNumbers: [1],
    reviewedItemRowIds: [id],
    reviewedEvidenceRefs: [evidence],
    sourceItemCount: 1,
    acknowledgements: [],
  };
}
