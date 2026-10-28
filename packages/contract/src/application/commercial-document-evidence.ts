import { commercialDocumentEvidenceContextSchema } from "../contracts/input/commercial-document-evidence.js";
import type { CommercialDocumentContent } from "../domain/commercial-document.js";
import {
  type CommercialDocumentEvidenceContext,
  type EvidenceDiagnostic,
  validateCommercialDocumentEvidence as validateEvidenceMembership,
} from "../domain/commercial-document-evidence.js";

/** Decode the authorized immutable source projection before applying membership rules. */
export function validateCommercialDocumentEvidence(
  content: CommercialDocumentContent,
  context: CommercialDocumentEvidenceContext,
): readonly EvidenceDiagnostic[] {
  const parsed = commercialDocumentEvidenceContextSchema.safeParse(context);
  return parsed.success
    ? validateEvidenceMembership(content, parsed.data)
    : [{ code: "INVALID_EVIDENCE_CONTEXT", fieldPath: "evidenceContext" }];
}
