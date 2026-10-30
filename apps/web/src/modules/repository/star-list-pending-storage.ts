import {
  isRepositoryStarListCommandBody,
  isRepositoryStarListCreateCommand,
  type RepositoryStarListCommandBody,
  type RepositoryStarListCreateCommand,
} from "@line_bot_v1/repository/contracts/repositories/star-lists";

export type { RepositoryStarListCommandBody } from "@line_bot_v1/repository/contracts/repositories/star-lists";

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

export function readPendingRepositoryStarListCreate(
  storage: Storage,
  subject: string,
): RepositoryStarListCreateCommand | null {
  const key = createKey(subject);
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!isRepositoryStarListCreateCommand(value)) {
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
    if (!isRepositoryStarListCommandBody(value)) {
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
