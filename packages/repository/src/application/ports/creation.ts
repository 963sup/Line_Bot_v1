import type { RepositoryVisibility } from "../../domain.js";

export type RepositoryOwnerKind = "USER" | "ORGANIZATION";

export type RepositoryOwnerOption = Readonly<{
  id: string;
  kind: RepositoryOwnerKind;
  login: string;
  internalEligible: boolean;
}>;

export type RepositoryCreateCommand = Readonly<{
  requestId: string;
  ownerAccountId: string;
  ownerKind: RepositoryOwnerKind;
  name: string;
  visibility: RepositoryVisibility;
}>;

export type RepositoryCreationResult = Readonly<{
  id: string;
  ownerAccountId: string;
  ownerKind: RepositoryOwnerKind;
  ownerLogin: string;
  name: string;
  visibility: RepositoryVisibility;
  version: number;
}>;

export interface RepositoryCreationStore {
  owners(userId: string): Promise<readonly RepositoryOwnerOption[]>;
  create(
    userId: string,
    command: RepositoryCreateCommand,
    now: number,
  ): Promise<RepositoryCreationResult>;
}
