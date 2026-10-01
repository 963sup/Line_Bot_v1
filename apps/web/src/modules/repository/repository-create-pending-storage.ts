import type { RepositoryCreateCommand } from "@line_bot_v1/repository/application/ports/creation";

const key = "repository-create-pending:v1";

function normalize(value: unknown): RepositoryCreateCommand | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const command = value as Record<string, unknown>;
  const visibility = command.visibility ?? "private";
  if (
    typeof command.requestId !== "string" ||
    typeof command.ownerAccountId !== "string" ||
    (command.ownerKind !== "USER" && command.ownerKind !== "ORGANIZATION") ||
    typeof command.name !== "string" ||
    (visibility !== "private" && visibility !== "internal" && visibility !== "public")
  ) {
    return null;
  }
  return {
    requestId: command.requestId,
    ownerAccountId: command.ownerAccountId,
    ownerKind: command.ownerKind,
    name: command.name,
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
