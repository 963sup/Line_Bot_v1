import type { RepositoryCapability } from "../value-objects/repository-capability.js";

export type RepositorySummary = {
  id: string;
  ownerLogin: string;
  name: string;
  capability: RepositoryCapability;
};
