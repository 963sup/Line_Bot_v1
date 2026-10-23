import type { FileRevision } from "../../domain/file.js";
import type { ProcessingRevision } from "../../domain/processing-run.js";

export interface FileRevisions {
  load(fileId: string, revisionId?: string): Promise<FileRevision | null>;
  save(next: FileRevision, expectedVersion: number): Promise<void>;
}
export interface ProcessingRevisions {
  load(runId: string, revisionId?: string): Promise<ProcessingRevision | null>;
  save(next: ProcessingRevision, expectedVersion: number): Promise<void>;
}
