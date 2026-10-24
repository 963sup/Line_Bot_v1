import type { ContractDocumentRevision, DocumentSource } from "../../domain/document-intake.js";
import type { DocumentReceipt } from "../input/document-intake.js";

export interface ContractDocumentIntakeTransactions {
  read(
    actor: string,
    query: Readonly<{ repositoryId: string; documentId: string; revisionId?: string }>,
  ): Promise<ContractDocumentRevision | null>;
  transact<T>(
    actor: string,
    input: Readonly<{
      repositoryId: string;
      documentId: string;
      requestId: string;
      intentFingerprint: string;
      fingerprint: string;
    }>,
    operation: (tx: ContractDocumentIntakeTransaction) => Promise<T>,
  ): Promise<T>;
  receipt(
    actor: string,
    scope: Readonly<{ repositoryId: string; documentId: string; requestId: string }>,
  ): Promise<DocumentReceipt | null>;
}

export interface ContractDocumentIntakeTransaction {
  readonly repositoryId: string;
  readonly permissions: readonly string[];
  readonly archived: boolean;
  nextId(): string;
  verifySource(actor: string, source: DocumentSource): Promise<void>;
  replay(): Promise<DocumentReceipt | null>;
  load(): Promise<ContractDocumentRevision | null>;
  save(revision: ContractDocumentRevision, expectedVersion: number): Promise<void>;
  record(revision: ContractDocumentRevision): Promise<DocumentReceipt>;
}
