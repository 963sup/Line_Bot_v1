import type { ContentPlanItemBasis } from "@line_bot_v1/content/domain/plan-reference";
import type { ContractLineBasis } from "@line_bot_v1/contract/domain/line-reference";
import type { ResourceBasis } from "@line_bot_v1/resources/domain/resource-reference";
import type {
  ExecutionAction,
  ExecutionDependencyBasis,
  ExecutionState,
} from "../../domain/execution.js";

type ExecutionRevisionDtoCommon = Readonly<{
  revisionId: string;
  executionId: string;
  repositoryId: string;
  version: number;
  parentRevisionId: string | null;
  actorUserId: string;
  at: number;
  action: ExecutionAction;
  state: ExecutionState;
  quantity: string;
  note: string;
  reason: string | null;
}>;
export type ExecutionRevisionDto = ExecutionRevisionDtoCommon &
  Readonly<{
    basis: ContractLineBasis;
    task: ContentPlanItemBasis;
    resources: readonly ResourceBasis[];
    dependency: ExecutionDependencyBasis;
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
