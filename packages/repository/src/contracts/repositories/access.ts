import type { RepositorySelector } from "../../contracts/selectors.js";
import type { RepositoryPermission } from "../../domain.js";

export type RepositoryAccessSubjectKind = "USER" | "TEAM";

type RepositoryDirectUserGrant = Readonly<{
  userId: string;
  capability: RepositoryPermission;
  version: number;
  isOutsideCollaborator: boolean;
}>;

type RepositoryTeamGrant = Readonly<{
  teamId: string;
  capability: RepositoryPermission;
  version: number;
}>;

export type RepositoryAccessSnapshot = Readonly<{
  repository: {
    id: string;
    ownerAccountId: string;
    ownerKind: "USER" | "ORGANIZATION";
    ownerLogin: string;
    name: string;
    actorPermissions: readonly RepositoryPermission[];
  };
  directUserGrants: readonly RepositoryDirectUserGrant[];
  teamGrants: readonly RepositoryTeamGrant[];
}>;

type RepositoryAccessCommandBase = Readonly<{
  requestId: string;
  repositoryId: string;
  subjectKind: RepositoryAccessSubjectKind;
  subjectId: string;
  expectedVersion: number;
}>;

export type RepositoryAccessCommand =
  | (RepositoryAccessCommandBase & {
      action: "grant";
      capability: RepositoryPermission;
    })
  | (RepositoryAccessCommandBase & {
      action: "revoke";
    });

export type RepositoryAccessReceipt = Readonly<{
  requestId: string;
  repositoryId: string;
  subjectKind: RepositoryAccessSubjectKind;
  subjectId: string;
  capability: RepositoryPermission | null;
  version: number | null;
  at: number;
}>;

export interface RepositoryAccessStore {
  view(userId: string, selector: RepositorySelector): Promise<RepositoryAccessSnapshot>;
  execute(
    userId: string,
    command: RepositoryAccessCommand,
    now: number,
  ): Promise<RepositoryAccessReceipt>;
}
