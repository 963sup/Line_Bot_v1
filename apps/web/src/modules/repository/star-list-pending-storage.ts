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

const createKey = "repository-star-list-create-pending:v1";
const commandPrefix = "repository-star-list-command-pending:v1:";

function commandKey(listId: string) {
  return `${commandPrefix}${listId}`;
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
): RepositoryStarListCreateCommand | null {
  try {
    const raw = storage.getItem(createKey);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!validCreate(value)) {
      storage.removeItem(createKey);
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

export function writePendingRepositoryStarListCreate(
  storage: Storage,
  command: RepositoryStarListCreateCommand,
): void {
  storage.setItem(createKey, JSON.stringify(command));
}

export function clearPendingRepositoryStarListCreate(storage: Storage): void {
  storage.removeItem(createKey);
}

export function readPendingRepositoryStarListCommand(
  storage: Storage,
  listId: string,
): RepositoryStarListCommandBody | null {
  try {
    const raw = storage.getItem(commandKey(listId));
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!validCommand(value)) {
      storage.removeItem(commandKey(listId));
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

export function writePendingRepositoryStarListCommand(
  storage: Storage,
  listId: string,
  command: RepositoryStarListCommandBody,
): void {
  storage.setItem(commandKey(listId), JSON.stringify(command));
}

export function clearPendingRepositoryStarListCommand(storage: Storage, listId: string): void {
  storage.removeItem(commandKey(listId));
}
