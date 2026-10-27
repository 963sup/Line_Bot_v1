import type { FileRevision } from "../../domain/file.js";

export type FileSourceReference = Readonly<{
  fileId: string;
  fileRevisionId: string;
  fileSha256: string;
}>;

/** File verifies exact original bytes and current access; returned bytes own a detached buffer. */
export interface FileSourceReader {
  read(
    actor: string,
    repositoryId: string,
    source: Readonly<Pick<FileSourceReference, "fileId" | "fileRevisionId">>,
    maxBytes?: number,
  ): Promise<{ revision: FileRevision; bytes: Uint8Array<ArrayBuffer> }>;
}

/** Bound to the consuming owner's transaction; never performs external object I/O. */
export interface FileRevisionQualifier {
  verify(actor: string, repositoryId: string, source: FileSourceReference): Promise<void>;
}
