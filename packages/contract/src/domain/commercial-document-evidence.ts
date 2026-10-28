import type { CommercialDocumentContent } from "./commercial-document.js";
import type { EvidenceReference } from "./commercial-document-values.js";

type CommercialDocumentSource = { fileId: string; fileRevisionId: string; sha256: string };
export type CommercialDocumentEvidenceContext = {
  source: CommercialDocumentSource;
  extractionResultId: string;
  pageCount: number;
  observations: { observationId: string; pageNumber: number }[];
  humanEvidence: { evidenceId: string; source: CommercialDocumentSource; pageNumber: number }[];
};
export type EvidenceDiagnostic = Readonly<{
  code: "INVALID_EVIDENCE_CONTEXT" | "INVALID_EXTRACTION_REFERENCE" | "INVALID_HUMAN_REFERENCE";
  fieldPath: string;
}>;

/** Validates references against an already qualified immutable source projection, without I/O.
 * The application must obtain this projection from authorized source/result readers.
 * Shape and graph validation of content precede this check.
 */
export function validateCommercialDocumentEvidence(
  content: CommercialDocumentContent,
  evidenceContext: CommercialDocumentEvidenceContext,
): readonly EvidenceDiagnostic[] {
  const context = evidenceContext;
  const observations = new Set<string>();
  const humanEvidence = new Set<string>();
  for (const observation of context.observations) {
    if (observations.has(observation.observationId) || observation.pageNumber > context.pageCount)
      return [{ code: "INVALID_EVIDENCE_CONTEXT", fieldPath: "evidenceContext.observations" }];
    observations.add(observation.observationId);
  }
  for (const human of context.humanEvidence) {
    if (
      humanEvidence.has(human.evidenceId) ||
      human.pageNumber > context.pageCount ||
      human.source.fileId !== context.source.fileId ||
      human.source.fileRevisionId !== context.source.fileRevisionId ||
      human.source.sha256 !== context.source.sha256
    )
      return [{ code: "INVALID_EVIDENCE_CONTEXT", fieldPath: "evidenceContext.humanEvidence" }];
    humanEvidence.add(human.evidenceId);
  }
  const diagnostics: EvidenceDiagnostic[] = [];
  visitDocumentEvidenceReferences(content, (ref, fieldPath) => {
    if (
      ref.kind === "EXTRACTION" &&
      (ref.extractionResultId !== context.extractionResultId ||
        !observations.has(ref.observationId))
    )
      diagnostics.push({ code: "INVALID_EXTRACTION_REFERENCE", fieldPath });
    if (ref.kind === "HUMAN" && !humanEvidence.has(ref.evidenceId))
      diagnostics.push({ code: "INVALID_HUMAN_REFERENCE", fieldPath });
  });
  return diagnostics;
}

/** Shared traversal for validated document shapes; no copy of the evidence graph. */
export function visitDocumentEvidenceReferences(
  content: CommercialDocumentContent,
  visitor: (ref: EvidenceReference, fieldPath: string) => void,
): void {
  function visit(node: unknown, path: string): void {
    if (Array.isArray(node)) {
      node.forEach((child, index) => visit(child, `${path}.${index}`));
      return;
    }
    if (node === null || typeof node !== "object") return;
    for (const [key, value] of Object.entries(node)) {
      const fieldPath = path ? `${path}.${key}` : key;
      if (key !== "evidenceRefs") {
        visit(value, fieldPath);
        continue;
      }
      if (Array.isArray(value))
        for (const [index, ref] of value.entries()) visitor(ref, `${fieldPath}.${index}`);
    }
  }
  visit(content, "");
}
