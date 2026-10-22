import type { ContentPlanItemBasis } from "@line_bot_v1/content/domain/plan-reference";

export type ContractLineBasis = Readonly<{
  contractId: string;
  contractRevisionId: string;
  lineId: string;
  content: ContentPlanItemBasis;
  agreedQuantity: string;
}>;
