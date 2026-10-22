import type { RepositoryCreateCommand } from "@line_bot_v1/repository/contracts/input/repository-creation";

const key = "repository-create-pending:v1";

function normalize(value: unknown): RepositoryCreateCommand | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const visibility = "visibility" in value ? value.visibility : "private";
  if (
    !("requestId" in value) ||
    typeof value.requestId !== "string" ||
    !("ownerAccountId" in value) ||
    typeof value.ownerAccountId !== "string" ||
    !("ownerKind" in value) ||
    (value.ownerKind !== "USER" && value.ownerKind !== "ORGANIZATION") ||
    !("name" in value) ||
    typeof value.name !== "string" ||
    (visibility !== "private" && visibility !== "internal" && visibility !== "public")
  ) {
    return null;
  }
  return {
    requestId: value.requestId,
    ownerAccountId: value.ownerAccountId,
    ownerKind: value.ownerKind,
    name: value.name,
    visibility,
  };
}

export function readPendingRepositoryCreate(storage: Storage): RepositoryCreateCommand | null {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const value = normalize(JSON.parse(raw));
    if (!value) {
      storage.removeItem(key);
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

export function writePendingRepositoryCreate(
  storage: Storage,
  command: RepositoryCreateCommand,
): void {
  storage.setItem(key, JSON.stringify(command));
}

export function clearPendingRepositoryCreate(storage: Storage): void {
  storage.removeItem(key);
}
