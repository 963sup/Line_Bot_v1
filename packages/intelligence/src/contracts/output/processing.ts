import type { FileSourceReference } from "@line_bot_v1/file/contracts/output/references";
import type { ProcessingRevision } from "../../domain/processing.js";

export type ProcessingCommand = Readonly<{
  repositoryId: string;
  requestId: string;
  runId: string;
  expectedVersion: number;
  action: "run" | "save" | "discard";
  source?: FileSourceReference;
  processorId?: string;
  processorVersion?: string;
  edits?: readonly unknown[];
}>;

export type ProcessingTransaction = Readonly<{
  repositoryId: string;
  permissions: readonly string[];
  archived: boolean;
  nextId(): string;
  replay(): Promise<Readonly<{ revision: ProcessingRevision; exact: boolean }> | null>;
  load(): Promise<ProcessingRevision | null>;
  save(revision: ProcessingRevision, expectedVersion: number): Promise<void>;
  record(revision: ProcessingRevision): Promise<void>;
  qualifySource(source: FileSourceReference): Promise<void>;
}>;

export interface IntelligenceProcessingStore {
  nextId(): string;
  read(
    actor: string,
    repositoryId: string,
    runId: string,
    revisionId?: string,
  ): Promise<ProcessingRevision | null>;
  list(
    actor: string,
    repositoryId: string,
    fileId: string,
    after?: string,
  ): Promise<Readonly<{ runs: readonly ProcessingRevision[]; next: string | null }>>;
  transact(
    actor: string,
    command: ProcessingCommand,
    work: (transaction: ProcessingTransaction) => Promise<ProcessingRevision>,
  ): Promise<ProcessingRevision>;
}
