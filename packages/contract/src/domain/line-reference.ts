import type { ContractPlanItemReference } from "./contract.js";

export type ContractLineBasis = Readonly<{
  contractId: string;
  contractRevisionId: string;
  lineId: string;
  content: ContractPlanItemReference;
  agreedQuantity: string;
}>;
