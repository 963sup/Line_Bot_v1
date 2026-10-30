export type RepositoryStarListVisibility = "private" | "public";

export type RepositoryStarListSummary = Readonly<{
  id: string;
  ownerLogin: string;
  name: string;
  description: string;
  visibility: RepositoryStarListVisibility;
  version: number;
  visibleRepositoryCount: number;
  createdAt: number;
  updatedAt: number;
}>;

export type RepositoryStarListRepository = Readonly<{
  id: string;
  ownerLogin: string;
  name: string;
  visibility: string;
}>;

export type RepositoryStarListDetail = RepositoryStarListSummary &
  Readonly<{
    editable: boolean;
    repositories: RepositoryStarListRepository[];
  }>;

export type RepositoryStarListCreateCommand = Readonly<{
  requestId: string;
  name: string;
  description: string;
}>;

type VersionedListCommand = Readonly<{
  requestId: string;
  listId: string;
  expectedVersion: number;
}>;

export type RepositoryStarListCommand = VersionedListCommand &
  (
    | Readonly<{ action: "update"; name: string; description: string }>
    | Readonly<{ action: "publish" | "unpublish" | "delete" }>
    | Readonly<{ action: "add" | "remove"; repositoryId: string }>
  );

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

function commandRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) result[key] = item;
  return result;
}

export function isRepositoryStarListCreateCommand(
  value: unknown,
): value is RepositoryStarListCreateCommand {
  const command = commandRecord(value);
  return (
    command !== null &&
    typeof command.requestId === "string" &&
    typeof command.name === "string" &&
    typeof command.description === "string"
  );
}

export function isRepositoryStarListCommandBody(
  value: unknown,
): value is RepositoryStarListCommandBody {
  const command = commandRecord(value);
  if (
    command === null ||
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
    command.action === "publish" || command.action === "unpublish" || command.action === "delete"
  );
}

export type RepositoryStarListMutationResult = Readonly<{
  id: string;
  version: number;
  visibility: RepositoryStarListVisibility;
  deleted: boolean;
}>;

export interface RepositoryStarListStore {
  mine(userId: string): Promise<RepositoryStarListSummary[]>;
  detail(userId: string, listId: string): Promise<RepositoryStarListDetail>;
  create(
    userId: string,
    command: RepositoryStarListCreateCommand,
    at: number,
  ): Promise<RepositoryStarListMutationResult>;
  execute(
    userId: string,
    command: RepositoryStarListCommand,
    at: number,
  ): Promise<RepositoryStarListMutationResult>;
}
