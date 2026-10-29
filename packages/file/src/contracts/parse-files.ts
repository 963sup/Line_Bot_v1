export type FileInfo = {
  repositoryId: string;
  fileId: string;
  revisionId: string;
  version: number;
  name: string;
  mediaType: string;
  byteLength: number;
  sha256: string;
};
export type PendingUpload = {
  requestId: string;
  fileId: string;
  revisionId: string;
  expectedVersion: number;
  name: string;
  mediaType: string;
  byteLength: number;
  sha256: string;
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
function optionalString(value: unknown): string | null {
  return value === null ? null : stringValue(value);
}
function listOf<T>(value: unknown, parse: (item: unknown) => T): T[] {
  if (!Array.isArray(value)) throw new Error("File response list is invalid.");
  return value.map(parse);
}
export function parseFile(value: unknown): FileInfo {
  const r = record(value);
  return {
    repositoryId: stringValue(r.repositoryId),
    fileId: stringValue(r.fileId),
    revisionId: stringValue(r.revisionId),
    version: intValue(r.version),
    name: stringValue(r.name),
    mediaType: stringValue(r.mediaType),
    byteLength: intValue(r.byteLength),
    sha256: stringValue(r.sha256),
  };
}
export function parsePendingPage(value: unknown): {
  uploads: PendingUpload[];
  next: string | null;
} {
  const r = record(value);
  return {
    uploads: listOf(r.uploads, (item): PendingUpload => {
      const entry = record(item);
      return {
        requestId: stringValue(entry.requestId),
        fileId: stringValue(entry.fileId),
        revisionId: stringValue(entry.revisionId),
        expectedVersion: intValue(entry.expectedVersion),
        name: stringValue(entry.name),
        mediaType: stringValue(entry.mediaType),
        byteLength: intValue(entry.byteLength),
        sha256: stringValue(entry.sha256),
      };
    }),
    next: optionalString(r.next),
  };
}
export function parseMutation(value: unknown): { requestId: string; file: FileInfo } {
  const r = record(value);
  return { requestId: stringValue(r.requestId), file: parseFile(r.file) };
}
