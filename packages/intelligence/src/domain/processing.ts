import type { FileRevision } from "@line_bot_v1/file/domain/file";

type ProcessingState = "RUNNING" | "FAILED" | "READY" | "SAVED" | "DISCARDED";
export type Observation = Readonly<{
  id: string;
  label: string;
  value: string | null;
  uncertain: boolean;
}>;
export type ProcessingOutput = Readonly<{
  documentKind: string;
  observations: readonly Observation[];
}>;
export type ProcessingRevision = Readonly<{
  id: string;
  repositoryId: string;
  runId: string;
  fileId: string;
  fileRevisionId: string;
  fileSha256: string;
  version: number;
  parentRevisionId: string | null;
  actorUserId: string;
  at: number;
  state: ProcessingState;
  attemptId: string;
  processorId: string;
  processorVersion: string;
  processorKind: "parser" | "ocr" | "ai";
  rawResult: ProcessingOutput | null;
  savedResult: ProcessingOutput | null;
  edits: readonly unknown[];
  failure: "PROCESSING_UNAVAILABLE" | null;
}>;
export function beginProcessing(
  input: Readonly<{
    id: string;
    runId: string;
    actorUserId: string;
    at: number;
    file: FileRevision;
    processor: Readonly<{ id: string; version: string; kind: "parser" | "ocr" | "ai" }>;
  }>,
): ProcessingRevision {
  return {
    id: input.id,
    repositoryId: input.file.repositoryId,
    runId: input.runId,
    fileId: input.file.fileId,
    fileRevisionId: input.file.id,
    fileSha256: input.file.sha256,
    version: 1,
    parentRevisionId: null,
    actorUserId: input.actorUserId,
    at: input.at,
    state: "RUNNING",
    attemptId: input.id,
    processorId: input.processor.id,
    processorVersion: input.processor.version,
    processorKind: input.processor.kind,
    rawResult: null,
    savedResult: null,
    edits: [],
    failure: null,
  };
}
export function finishProcessing(
  current: ProcessingRevision,
  input: Readonly<{ id: string; actorUserId: string; at: number; result: ProcessingOutput | null }>,
): ProcessingRevision {
  if (current.state !== "RUNNING") throw new Error("PROCESSING_FENCED");
  return {
    ...current,
    id: input.id,
    parentRevisionId: current.id,
    version: current.version + 1,
    actorUserId: input.actorUserId,
    at: input.at,
    state: input.result ? "READY" : "FAILED",
    rawResult: input.result,
    savedResult: null,
    edits: [],
    failure: input.result ? null : "PROCESSING_UNAVAILABLE",
  };
}
export function finalizeProcessing(
  current: ProcessingRevision,
  input: Readonly<{
    id: string;
    actorUserId: string;
    at: number;
    action: "save" | "discard";
    edits: readonly unknown[];
  }>,
): ProcessingRevision {
  if (current.state !== "READY" || !current.rawResult) throw new Error("PROCESSING_NOT_READY");
  return {
    ...current,
    id: input.id,
    parentRevisionId: current.id,
    version: current.version + 1,
    actorUserId: input.actorUserId,
    at: input.at,
    state: input.action === "save" ? "SAVED" : "DISCARDED",
    savedResult: input.action === "save" ? current.rawResult : null,
    edits: input.edits,
  };
}
