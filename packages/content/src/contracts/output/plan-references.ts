import type { ContentPlanItemBasis } from "../../domain/plan-reference.js";

type ContentPlanItemReference = Readonly<{
  planRevisionId: string;
  nodeId: string;
}>;

export interface ContentPlanReferenceReader {
  verifyRevision(userId: string, repositoryId: string, planRevisionId: string): Promise<void>;
  verifyPinned(
    userId: string,
    repositoryId: string,
    references: readonly ContentPlanItemReference[],
  ): Promise<readonly ContentPlanItemBasis[]>;
}
