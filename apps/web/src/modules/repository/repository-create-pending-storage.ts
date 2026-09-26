import type { RepositoryCreateCommand } from "@line-work/repository/application/ports/creation";

const key = "repository-create-pending:v1";

function valid(value: unknown): value is RepositoryCreateCommand {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const command = value as Record<string, unknown>;
  return (
    typeof command.requestId === "string" &&
    typeof command.ownerAccountId === "string" &&
    (command.ownerKind === "USER" || command.ownerKind === "ORGANIZATION") &&
    typeof command.name === "string"
  );
}

export function readPendingRepositoryCreate(storage: Storage): RepositoryCreateCommand | null {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!valid(value)) {
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
