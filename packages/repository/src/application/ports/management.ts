import type { RepositorySelector } from "../../contracts/selectors.js";
import type { RepositoryPermission } from "../../domain.js";

export type RepositoryVisibility = "private" | "internal" | "public";

export type RepositoryManagementSnapshot = Readonly<{
  repository: {
    id: string;
    actorUserId: string;
    ownerAccountId: string;
    ownerKind: "USER" | "ORGANIZATION";
    ownerLogin: string;
    name: string;
    visibility: RepositoryVisibility;
    archived: boolean;
    version: number;
    actorPermissions: readonly RepositoryPermission[];
    internalEnterpriseId: string | null;
  };
}>;

type RepositoryManagementCommandBase = Readonly<{
  requestId: string;
  repositoryId: string;
  expectedVersion: number;
}>;

export type RepositoryManagementCommand =
  | (RepositoryManagementCommandBase & {
      action: "rename";
      name: string;
    })
  | (RepositoryManagementCommandBase & {
      action: "visibility";
      visibility: RepositoryVisibility;
    })
  | (RepositoryManagementCommandBase & {
      action: "archive" | "unarchive";
    });

export type RepositoryManagementReceipt = Readonly<{
  requestId: string;
  repositoryId: string;
  action: RepositoryManagementCommand["action"];
  name: string;
  visibility: RepositoryVisibility;
  archived: boolean;
  version: number;
  at: number;
}>;

export interface RepositoryManagementStore {
  view(userId: string, selector: RepositorySelector): Promise<RepositoryManagementSnapshot>;
  execute(
    userId: string,
    command: RepositoryManagementCommand,
    now: number,
  ): Promise<RepositoryManagementReceipt>;
}
