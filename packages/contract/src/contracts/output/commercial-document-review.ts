import type { CommercialDocumentEvidenceContext } from "../../domain/commercial-document-evidence.js";

/** Implemented at composition using current Repository/File/result reader capabilities.
 * Rechecks actor access on every call and projects only the evidence needed by Contract.
 */
export interface CommercialDocumentReviewSource {
  readQualifiedEvidence(
    actorUserId: string,
    query: Readonly<{ repositoryId: string; extractionResultId: string }>,
  ): Promise<CommercialDocumentEvidenceContext>;
}
