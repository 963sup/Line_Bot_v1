import { createHash } from "node:crypto";
import { commercialDocumentContentSchema } from "../contracts/input/commercial-document.js";
import { documentVerificationReviewSchema } from "../contracts/input/commercial-document-review.js";
import type { CommercialDocumentContent } from "../domain/commercial-document.js";
import type { CoverageReport } from "../domain/commercial-document-coverage.js";
import type { CommercialDocumentEvidenceContext } from "../domain/commercial-document-evidence.js";
import {
  assessCommercialDocumentReadiness,
  type DocumentDiagnostic,
  type DocumentVerificationReview,
} from "../domain/commercial-document-validation.js";
import { validateCommercialDocumentEvidence } from "./commercial-document-evidence.js";
import {
  type MoneyReconciliationReport,
  reconcileDocumentAmounts,
} from "./commercial-document-money.js";

export type CommercialDocumentValidationReport = Readonly<{
  purpose: "DRAFT" | "VERIFY";
  valid: boolean;
  content: CommercialDocumentContent | null;
  sourceFingerprint: string | null;
  diagnostics: readonly DocumentDiagnostic[];
  money: MoneyReconciliationReport | null;
  coverage: CoverageReport | null;
}>;

/** Decode input, pin fingerprints and coordinate domain assessments. A successful VERIFY assessment is not a persisted revision. */
export function validateCommercialDocument(
  input: unknown,
  purpose: "DRAFT" | "VERIFY",
  context: CommercialDocumentEvidenceContext,
  review?: DocumentVerificationReview,
): CommercialDocumentValidationReport {
  const parsed = commercialDocumentContentSchema.safeParse(input);
  if (!parsed.success)
    return {
      purpose,
      valid: false,
      content: null,
      sourceFingerprint: null,
      diagnostics: parsed.error.issues.map((issue) => ({
        code: "INVALID_DOCUMENT_FIELD",
        fieldPath: issue.path.join("."),
        severity: "BLOCKER",
      })),
      money: null,
      coverage: null,
    };
  const content = parsed.data;
  const diagnostics: DocumentDiagnostic[] = validateCommercialDocumentEvidence(
    content,
    context,
  ).map((issue) => ({ ...issue, severity: "BLOCKER" }));
  if (diagnostics.length)
    return {
      purpose,
      valid: false,
      content,
      sourceFingerprint: null,
      diagnostics,
      money: null,
      coverage: null,
    };
  const money = reconcileDocumentAmounts(content, 1);
  const sourceFingerprint = createHash("sha256")
    .update("commercial-document-review/1\n")
    .update(
      JSON.stringify([
        context.source.fileId,
        context.source.fileRevisionId,
        context.source.sha256,
        context.extractionResultId,
        money.contentFingerprint,
      ]),
    )
    .digest("hex");
  const parsedReview = documentVerificationReviewSchema.safeParse(review);
  const assessed = assessCommercialDocumentReadiness(
    content,
    context,
    purpose,
    parsedReview.success ? parsedReview.data : undefined,
    sourceFingerprint,
    money,
  );
  diagnostics.push(...assessed.diagnostics);
  const coverage = assessed.coverage;

  return {
    purpose,
    valid: !diagnostics.some((issue) => issue.severity === "BLOCKER"),
    content,
    sourceFingerprint,
    diagnostics,
    money,
    coverage,
  };
}
