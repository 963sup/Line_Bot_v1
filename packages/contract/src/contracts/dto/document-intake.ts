import type {
  DocumentSource,
  PurchaseOrderCandidate,
  SourceReviewAttestation,
} from "../../domain/document-intake.js";

export type DocumentIntakeRevisionDto = Readonly<{
  schemaVersion: 1;
  id: string;
  documentId: string;
  repositoryId: string;
  version: number;
  parentRevisionId: string | null;
  actorUserId: string;
  at: number;
  state: "DRAFT" | "CONFIRMED";
  source: DocumentSource;
  expectedLineCount: number;
  candidate: PurchaseOrderCandidate;
  diagnostics: readonly string[];
  acknowledgementReason: string | null;
  sourceReviewAttestation: SourceReviewAttestation | null;
}>;
