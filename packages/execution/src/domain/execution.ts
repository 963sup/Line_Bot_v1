import type { ContractLineBasis } from "@line_bot_v1/contract/contracts/output/references";
import { normalizeQuantity, quantityUnits } from "@line_bot_v1/resources/domain/quantity";
import { ExecutionError } from "./error.js";

export type ExecutionState = "SUBMITTED" | "ACCEPTED" | "REJECTED" | "VOIDED";
export type ExecutionAction = "submit" | "accept" | "reject" | "void";
export type ExecutionDecision =
  | Readonly<{ action: "submit"; quantity: string; note: string }>
  | Readonly<{ action: "accept" }>
  | Readonly<{ action: "reject" | "void"; reason: string }>;

export type ExecutionRevision = Readonly<{
  id: string;
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

function copyBasis(basis: ContractLineBasis): ContractLineBasis {
  return {
    contractId: basis.contractId,
    contractRevisionId: basis.contractRevisionId,
    lineId: basis.lineId,
    agreedQuantity: basis.agreedQuantity,
    resource: {
      resourceId: basis.resource.resourceId,
      resourceRevisionId: basis.resource.resourceRevisionId,
      resourceVersion: basis.resource.resourceVersion,
      name: basis.resource.name,
      measure: { ...basis.resource.measure },
      sourceQuantity: basis.resource.sourceQuantity,
    },
  };
}

export function reviseExecution(
  current: ExecutionRevision | null,
  expectedVersion: number,
  decision: ExecutionDecision,
  context: Readonly<{
    id: string;
    executionId: string;
    repositoryId: string;
    actorUserId: string;
    at: number;
  }>,
  source: ContractLineBasis,
): ExecutionRevision {
  if ((current?.version ?? 0) !== expectedVersion)
    throw new ExecutionError(409, "Execution version conflict.", "CONFLICT");
  if (decision.action === "submit" ? current !== null : current === null)
    throw new ExecutionError(409, "Execution lifecycle conflict.", "CONFLICT");

  if (decision.action === "submit") {
    if (decision.note.length > 2000)
      throw new ExecutionError(400, "Execution note is too long.", "INVALID_INPUT");
    let quantity: string;
    try {
      quantity = normalizeQuantity(decision.quantity, source.resource.measure.unit);
    } catch {
      throw new ExecutionError(400, "Invalid Execution quantity.", "INVALID_INPUT");
    }
    if (quantityUnits(quantity) <= 0n)
      throw new ExecutionError(400, "Execution quantity must be positive.", "INVALID_INPUT");
    return {
      ...context,
      version: 1,
      parentRevisionId: null,
      action: "submit",
      state: "SUBMITTED",
      basis: copyBasis(source),
      quantity,
      note: decision.note,
      reason: null,
    };
  }

  if (!current) throw new ExecutionError(409, "Execution lifecycle conflict.", "CONFLICT");
  let reason: string | null = null;
  if (decision.action === "reject" || decision.action === "void") {
    reason = decision.reason.trim();
    if (reason.length === 0 || reason.length > 2000)
      throw new ExecutionError(400, "Execution reason is invalid.", "INVALID_INPUT");
  }

  if (current.state === "SUBMITTED" && decision.action !== "void") {
    return {
      ...context,
      version: current.version + 1,
      parentRevisionId: current.id,
      action: decision.action,
      state: decision.action === "accept" ? "ACCEPTED" : "REJECTED",
      basis: copyBasis(current.basis),
      quantity: current.quantity,
      note: current.note,
      reason: decision.action === "reject" ? reason : null,
    };
  }
  if (current.state === "ACCEPTED" && decision.action === "void") {
    return {
      ...context,
      version: current.version + 1,
      parentRevisionId: current.id,
      action: "void",
      state: "VOIDED",
      basis: copyBasis(current.basis),
      quantity: current.quantity,
      note: current.note,
      reason,
    };
  }
  throw new ExecutionError(409, "Execution transition is not allowed.", "CONFLICT");
}
