import type { ContentPlanItemBasis } from "@line_bot_v1/content/domain/plan-reference";
import type { ResourceQuantityBasis } from "@line_bot_v1/resources/domain/engineering-reference";

export type ContractLineBasis =
  | Readonly<{
      contractId: string;
      contractRevisionId: string;
      lineId: string;
      content: ContentPlanItemBasis;
      agreedQuantity: string;
    }>
  | Readonly<{
      contractId: string;
      contractRevisionId: string;
      lineId: string;
      resource: ResourceQuantityBasis;
      agreedQuantity: string;
    }>;
