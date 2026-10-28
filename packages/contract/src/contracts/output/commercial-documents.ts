import type { CommercialDocumentContent } from "../../domain/commercial-document.js";
import type { CommercialDocumentEvidenceContext } from "../../domain/commercial-document-evidence.js";
export type CommercialDraftCommand = Readonly<{
  commandId: string;
  repositoryId: string;
  documentId: string;
  expectedVersion: number;
  extractionResultId: string;
}>;
export type CommercialDocumentReceipt = Readonly<{
  commandId: string;
  documentId: string;
  revisionId: string;
  documentVersion: number;
  operation: "CREATE_DRAFT";
}>;
export type CommercialDraftRevision = Readonly<{
  revisionId: string;
  documentId: string;
  repositoryId: string;
  documentVersion: number;
  parentRevisionId: string | null;
  schemaVersion: 1;
  reviewState: "DRAFT";
  source: CommercialDocumentEvidenceContext["source"];
  extractionResultId: string;
  content: CommercialDocumentContent;
  createdByUserId: string;
  createdAt: string;
}>;
/** An ephemeral Contract-normalized projection of an authorized immutable technical result.
 * Implementations must not persist this business projection in Intelligence or call a provider.
 */
export interface CommercialDraftSource {
  readDraftInput(
    actorUserId: string,
    query: Readonly<{ repositoryId: string; extractionResultId: string }>,
  ): Promise<Readonly<{ content: unknown; evidenceContext: CommercialDocumentEvidenceContext }>>;
}
export interface CommercialDocumentTransaction {
  readonly writable: boolean;
  replay(commandId: string, fingerprint: string): Promise<CommercialDocumentReceipt | null>;
  current(documentId: string): Promise<Readonly<{
    version: number;
    draftRevisionId: string | null;
    verifiedRevisionId: string | null;
    archived: boolean;
  }> | null>;
  qualifySource(source: CommercialDraftRevision["source"]): Promise<void>;
  appendDraft(revision: CommercialDraftRevision, expectedVersion: number): Promise<void>;
  record(
    commandId: string,
    fingerprint: string,
    revision: CommercialDraftRevision,
  ): Promise<CommercialDocumentReceipt>;
}
export interface CommercialDocumentStore {
  assertReady(actor: string, repositoryId: string): Promise<void>;
  transact<T>(
    actor: string,
    command: CommercialDraftCommand,
    work: (tx: CommercialDocumentTransaction) => Promise<T>,
  ): Promise<T>;
  receipt(
    actor: string,
    query: Readonly<{ repositoryId: string; commandId: string }>,
    fingerprint?: string,
  ): Promise<CommercialDocumentReceipt | null>;
  readBySource(
    actor: string,
    query: Readonly<{ repositoryId: string; fileId: string; fileRevisionId: string }>,
  ): Promise<CommercialDraftRevision | null>;
  read(
    actor: string,
    query: Readonly<{ repositoryId: string; documentId: string }>,
  ): Promise<CommercialDraftRevision | null>;
}
