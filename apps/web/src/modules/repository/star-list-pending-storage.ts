import type { RepositoryStarListCreateCommand } from "@line-work/repository/application/ports/star-lists";

export type RepositoryStarListCommandBody =
  | Readonly<{
      requestId: string;
      action: "update";
      expectedVersion: number;
      name: string;
      description: string;
    }>
  | Readonly<{
      requestId: string;
      action: "publish" | "unpublish" | "delete";
      expectedVersion: number;
    }>
  | Readonly<{
      requestId: string;
      action: "add" | "remove";
      expectedVersion: number;
      repositoryId: string;
    }>;

const createPrefix = "repository-star-list-create-pending:v2:";
const commandPrefix = "repository-star-list-command-pending:v2:";

function scopedSubject(value: string): string {
  if (!value) throw new Error("Repository Star List retry scope is missing.");
  return encodeURIComponent(value);
}

function createKey(subject: string) {
  return `${createPrefix}${scopedSubject(subject)}`;
}

function commandKey(subject: string, listId: string) {
  return `${commandPrefix}${scopedSubject(subject)}:${encodeURIComponent(listId)}`;
}

function validCreate(value: unknown): value is RepositoryStarListCreateCommand {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const command = value as Record<string, unknown>;
  return (
    typeof command.requestId === "string" &&
    typeof command.name === "string" &&
    typeof command.description === "string"
  );
}

function validCommand(value: unknown): value is RepositoryStarListCommandBody {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const command = value as Record<string, unknown>;
  if (
    typeof command.requestId !== "string" ||
    !Number.isSafeInteger(command.expectedVersion) ||
    Number(command.expectedVersion) < 1
  ) {
    return false;
  }
  if (command.action === "update") {
    return typeof command.name === "string" && typeof command.description === "string";
  }
  if (command.action === "add" || command.action === "remove") {
    return typeof command.repositoryId === "string";
  }
  return (
    command.action === "publish" ||
    command.action === "unpublish" ||
    command.action === "delete"
  );
}

export function readPendingRepositoryStarListCreate(
  storage: Storage,
  subject: string,
): RepositoryStarListCreateCommand | null {
  const key = createKey(subject);
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!validCreate(value)) {
      storage.removeItem(key);
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

export function writePendingRepositoryStarListCreate(
  storage: Storage,
  subject: string,
  command: RepositoryStarListCreateCommand,
): void {
  storage.setItem(createKey(subject), JSON.stringify(command));
}

export function clearPendingRepositoryStarListCreate(
  storage: Storage,
  subject: string,
  requestId: string,
): boolean {
  const key = createKey(subject);
  const stored = readPendingRepositoryStarListCreate(storage, subject);
  if (stored?.requestId !== requestId) return false;
  storage.removeItem(key);
  return true;
}

export function readPendingRepositoryStarListCommand(
  storage: Storage,
  subject: string,
  listId: string,
): RepositoryStarListCommandBody | null {
  const key = commandKey(subject, listId);
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!validCommand(value)) {
      storage.removeItem(key);
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

export function writePendingRepositoryStarListCommand(
  storage: Storage,
  subject: string,
  listId: string,
  command: RepositoryStarListCommandBody,
): void {
  storage.setItem(commandKey(subject, listId), JSON.stringify(command));
}

export function clearPendingRepositoryStarListCommand(
  storage: Storage,
  subject: string,
  listId: string,
  requestId: string,
): boolean {
  const key = commandKey(subject, listId);
  const stored = readPendingRepositoryStarListCommand(storage, subject, listId);
  if (stored?.requestId !== requestId) return false;
  storage.removeItem(key);
  return true;
}
