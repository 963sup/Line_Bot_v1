import type { ContentMeasure, ContentNodeKind } from "./plan.js";

export type ContentPlanItemBasis = Readonly<{
  repositoryId: string;
  planRevisionId: string;
  planVersion: number;
  node: Readonly<{
    id: string;
    kind: "WORK" | "TASK";
    title: string;
    body: string;
    path: readonly Readonly<{ id: string; kind: ContentNodeKind; title: string }>[];
    plannedQuantity: Readonly<{ value: string; measure: ContentMeasure }> | null;
  }>;
}>;
