import type { WbsDifference } from "../../domain/governance.js";
export type ProjectWbsMetrics = Readonly<{
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
export interface ProjectWbsMetricsQuery {
  read(userId: string, projectId: string): Promise<ProjectWbsMetrics>;
}
