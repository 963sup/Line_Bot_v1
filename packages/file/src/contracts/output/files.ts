import type { FileDescriptor, FileRevision, FileUploadIntent } from "../../domain/file.js";

export type FileReceipt = Readonly<{ kind: "file"; requestId: string; revision: FileRevision }>;
interface FileRevisions {
  load(fileId: string): Promise<FileRevision | null>;
  save(next: FileRevision, expectedVersion: number): Promise<void>;
}

export interface FileTransaction {
  readonly scope: { repositoryId: string; permissions: readonly string[]; archived: boolean };
  readonly files: FileRevisions;
  readonly uploads: {
    load(): Promise<FileUploadIntent | null>;
    prepare(intent: FileUploadIntent): Promise<void>;
    /** Extend the active upload window before each external attempt. */
    touch(): Promise<void>;
  };
  nextId(): string;
  replay(): Promise<FileReceipt | null>;
  record(receipt: FileReceipt): Promise<void>;
}
export interface FileTransactions {
  transact<T>(
    actor: string,
    identity: Readonly<{ repositoryId: string; kind: "file"; id: string }>,
    evidence: Readonly<{ requestId: string; payload: string }>,
    work: (tx: FileTransaction) => Promise<T>,
  ): Promise<T>;
}
export interface FileReads {
  /** Recheck current actor/Repository access without reloading immutable revision metadata. */
  authorize(actor: string, scope: string): Promise<void>;
  /** One authorization + transaction for initial File and pending-upload metadata. */
  overview(
    actor: string,
    scope: string,
  ): Promise<{
    files: readonly FileRevision[];
    next: string | null;
    intents: readonly FileUploadIntent[];
    pendingNext: string | null;
  }>;
  /** Pending Upload Intents belong only to the original actor and are never File List entries. */
  pendingUploads(
    actor: string,
    scope: string,
    after?: string,
  ): Promise<{ intents: readonly FileUploadIntent[]; next: string | null }>;
  file(actor: string, scope: string, id: string, revisionId?: string): Promise<FileRevision>;
  list(
    actor: string,
    scope: string,
    after?: string,
  ): Promise<{ files: readonly FileRevision[]; next: string | null }>;
}
/** Operator-only capability; never exposed through a File Web route. */
export interface FileReclamation {
  /**
   * One bounded page ordered by the oldest absence verification cursor.
   * Quarantined intents remain candidates because an earlier unknown PUT may complete later.
   */
  candidates(beforeAt: number, quietMillis: number): Promise<readonly FileUploadIntent[]>;
  quarantine(
    actor: string,
    requestId: string,
    beforeAt: number,
    quietMillis: number,
  ): Promise<FileRevision | null>;
  /** Refresh the durable cursor only after object absence was independently verified. */
  markReclaimed(actor: string, requestId: string, revisionId: string): Promise<void>;
}

export interface FilePayloadInspector {
  inspect(
    bytes: Uint8Array,
    name: string,
    mediaType: string,
  ): { descriptor: FileDescriptor; bytes: Uint8Array };
}
