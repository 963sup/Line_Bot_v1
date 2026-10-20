import type { ContractLineBasis } from "@line_bot_v1/contract/contracts/output/references";
import type { ExecutionAction, ExecutionState } from "../../domain/execution.js";

export type ExecutionRevisionDto = Readonly<{
  revisionId: string;
  executionId: string;
  repositoryId: string;
  version: number;
  parentRevisionId: string | null;
  actorUserId: string;
  at: number;
  action: ExecutionAction;
  state: ExecutionState;
  basis: ContractLineBasis;
  quantity: string;
  note: string;
  reason: string | null;
}>;
export type ExecutionReceipt = Readonly<{ requestId: string; revision: ExecutionRevisionDto }>;
export type ExecutionSummary = Readonly<{
  executionId: string;
  contractId: string;
  contractRevisionId: string;
  lineId: string;
  version: number;
  state: ExecutionState;
  quantity: string;
  updatedAt: number;
}>;
