import { FileError } from "./error.js";
import { type FileRevision, fileLimits } from "./file.js";
import {
  checkVersion,
  identifier,
  integer,
  invalid,
  object,
  only,
  type RevisionContext,
  revisionContext,
  text,
} from "./values.js";

export type SourceLocation =
  | Readonly<{ kind: "page"; page: number }>
  | Readonly<{ kind: "image"; x: number; y: number; width: number; height: number }>
  | Readonly<{ kind: "sheet"; sheet: string; cell: string }>
  | Readonly<{ kind: "text"; start: number; end: number }>;
export type Observation = Readonly<{
  id: string;
  label: string;
  value: string | null;
  source: SourceLocation | null;
  uncertain: boolean;
}>;
export type ProcessingOutput = Readonly<{
  documentKind: string;
  observations: readonly Observation[];
}>;

function fraction(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1)
    return invalid();
  return value;
}

export function sourceLocation(value: unknown): SourceLocation | null {
  if (value === null) return null;
  const v = object(value);
  if (v.kind === "page") {
    only(v, ["kind", "page"]);
    return { kind: "page", page: integer(v.page, 1, 10000) };
  }
  if (v.kind === "text") {
    only(v, ["kind", "start", "end"]);
    const start = integer(v.start, 0, fileLimits.bytes);
    return { kind: "text", start, end: integer(v.end, start + 1, fileLimits.bytes) };
  }
  if (v.kind === "sheet") {
    only(v, ["kind", "sheet", "cell"]);
    const cell = text(v.cell, 32);
    if (!/^[A-Z]{1,3}[1-9][0-9]{0,6}$/.test(cell)) return invalid();
    return { kind: "sheet", sheet: text(v.sheet, 128), cell };
  }
  if (v.kind === "image") {
    only(v, ["kind", "x", "y", "width", "height"]);
    const x = fraction(v.x),
      y = fraction(v.y),
      width = fraction(v.width),
      height = fraction(v.height);
    if (!width || !height || x + width > 1 || y + height > 1) return invalid();
    return { kind: "image", x, y, width, height };
  }
  return invalid();
}

export function processingOutput(value: unknown): ProcessingOutput {
  const v = object(value);
  only(v, ["documentKind", "observations"]);
  if (
    !Array.isArray(v.observations) ||
    v.observations.length < 1 ||
    v.observations.length > fileLimits.observations
  )
    return invalid();
  const seen = new Set<string>();
  const observations = v.observations.map((item): Observation => {
    const o = object(item);
    only(o, ["id", "label", "value", "source", "uncertain"]);
    const id = text(o.id, 80);
    if (!/^[A-Za-z0-9_-]+$/.test(id) || seen.has(id) || typeof o.uncertain !== "boolean")
      return invalid();
    seen.add(id);
    return {
      id,
      label: text(o.label, 200),
      value: o.value === null ? null : text(o.value, fileLimits.valueLength),
      source: sourceLocation(o.source),
      uncertain: o.uncertain,
    };
  });
  return { documentKind: text(v.documentKind, 120), observations };
}

export type ResultEdit =
  | Readonly<{ observationId: string; action: "replace"; value: string }>
  | Readonly<{ observationId: string; action: "exclude" }>;
type ProcessingState = "RUNNING" | "FAILED" | "READY" | "SAVED" | "DISCARDED";
export type ProcessingRevision = RevisionContext &
  Readonly<{
    runId: string;
    fileId: string;
    fileRevisionId: string;
    fileSha256: string;
    version: number;
    parentRevisionId: string | null;
    state: ProcessingState;
    attemptId: string;
    processorId: string;
    processorVersion: string;
    processorKind: "parser" | "ocr" | "ai";
    rawResult: ProcessingOutput | null;
    savedResult: ProcessingOutput | null;
    edits: readonly ResultEdit[];
    failure: "PROCESSING_UNAVAILABLE" | null;
  }>;
