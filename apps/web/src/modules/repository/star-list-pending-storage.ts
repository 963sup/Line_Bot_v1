import type { RepositoryStarListCreateCommand } from "@line_bot_v1/repository/contracts/repositories/star-lists";

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
  return (
    "requestId" in value &&
    typeof value.requestId === "string" &&
    "name" in value &&
    typeof value.name === "string" &&
    "description" in value &&
    typeof value.description === "string"
  );
}

function validCommand(value: unknown): value is RepositoryStarListCommandBody {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (
    !("requestId" in value) ||
    typeof value.requestId !== "string" ||
    !("expectedVersion" in value) ||
    !Number.isSafeInteger(value.expectedVersion) ||
    Number(value.expectedVersion) < 1 ||
    !("action" in value)
  ) {
    return false;
  }
  if (value.action === "update") {
    return (
      "name" in value &&
      typeof value.name === "string" &&
      "description" in value &&
      typeof value.description === "string"
    );
  }
  if (value.action === "add" || value.action === "remove") {
    return "repositoryId" in value && typeof value.repositoryId === "string";
  }
  return value.action === "publish" || value.action === "unpublish" || value.action === "delete";
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
