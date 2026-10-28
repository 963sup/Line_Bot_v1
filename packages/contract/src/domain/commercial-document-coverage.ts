import type { CommercialDocumentContent } from "./commercial-document.js";
import {
  type CommercialDocumentEvidenceContext,
  visitDocumentEvidenceReferences,
} from "./commercial-document-evidence.js";
import type { EvidenceReference } from "./commercial-document-values.js";
export type DocumentCoverageReview = {
  confirmedAgainstOriginal: true;
  reviewedPageNumbers: number[];
  reviewedEvidenceRefs: EvidenceReference[];
  reviewedItemRowIds: string[];
  sourceItemCount: number | null;
};
export type CoverageReport = Readonly<{
  complete: boolean;
  countComparison: "MATCH" | "MISMATCH" | "UNAVAILABLE";
  missingPageNumbers: readonly number[];
  unreviewedItemRowIds: readonly string[];
  unreviewedObservationIds: readonly string[];
  unrepresentedObservationIds: readonly string[];
  diagnostics: readonly string[];
}>;

/** Coverage is a verification prerequisite, not authorization or a VERIFIED transition.
 * sourceItemCount is an explicit original-source attestation, never inferred from rows.
 */
export function collectDocumentCoverage(
  content: CommercialDocumentContent,
  manifest: CommercialDocumentEvidenceContext,
  review: DocumentCoverageReview,
): CoverageReport {
  const diagnostics: string[] = [];
  const value = review;
  const pages = new Set(value.reviewedPageNumbers);
  const items = new Set(
    content.rows.filter((row) => row.rowType === "ITEM").map((row) => row.rowId),
  );
  const reviewedItems = new Set(value.reviewedItemRowIds);
  if (
    pages.size !== value.reviewedPageNumbers.length ||
    value.reviewedPageNumbers.some((page) => page > manifest.pageCount) ||
    reviewedItems.size !== value.reviewedItemRowIds.length ||
    value.reviewedItemRowIds.some((id) => !items.has(id))
  )
    diagnostics.push("INVALID_REVIEW_IDENTITIES");
  const observations = new Set(manifest.observations.map((item) => item.observationId));
  const humans = new Set(manifest.humanEvidence.map((item) => item.evidenceId));
  const reviewedObservations = new Set<string>();
  const reviewedRefs = new Set<string>();
  for (const ref of value.reviewedEvidenceRefs) {
    const key =
      ref.kind === "EXTRACTION"
        ? `EXTRACTION:${ref.extractionResultId}:${ref.observationId}`
        : `HUMAN:${ref.evidenceId}`;
    if (reviewedRefs.has(key)) diagnostics.push("DUPLICATE_REVIEW_EVIDENCE");
    reviewedRefs.add(key);
    if (ref.kind === "EXTRACTION") {
      if (
        ref.extractionResultId !== manifest.extractionResultId ||
        !observations.has(ref.observationId)
      )
        diagnostics.push("INVALID_REVIEW_EVIDENCE");
      else reviewedObservations.add(ref.observationId);
    } else if (!humans.has(ref.evidenceId)) diagnostics.push("INVALID_REVIEW_EVIDENCE");
  }
  const represented = new Set<string>();
  visitDocumentEvidenceReferences(content, (ref) => {
    if (ref.kind === "EXTRACTION") represented.add(ref.observationId);
  });
  const missingPageNumbers = Array.from({ length: manifest.pageCount }, (_, i) => i + 1).filter(
    (page) => !pages.has(page),
  );
  const unreviewedItemRowIds = [...items].filter((id) => !reviewedItems.has(id));
  const unreviewedObservationIds = [...observations].filter((id) => !reviewedObservations.has(id));
  const unrepresentedObservationIds = [...observations].filter((id) => !represented.has(id));
  const countComparison =
    value.sourceItemCount === null
      ? "UNAVAILABLE"
      : value.sourceItemCount === items.size
        ? "MATCH"
        : "MISMATCH";
  return {
    complete:
      diagnostics.length === 0 &&
      countComparison === "MATCH" &&
      missingPageNumbers.length === 0 &&
      unreviewedItemRowIds.length === 0 &&
      unreviewedObservationIds.length === 0 &&
      unrepresentedObservationIds.length === 0,
    countComparison,
    missingPageNumbers,
    unreviewedItemRowIds,
    unreviewedObservationIds,
    unrepresentedObservationIds,
    diagnostics,
  };
}
