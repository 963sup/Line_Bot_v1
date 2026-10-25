import type { FileRevision } from "../../domain/file.js";

export type FileSourceReference = Readonly<{
  fileId: string;
  fileRevisionId: string;
  fileSha256: string;
}>;

/** File alone authorizes and verifies exact original bytes, before and after object I/O. */
export interface FileSourceReader {
  read(
    actor: string,
    repositoryId: string,
    source: Readonly<Pick<FileSourceReference, "fileId" | "fileRevisionId">>,
  ): Promise<{ revision: FileRevision; bytes: Uint8Array }>;
}

/** Bound to the consuming owner's transaction; never performs external object I/O. */
export interface FileRevisionQualifier {
  verify(actor: string, repositoryId: string, source: FileSourceReference): Promise<void>;
}

/**
 * Read-only access to pre-cutover processing evidence.  File owns these old
 * relations until the controlled data move; no current processing writes use it.
 */
export interface LegacyProcessingHistory {
  read(
    actor: string,
    repositoryId: string,
    runId: string,
    revisionId?: string,
  ): Promise<Readonly<Record<string, unknown>> | null>;
  list(
    actor: string,
    repositoryId: string,
    fileId: string,
    after?: string,
  ): Promise<readonly Readonly<Record<string, unknown>>[]>;
}
