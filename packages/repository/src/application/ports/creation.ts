export type RepositoryOwnerKind = "USER" | "ORGANIZATION";

export type RepositoryOwnerOption = Readonly<{
  id: string;
  kind: RepositoryOwnerKind;
  login: string;
}>;

export type RepositoryCreateCommand = Readonly<{
  requestId: string;
  ownerAccountId: string;
  ownerKind: RepositoryOwnerKind;
  name: string;
}>;

export type RepositoryCreationResult = Readonly<{
  id: string;
  ownerAccountId: string;
  ownerKind: RepositoryOwnerKind;
  ownerLogin: string;
  name: string;
  visibility: "private";
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
