export type DocumentIntakeReceipt = {
  requestId: string;
  documentId: string;
  revisionId: string;
  version: number;
  intentFingerprint: string;
};
type DocumentSource = { fileId: string; fileRevisionId: string; fileSha256: string };
export type DocumentIntakeRevision = {
  documentId: string;
  revisionId: string;
  version: number;
  state: "DRAFT" | "CONFIRMED";
  source: DocumentSource;
  candidate: Record<string, unknown>;
  diagnostics: string[];
};
export type DocumentIntakeCommand = {
  action: "save";
  repositoryId: string;
  documentId: string;
  requestId: string;
  expectedVersion: number;
  source: DocumentSource;
};
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("File response format is invalid.");
  return Object.fromEntries(Object.entries(value));
}
function stringValue(value: unknown): string {
  if (typeof value !== "string") throw new Error("File response field is invalid.");
  return value;
}
function intValue(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new Error("File response number is invalid.");
  return value;
}
function listOf<T>(value: unknown, parse: (item: unknown) => T): T[] {
  if (!Array.isArray(value)) throw new Error("File response list is invalid.");
  return value.map(parse);
}
export function parseDocumentIntakeReceipt(value: unknown): DocumentIntakeReceipt {
  const r = record(value);
  return {
    requestId: stringValue(r.requestId),
    documentId: stringValue(r.documentId),
    revisionId: stringValue(r.revisionId),
    version: intValue(r.version),
    intentFingerprint: stringValue(r.intentFingerprint),
  };
}
function parseDocumentSource(value: unknown): DocumentSource {
  const r = record(value);
  return {
    fileId: stringValue(r.fileId),
    fileRevisionId: stringValue(r.fileRevisionId),
    fileSha256: stringValue(r.fileSha256),
  };
}
export function parseDocumentIntakeRevision(value: unknown): DocumentIntakeRevision {
  const r = record(value);
  const state = stringValue(r.state);
  if (state !== "DRAFT" && state !== "CONFIRMED")
    throw new Error("ContractDocument state is invalid.");
  return {
    documentId: stringValue(r.documentId),
    revisionId: stringValue(r.id),
    version: intValue(r.version),
    state,
    source: parseDocumentSource(r.source),
    candidate: record(r.candidate),
    diagnostics: listOf(r.diagnostics, stringValue),
  };
}
