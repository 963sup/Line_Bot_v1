import type { ContentPlanItemBasis } from "@line_bot_v1/content/domain/plan-reference";
import { normalizeQuantity, quantityUnits } from "@line_bot_v1/content/domain/quantity";
import type { ContractLineBasis } from "@line_bot_v1/contract/domain/line-reference";
import type { ResourceBasis } from "@line_bot_v1/resources/domain/resource-reference";
import { ExecutionError } from "./error.js";

export type ExecutionState = "SUBMITTED" | "ACCEPTED" | "REJECTED" | "VOIDED";
export type ExecutionAction = "submit" | "accept" | "reject" | "void";
export type ExecutionDecision =
  | Readonly<{ action: "submit"; quantity: string; note: string }>
  | Readonly<{ action: "accept" }>
  | Readonly<{ action: "reject" | "void"; reason: string }>;

export type ContentContractLineBasis = Extract<ContractLineBasis, { content: unknown }>;
type LegacyContractLineBasis = Extract<ContractLineBasis, { resource: unknown }>;
export type ExecutionDependencyBasis = Readonly<{
  version: number;
  revisionId: string | null;
  prerequisiteTaskIds: readonly string[];
}>;

type RevisionCommon = Readonly<{
  id: string;
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

type LegacyExecutionRevision = RevisionCommon & Readonly<{ basis: LegacyContractLineBasis }>;
type TaskExecutionRevision = RevisionCommon &
  Readonly<{
    basis: ContentContractLineBasis;
    task: ContentPlanItemBasis;
    resources: readonly ResourceBasis[];
    dependency: ExecutionDependencyBasis;
  }>;
export type ExecutionRevision = LegacyExecutionRevision | TaskExecutionRevision;

function copyContent(value: ContentPlanItemBasis): ContentPlanItemBasis {
  return {
    repositoryId: value.repositoryId,
    planRevisionId: value.planRevisionId,
    planVersion: value.planVersion,
    node: {
      id: value.node.id,
      kind: value.node.kind,
      title: value.node.title,
      body: value.node.body,
      path: value.node.path.map((item) => ({
        id: item.id,
        kind: item.kind,
        title: item.title,
      })),
      plannedQuantity:
        value.node.plannedQuantity === null
          ? null
          : {
              value: value.node.plannedQuantity.value,
              measure: {
                id: value.node.plannedQuantity.measure.id,
                name: value.node.plannedQuantity.measure.name,
                subject: value.node.plannedQuantity.measure.subject,
                unit: value.node.plannedQuantity.measure.unit,
              },
            },
    },
  };
}

function copyBasis(basis: ContentContractLineBasis): ContentContractLineBasis;
function copyBasis(basis: LegacyContractLineBasis): LegacyContractLineBasis;
function copyBasis(basis: ContractLineBasis): ContractLineBasis {
  const common = {
    contractId: basis.contractId,
    contractRevisionId: basis.contractRevisionId,
    lineId: basis.lineId,
    agreedQuantity: basis.agreedQuantity,
  };
  if ("content" in basis) return { ...common, content: copyContent(basis.content) };
  return {
    ...common,
    resource: {
      resourceId: basis.resource.resourceId,
      resourceRevisionId: basis.resource.resourceRevisionId,
      resourceVersion: basis.resource.resourceVersion,
      name: basis.resource.name,
      measure: {
        id: basis.resource.measure.id,
        name: basis.resource.measure.name,
        subject: basis.resource.measure.subject,
        unit: basis.resource.measure.unit,
      },
      sourceQuantity: basis.resource.sourceQuantity,
    },
  };
}

function qualifiesTask(basis: ContentContractLineBasis, task: ContentPlanItemBasis) {
  if (
    task.repositoryId !== basis.content.repositoryId ||
    task.planRevisionId !== basis.content.planRevisionId ||
    task.node.kind !== "TASK"
  )
    return false;
  return basis.content.node.kind === "TASK"
    ? basis.content.node.id === task.node.id
    : task.node.path.some(
        (ancestor) => ancestor.kind === "WORK" && ancestor.id === basis.content.node.id,
      );
}

function reviewedRevision(
  current: ExecutionRevision,
  context: Readonly<{
    id: string;
    executionId: string;
    repositoryId: string;
    actorUserId: string;
    at: number;
  }>,
  action: "accept" | "reject" | "void",
  state: "ACCEPTED" | "REJECTED" | "VOIDED",
  reason: string | null,
): ExecutionRevision {
  const common = {
    ...context,
    version: current.version + 1,
    parentRevisionId: current.id,
    action,
    state,
    quantity: current.quantity,
    note: current.note,
    reason,
  };
  if (!("task" in current)) return { ...common, basis: copyBasis(current.basis) };
  return {
    ...common,
    basis: copyBasis(current.basis),
    task: copyContent(current.task),
    resources: current.resources.map((resource) => ({ ...resource })),
    dependency: {
      version: current.dependency.version,
      revisionId: current.dependency.revisionId,
      prerequisiteTaskIds: [...current.dependency.prerequisiteTaskIds],
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
  source: Readonly<{
    basis: ContentContractLineBasis;
    task: ContentPlanItemBasis;
    resources: readonly ResourceBasis[];
    dependency: ExecutionDependencyBasis;
  }> | null,
): ExecutionRevision {
  if ((current?.version ?? 0) !== expectedVersion)
    throw new ExecutionError(409, "Execution version conflict.", "CONFLICT");
  if (decision.action === "submit" ? current !== null : current === null)
    throw new ExecutionError(409, "Execution lifecycle conflict.", "CONFLICT");

  if (decision.action === "submit") {
    if (!source)
      throw new ExecutionError(400, "Execution submission source is required.", "INVALID_INPUT");
    if (decision.note.length > 2000)
      throw new ExecutionError(400, "Execution note is too long.", "INVALID_INPUT");
    if (
      source.task.repositoryId !== context.repositoryId ||
      !qualifiesTask(source.basis, source.task) ||
      source.task.node.plannedQuantity === null
    )
      throw new ExecutionError(409, "Execution Task is outside the Contract line.", "CONFLICT");
    if (
      !Number.isSafeInteger(source.dependency.version) ||
      source.dependency.version < 0 ||
      (source.dependency.version === 0) !== (source.dependency.revisionId === null) ||
      new Set(source.dependency.prerequisiteTaskIds).size !==
        source.dependency.prerequisiteTaskIds.length ||
      source.dependency.prerequisiteTaskIds.includes(source.task.node.id)
    )
      throw new ExecutionError(409, "Execution dependency evidence is invalid.", "CONFLICT");
    let quantity: string;
    try {
      const unit = source.task.node.plannedQuantity.measure.unit;
      quantity = normalizeQuantity(decision.quantity, unit);
      if (quantityUnits(quantity) <= 0n) throw new Error("non-positive");
    } catch {
      throw new ExecutionError(400, "Invalid Execution quantity.", "INVALID_INPUT");
    }
    return {
      ...context,
      version: 1,
      parentRevisionId: null,
      action: "submit",
      state: "SUBMITTED",
      basis: copyBasis(source.basis),
      task: copyContent(source.task),
      resources: source.resources.map((resource) => ({ ...resource })),
      dependency: {
        version: source.dependency.version,
        revisionId: source.dependency.revisionId,
        prerequisiteTaskIds: [...source.dependency.prerequisiteTaskIds],
      },
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
    return reviewedRevision(
      current,
      context,
      decision.action,
      decision.action === "accept" ? "ACCEPTED" : "REJECTED",
      decision.action === "reject" ? reason : null,
    );
  }
  if (current.state === "ACCEPTED" && decision.action === "void") {
    return reviewedRevision(current, context, "void", "VOIDED", reason);
  }
  throw new ExecutionError(409, "Execution transition is not allowed.", "CONFLICT");
}
