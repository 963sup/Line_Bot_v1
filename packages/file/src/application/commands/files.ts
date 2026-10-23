import { resultEdits } from "../../domain/processing-run.js";
import { identifier, invalid, object, only, scopeId, text, version } from "../../domain/values.js";

function base(value: Record<string, unknown>) {
  return {
    repositoryId: scopeId(value.repositoryId),
    requestId: identifier(value.requestId),
    expectedVersion: version(value.expectedVersion),
  };
}
export function uploadCommand(input: unknown) {
  const v = object(input);
  only(v, ["repositoryId", "requestId", "expectedVersion", "fileId", "name", "mediaType"]);
  return {
    ...base(v),
    fileId: identifier(v.fileId),
    name: text(v.name, 255).trim(),
    mediaType: text(v.mediaType, 160).trim().toLowerCase(),
  };
}
export function processingCommand(input: unknown) {
  const v = object(input);
  only(v, ["repositoryId", "requestId", "expectedVersion", "runId", "fileId", "fileRevisionId"]);
  return {
    ...base(v),
    runId: identifier(v.runId),
    fileId: identifier(v.fileId),
    fileRevisionId: identifier(v.fileRevisionId),
  };
}
export function resultCommand(input: unknown) {
  const v = object(input);
  const common = { ...base(v), runId: identifier(v.runId) };
  if (v.action === "save") {
    only(v, ["repositoryId", "requestId", "expectedVersion", "runId", "action", "edits"]);
    return { ...common, action: "save" as const, edits: resultEdits(v.edits ?? []) };
  }
  only(v, ["repositoryId", "requestId", "expectedVersion", "runId", "action"]);
  if (v.action === "discard") return { ...common, action: "discard" as const };
  return invalid("Invalid result action.");
}
