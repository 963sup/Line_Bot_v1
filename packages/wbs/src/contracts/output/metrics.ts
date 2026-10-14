import type { WbsDifference } from "../../domain/governance.js";
export type WbsMetrics = Readonly<{
  initialized: boolean;
  pendingProposals: number;
  baseline: Readonly<{
    id: string;
    revisionId: string;
    number: number;
    publishedAt: number;
  }> | null;
  draftRevisionId: string | null;
  differences: readonly WbsDifference[] | null;
}>;
export interface WbsMetricsQuery {
  read(userId: string, repositoryId: string): Promise<WbsMetrics>;
}
