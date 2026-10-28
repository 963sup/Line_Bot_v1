import type { CommercialDocumentContent } from "./commercial-document.js";
import {
  type CoverageReport,
  collectDocumentCoverage,
  type DocumentCoverageReview,
} from "./commercial-document-coverage.js";
import {
  type CommercialDocumentEvidenceContext,
  visitDocumentEvidenceReferences,
} from "./commercial-document-evidence.js";
import type { MoneyReconciliationReport } from "./commercial-document-money.js";
export type DocumentVerificationReview = DocumentCoverageReview & {
  sourceFingerprint: string;
  acknowledgements: { code: string; reason: string }[];
};
export type DocumentDiagnostic = Readonly<{
  code: string;
  fieldPath: string;
  severity: "BLOCKER" | "REVIEW";
}>;

/** Decides verification readiness from decoded facts and source attestations. */
export function assessCommercialDocumentReadiness(
  content: CommercialDocumentContent,
  context: CommercialDocumentEvidenceContext,
  purpose: "DRAFT" | "VERIFY",
  review: DocumentVerificationReview | undefined,
  sourceFingerprint: string,
  money: MoneyReconciliationReport,
): { diagnostics: DocumentDiagnostic[]; coverage: CoverageReport | null } {
  const diagnostics: DocumentDiagnostic[] = [];
  const block = (code: string, fieldPath: string) =>
    diagnostics.push({ code, fieldPath, severity: "BLOCKER" });
  for (const check of money.checks)
    if (check.status !== "PASS")
      diagnostics.push({
        code: `${check.code}:${check.summaryId}`,
        fieldPath: "totals",
        severity: "REVIEW",
      });
  let coverage: CoverageReport | null = null;
  if (purpose === "DRAFT") return { diagnostics, coverage };
  if (content.documentKind === "UNCLASSIFIED") block("DOCUMENT_KIND_REQUIRED", "documentKind");
  for (const [index, row] of content.rows.entries())
    if (row.rowType === "ITEM" && row.description.value === null)
      block("ITEM_DESCRIPTION_REQUIRED", `rows.${index}.description`);
  function unresolved(node: unknown, path: string): void {
    if (Array.isArray(node)) {
      node.forEach((value, i) => unresolved(value, `${path}.${i}`));
      return;
    }
    if (node === null || typeof node !== "object") return;
    const missing = Reflect.get(node, "missingReason");
    if (missing === "UNREADABLE" || missing === "AMBIGUOUS") block("UNRESOLVED_SOURCE_FIELD", path);
    for (const [key, value] of Object.entries(node))
      if (key !== "evidenceRefs") unresolved(value, path ? `${path}.${key}` : key);
  }
  unresolved(content, "");
  if (!review) block("SOURCE_REVIEW_REQUIRED", "sourceReview");
  else {
    const value = review;
    if (value.sourceFingerprint !== sourceFingerprint)
      block("STALE_SOURCE_REVIEW", "sourceReview.sourceFingerprint");
    const { sourceFingerprint: _, acknowledgements: __, ...coverageReview } = value;
    coverage = collectDocumentCoverage(
      content,
      context,
      coverageReview satisfies DocumentCoverageReview,
    );
    if (!coverage.complete) block("INCOMPLETE_SOURCE_REVIEW", "sourceReview");
    const reviewedHumans = new Set(
      value.reviewedEvidenceRefs.filter((ref) => ref.kind === "HUMAN").map((ref) => ref.evidenceId),
    );
    visitDocumentEvidenceReferences(content, (ref, path) => {
      if (ref.kind === "HUMAN" && !reviewedHumans.has(ref.evidenceId))
        block("UNREVIEWED_HUMAN_EVIDENCE", path);
    });
    const allowed = new Set(diagnostics.filter((d) => d.severity === "REVIEW").map((d) => d.code));
    const acknowledged = new Set<string>();
    for (const ack of value.acknowledgements) {
      if (!allowed.has(ack.code) || acknowledged.has(ack.code))
        block("INVALID_ACKNOWLEDGEMENT", "sourceReview.acknowledgements");
      acknowledged.add(ack.code);
    }
    for (const code of allowed)
      if (!acknowledged.has(code))
        block("ACKNOWLEDGEMENT_REQUIRED", "sourceReview.acknowledgements");
  }
  return { diagnostics, coverage };
}