export function resultEdits(value: unknown): readonly ResultEdit[] {
  if (!Array.isArray(value) || value.length > fileLimits.observations) return invalid();
  const seen = new Set<string>();
  return value.map((item): ResultEdit => {
    const v = object(item);
    const observationId = text(v.observationId, 80);
    if (seen.has(observationId)) return invalid();
    seen.add(observationId);
    if (v.action === "replace") {
      only(v, ["observationId", "action", "value"]);
      return { observationId, action: "replace", value: text(v.value, fileLimits.valueLength) };
    }
    if (v.action === "exclude") {
      only(v, ["observationId", "action"]);
      return { observationId, action: "exclude" };
    }
    return invalid();
  });
}
export function beginProcessing(
  current: ProcessingRevision | null,
  expectedVersion: number,
  runId: string,
  file: FileRevision,
  processor: Readonly<{ id: string; version: string; kind: "parser" | "ocr" | "ai" }>,
  context: RevisionContext,
): ProcessingRevision {
  checkVersion(current, expectedVersion);
  if (current && current.state !== "RUNNING" && current.state !== "FAILED")
    throw new FileError(
      409,
      "Completed processing cannot be silently replaced.",
      "LIFECYCLE_CONFLICT",
    );
  if (
    current &&
    (current.runId !== runId ||
      current.repositoryId !== file.repositoryId ||
      current.fileRevisionId !== file.id)
  )
    throw new FileError(409, "Processing source cannot change.", "SOURCE_INVALID");
  if (
    current &&
    (current.processorId !== processor.id ||
      current.processorVersion !== processor.version ||
      current.processorKind !== processor.kind)
  )
    throw new FileError(409, "Processing method cannot change on retry.", "SOURCE_INVALID");
  if (context.repositoryId !== file.repositoryId)
    throw new FileError(409, "Foreign file source.", "SOURCE_INVALID");
  return {
    ...revisionContext(context, file.repositoryId),
    runId: identifier(runId),
    fileId: file.fileId,
    fileRevisionId: file.id,
    fileSha256: file.sha256,
    version: expectedVersion + 1,
    parentRevisionId: current?.id ?? null,
    state: "RUNNING",
    attemptId: context.id,
    processorId: text(processor.id, 120),
    processorVersion: text(processor.version, 200),
    processorKind: processor.kind,
    rawResult: null,
    savedResult: null,
    edits: [],
    failure: null,
  };
}
export function finishProcessing(
  current: ProcessingRevision,
  attemptId: string,
  result: ProcessingOutput | null,
  context: RevisionContext,
): ProcessingRevision {
  if (current.state !== "RUNNING" || current.attemptId !== attemptId)
    throw new FileError(409, "Processing attempt was superseded.", "VERSION_CONFLICT");
  if (context.repositoryId !== current.repositoryId)
    throw new FileError(409, "Foreign processing completion.", "SOURCE_INVALID");
  return {
    ...current,
    ...revisionContext(context, current.repositoryId),
    parentRevisionId: current.id,
    version: current.version + 1,
    state: result === null ? "FAILED" : "READY",
    rawResult: result === null ? null : processingOutput(result),
    savedResult: null,
    edits: [],
    failure: result === null ? "PROCESSING_UNAVAILABLE" : null,
  };
}
export function finalizeProcessing(
  current: ProcessingRevision,
  expectedVersion: number,
  command:
    | Readonly<{ action: "save"; edits: readonly ResultEdit[] }>
    | Readonly<{ action: "discard" }>,
  context: RevisionContext,
): ProcessingRevision {
  checkVersion(current, expectedVersion);
  if (current.state !== "READY" || current.rawResult === null)
    throw new FileError(409, "Processing result is not ready.", "LIFECYCLE_CONFLICT");
  if (context.repositoryId !== current.repositoryId)
    throw new FileError(409, "Foreign processing result.", "SOURCE_INVALID");
  const edits = command.action === "save" ? resultEdits(command.edits) : [];
  const raw = processingOutput(current.rawResult);
  const known = new Set(raw.observations.map((o) => o.id));
  for (const edit of edits)
    if (!known.has(edit.observationId))
      return invalid("Result edit references an unknown observation.");
  const byId = new Map(edits.map((edit) => [edit.observationId, edit]));
  const selected = raw.observations.flatMap((observation): Observation[] => {
    const edit = byId.get(observation.id);
    if (edit?.action === "exclude") return [];
    return [{ ...observation, value: edit?.action === "replace" ? edit.value : observation.value }];
  });
  if (command.action === "save" && selected.length === 0)
    return invalid("Save requires at least one retained observation.");
  return {
    ...current,
    ...revisionContext(context, current.repositoryId),
    version: current.version + 1,
    parentRevisionId: current.id,
    rawResult: raw,
    savedResult:
      command.action === "save"
        ? processingOutput({ documentKind: raw.documentKind, observations: selected })
        : null,
    edits,
    state: command.action === "save" ? "SAVED" : "DISCARDED",
  };
}
