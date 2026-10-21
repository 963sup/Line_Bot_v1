import type { ResourceBasis } from "../../domain/resource-reference.js";

export type ResourceReference = Readonly<{
  resourceId: string;
  resourceRevisionId: string;
}>;

export interface ResourceReferenceReader {
  verifyPinned(
    userId: string,
    repositoryId: string,
    references: readonly ResourceReference[],
    policy: Readonly<{ allowArchived: boolean }>,
  ): Promise<readonly ResourceBasis[]>;
}
