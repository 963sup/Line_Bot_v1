import { FileError } from "./error.js";

export function invalid(message = "Invalid File input."): never {
  throw new FileError(400, message, "INVALID_INPUT");
}

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  return { ...value };
}

export function only(value: Record<string, unknown>, keys: readonly string[]): void {
  if (Object.keys(value).some((key) => !keys.includes(key))) invalid("Unknown input field.");
}

export function text(value: unknown, maximum: number, empty = false): string {
  if (
    typeof value !== "string" ||
    value.length > maximum ||
    value.includes("\u0000") ||
    (!empty && !value.trim())
  )
    return invalid();
  return value;
}

export function identifier(value: unknown): string {
  const result = text(value, 36);
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(result)) return invalid();
  return result.toLowerCase();
}

export function scopeId(value: unknown): string {
  const result = text(value, 128);
  if (result !== result.trim()) return invalid();
  return result;
}

export function integer(value: unknown, minimum: number, maximum: number): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  )
    return invalid();
  return value;
}

export function version(value: unknown): number {
  return integer(value, 0, 2_147_483_646);
}

export type RevisionContext = Readonly<{
  id: string;
  repositoryId: string;
  actorUserId: string;
  at: number;
}>;

export function revisionContext(value: RevisionContext, repositoryId: string): RevisionContext {
  if (value.repositoryId !== repositoryId)
    throw new FileError(409, "Foreign revision scope.", "SOURCE_INVALID");
  return {
    id: identifier(value.id),
    repositoryId: scopeId(value.repositoryId),
    actorUserId: text(value.actorUserId, 128),
    at: integer(value.at, 0, Number.MAX_SAFE_INTEGER),
  };
}

export function checkVersion(current: { version: number } | null, expected: number): void {
  version(expected);
  if ((current?.version ?? 0) !== expected)
    throw new FileError(409, "File evidence version conflict.", "VERSION_CONFLICT");
}

export function assertReadable(permissions: readonly string[]): void {
  // Visibility-only access has no effective Repository permission. It must not disclose files.
  if (
    !permissions.some((p) =>
      ["read", "triage", "triage_plus", "write", "maintain", "admin"].includes(p),
    )
  )
    throw new FileError(403, "Protected File evidence requires Repository access.", "FORBIDDEN");
}

export function assertWritable(permissions: readonly string[]): void {
  if (!permissions.some((p) => p === "write" || p === "maintain" || p === "admin"))
    throw new FileError(403, "File mutation is not permitted.", "FORBIDDEN");
}
