import type { FileRevision } from "../../domain/file.js";

export interface FileRevisions {
  load(fileId: string, revisionId?: string): Promise<FileRevision | null>;
  save(next: FileRevision, expectedVersion: number): Promise<void>;
}
