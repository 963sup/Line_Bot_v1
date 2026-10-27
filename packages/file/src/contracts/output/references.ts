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
    maxBytes?: number,
  ): Promise<{ revision: FileRevision; bytes: Uint8Array }>;
}

/** Bound to the consuming owner's transaction; never performs external object I/O. */
export interface FileRevisionQualifier {
  verify(actor: string, repositoryId: string, source: FileSourceReference): Promise<void>;
}
