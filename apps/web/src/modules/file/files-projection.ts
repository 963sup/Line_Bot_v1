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
export type View = {
  actorUserId: string;
  repository: { id: string };
  canEdit: boolean;
  canManage: boolean;
  files: FileInfo[];
  next: string | null;
  uploads: PendingUpload[];
  pendingNext: string | null;
  uploadMaxBytes: number;
};
type UploadCommand = {
  repositoryId: string;
  fileId: string;
  requestId: string;
  expectedVersion: number;
  name: string;
  mediaType: string;
};
export type Pending = { command: UploadCommand; file: File };
export type SignedCommand = UploadCommand & { byteLength: number; sha256: string };
export type FileMutation = {
  operation: "prepare-upload" | "complete-upload";
  command: SignedCommand;
};
export class StaleRequest extends Error {}

/** Validate unknown HTTP projections at the browser boundary; server DTOs are not trusted casts. */
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("File response format is invalid.");
  return Object.fromEntries(Object.entries(value));
}
export function stringValue(value: unknown): string {
  if (typeof value !== "string") throw new Error("File response field is invalid.");
  return value;
}
export function intValue(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new Error("File response number is invalid.");
  return value;
}
function boolValue(value: unknown): boolean {
  if (typeof value !== "boolean") throw new Error("File response boolean is invalid.");
  return value;
}
function optionalString(value: unknown): string | null {
  return value === null ? null : stringValue(value);
}
export function listOf<T>(value: unknown, parse: (item: unknown) => T): T[] {
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
export function parseView(value: unknown): View {
  const r = record(value);
  const pending = parsePendingPage({ uploads: r.uploads, next: r.pendingNext });
  const repository = record(r.repository);
  return {
    actorUserId: stringValue(r.actorUserId),
    repository: { id: stringValue(repository.id) },
    canEdit: boolValue(r.canEdit),
    canManage: boolValue(r.canManage),
    files: listOf(r.files, parseFile),
    next: optionalString(r.next),
    uploads: pending.uploads,
    pendingNext: pending.next,
    uploadMaxBytes: intValue(r.uploadMaxBytes),
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

export function errorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause);
}
