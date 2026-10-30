import {
  type FileInfo,
  type PendingUpload,
  parseFile,
  parsePendingPage,
} from "@line_bot_v1/file/contracts/parse-files";
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
export function errorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause);
}
