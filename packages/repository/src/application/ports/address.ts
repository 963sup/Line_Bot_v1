import type { RepositorySelector } from "../../contracts/selectors.js";
import type { RepositoryAddress, RepositoryCapability } from "../../domain.js";

export type RepositoryAddressSnapshot = Readonly<{
  repository: {
    id: string;
    actorUserId: string;
    ownerLogin: string;
    name: string;
    version: number;
    actorCapability: RepositoryCapability;
  };
  address: RepositoryAddress | null;
}>;

export type RepositoryAddressCommand = Readonly<{
  action: "set" | "remove";
  requestId: string;
  repositoryId: string;
  expectedVersion: number;
  address?: RepositoryAddress;
}>;

export type RepositoryAddressReceipt = Readonly<{
  requestId: string;
  repositoryId: string;
  address: RepositoryAddress | null;
  version: number;
  at: number;
}>;

export interface RepositoryAddressStore {
  view(userId: string, selector: RepositorySelector): Promise<RepositoryAddressSnapshot>;
  execute(
    userId: string,
    command: RepositoryAddressCommand,
    now: number,
  ): Promise<RepositoryAddressReceipt>;
}
