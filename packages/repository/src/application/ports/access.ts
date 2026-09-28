import type { RepositoryCapability } from "../../domain.js";
import type { RepositorySelector } from "./selectors.js";

export type RepositoryAccessSubjectKind = "USER" | "TEAM";

export type RepositoryDirectUserGrant = Readonly<{
  userId: string;
  capability: RepositoryCapability;
  version: number;
}>;

export type RepositoryTeamGrant = Readonly<{
  teamId: string;
  capability: RepositoryCapability;
  version: number;
}>;

export type RepositoryAccessSnapshot = Readonly<{
  repository: {
    id: string;
    ownerAccountId: string;
    ownerKind: "USER" | "ORGANIZATION";
    ownerLogin: string;
    name: string;
    actorCapability: RepositoryCapability | null;
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
      capability: RepositoryCapability;
    })
  | (RepositoryAccessCommandBase & {
      action: "revoke";
    });

export type RepositoryAccessReceipt = Readonly<{
  requestId: string;
  repositoryId: string;
  subjectKind: RepositoryAccessSubjectKind;
  subjectId: string;
  capability: RepositoryCapability | null;
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
