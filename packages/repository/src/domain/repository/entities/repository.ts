import type { RepositoryPermission } from "../value-objects/repository-capability.js";

export type RepositoryAddress = Readonly<{
  address: string;
  latitude: number;
  longitude: number;
  radius: number;
}>;

export type RepositorySummary = {
  id: string;
  ownerLogin: string;
  name: string;
  permissions: readonly RepositoryPermission[];
};
