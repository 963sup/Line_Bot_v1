import type { ContentPlanItemBasis } from "@line_bot_v1/content/domain/plan-reference";
import { normalizeQuantity } from "@line_bot_v1/content/domain/quantity";
import { normalizeContent } from "@line_bot_v1/platform/text";
import type { ResourceQuantityBasis } from "@line_bot_v1/resources/domain/engineering-reference";
import { ContractError } from "./error.js";

type ContractState = "DRAFT" | "ACTIVE" | "CLOSED";
export type ContractAction = "create" | "edit" | "activate" | "close";

export type ContractLineInput = Readonly<{
  lineId: string;
  planRevisionId: string;
  nodeId: string;
  agreedQuantity: string;
}>;

export type ContentContractLine = Readonly<{
  lineId: string;
  content: ContentPlanItemBasis;
  agreedQuantity: string;
}>;

/** Historical snapshot only. New commands cannot create this shape. */
export type HistoricalResourceContractLine = Readonly<{
  lineId: string;
  resource: ResourceQuantityBasis;
  agreedQuantity: string;
}>;

export type FrozenContractLine = ContentContractLine | HistoricalResourceContractLine;

export type ContractRevision = Readonly<{
  id: string;
  contractId: string;
  repositoryId: string;
  version: number;
  parentRevisionId: string | null;
  actorUserId: string;
  at: number;
  action: ContractAction;
  state: ContractState;
  title: string;
  body: string;
  lines: readonly FrozenContractLine[];
}>;

export type ContractEdit =
  | Readonly<{
      action: "create" | "edit";
      title: string;
      body: string;
      lines: readonly ContentContractLine[];
    }>
  | Readonly<{ action: "activate"; lines: readonly ContentContractLine[] }>
  | Readonly<{ action: "close" }>;

function copyResource(resource: ResourceQuantityBasis): ResourceQuantityBasis {
  return {
    resourceId: resource.resourceId,
    resourceRevisionId: resource.resourceRevisionId,
    resourceVersion: resource.resourceVersion,
    name: resource.name,
    measure: {
      id: resource.measure.id,
      name: resource.measure.name,
      subject: resource.measure.subject,
      unit: resource.measure.unit,
    },
    sourceQuantity: resource.sourceQuantity,
  };
}

function copyContent(content: ContentPlanItemBasis): ContentPlanItemBasis {
  return {
    repositoryId: content.repositoryId,
    planRevisionId: content.planRevisionId,
    planVersion: content.planVersion,
    node: {
      id: content.node.id,
      kind: content.node.kind,
      title: content.node.title,
      body: content.node.body,
      path: content.node.path.map((item) => ({
        id: item.id,
        kind: item.kind,
        title: item.title,
      })),
      plannedQuantity:
        content.node.plannedQuantity === null
          ? null
          : {
              value: content.node.plannedQuantity.value,
              measure: {
                id: content.node.plannedQuantity.measure.id,
                name: content.node.plannedQuantity.measure.name,
                subject: content.node.plannedQuantity.measure.subject,
                unit: content.node.plannedQuantity.measure.unit,
              },
            },
    },
  };
}

export function copyContractLines(lines: readonly FrozenContractLine[]): FrozenContractLine[] {
  return lines.map((line) =>
    "content" in line
      ? {
          lineId: line.lineId,
          content: copyContent(line.content),
          agreedQuantity: line.agreedQuantity,
        }
      : {
          lineId: line.lineId,
          resource: copyResource(line.resource),
          agreedQuantity: line.agreedQuantity,
        },
  );
}

export function assertContractTransition(
  current: ContractRevision | null,
  expectedVersion: number,
  action: ContractAction,
): void {
  if ((current?.version ?? 0) !== expectedVersion)
    throw new ContractError(409, "Contract version conflict.", "VERSION_CONFLICT");
  if (action === "create" ? current !== null : current === null)
    throw new ContractError(409, "Contract lifecycle conflict.", "LIFECYCLE_CONFLICT");
  if ((action === "edit" || action === "activate") && current?.state !== "DRAFT")
    throw new ContractError(
      409,
      "Only a draft Contract can be changed or activated.",
      "LIFECYCLE_CONFLICT",
    );
  if (action === "close" && current?.state !== "ACTIVE")
    throw new ContractError(409, "Only an active Contract can be closed.", "LIFECYCLE_CONFLICT");
}

export function freezeContractLines(
  inputs: readonly ContractLineInput[],
  contentItems: readonly ContentPlanItemBasis[],
): ContentContractLine[] {
  if (inputs.length < 1 || inputs.length > 100 || contentItems.length !== inputs.length)
    throw new ContractError(400, "Contract must contain 1 to 100 lines.", "INVALID_INPUT");
  return normalizeContentLines(
    inputs.map((input, index) => {
      const content = contentItems[index];
      if (
        !content ||
        content.planRevisionId !== input.planRevisionId ||
        content.node.id !== input.nodeId
      )
        throw new ContractError(
          503,
          "Contract Content qualification is incomplete.",
          "UNAVAILABLE",
        );
      return {
        lineId: input.lineId,
        content: copyContent(content),
        agreedQuantity: input.agreedQuantity,
      };
    }),
  );
}

function normalizeContentLines(
  lines: readonly ContentContractLine[],
  repositoryId?: string,
): ContentContractLine[] {
  if (lines.length < 1 || lines.length > 100)
    throw new ContractError(400, "Contract must contain 1 to 100 lines.", "INVALID_INPUT");
  const seen = new Set<string>();
  return lines.map((line) => {
    if (seen.has(line.lineId))
      throw new ContractError(400, "Contract line identifiers must be unique.", "INVALID_INPUT");
    seen.add(line.lineId);
    if (
      (repositoryId !== undefined && line.content.repositoryId !== repositoryId) ||
      line.content.node.plannedQuantity === null
    )
      throw new ContractError(409, "Contract Content plan item is not eligible.", "SOURCE_INVALID");
    let agreedQuantity: string;
    try {
      agreedQuantity = normalizeQuantity(
        line.agreedQuantity,
        line.content.node.plannedQuantity.measure.unit,
      );
      if (agreedQuantity === "0") throw new Error("non-positive");
    } catch {
      throw new ContractError(400, "Contract agreed quantity must be positive.", "INVALID_INPUT");
    }
    return { lineId: line.lineId, content: copyContent(line.content), agreedQuantity };
  });
}

function normalizedTerms(title: string, body: string) {
  const normalized = normalizeContent({ title, body });
  if (!normalized.ok)
    throw new ContractError(400, "Invalid Contract title or content size.", "INVALID_INPUT");
  return normalized.value;
}

export function reviseContract(
  current: ContractRevision | null,
  expectedVersion: number,
  edit: ContractEdit,
  context: Readonly<{
    id: string;
    contractId: string;
    repositoryId: string;
    actorUserId: string;
    at: number;
  }>,
): ContractRevision {
  assertContractTransition(current, expectedVersion, edit.action);
  let title = current?.title ?? "";
  let body = current?.body ?? "";
  let lines = copyContractLines(current?.lines ?? []);
  let state: ContractState = current?.state ?? "DRAFT";
  if (edit.action === "create" || edit.action === "edit") {
    ({ title, body } = normalizedTerms(edit.title, edit.body));
    lines = normalizeContentLines(edit.lines, context.repositoryId);
    state = "DRAFT";
  } else if (edit.action === "activate") {
    if (!current || current.lines.some((line) => !("content" in line)))
      throw new ContractError(
        409,
        "A historical Resource draft must be edited to Content before activation.",
        "LIFECYCLE_CONFLICT",
      );
    const activated = normalizeContentLines(edit.lines, context.repositoryId);
    if (
      activated.length !== current.lines.length ||
      activated.some((line, index) => {
        const previous = current.lines[index];
        return (
          !previous ||
          !("content" in previous) ||
          line.lineId !== previous.lineId ||
          line.content.planRevisionId !== previous.content.planRevisionId ||
          line.content.node.id !== previous.content.node.id ||
          line.agreedQuantity !== previous.agreedQuantity
        );
      })
    )
      throw new ContractError(
        409,
        "Contract activation must retain the draft line agreement.",
        "LIFECYCLE_CONFLICT",
      );
    lines = activated;
    state = "ACTIVE";
  } else state = "CLOSED";
  if (
    current &&
    edit.action === "edit" &&
    title === current.title &&
    body === current.body &&
    JSON.stringify(lines) === JSON.stringify(current.lines)
  )
    throw new ContractError(409, "Contract has not changed.", "LIFECYCLE_CONFLICT");
  return {
    ...context,
    version: expectedVersion + 1,
    parentRevisionId: current?.id ?? null,
    action: edit.action,
    state,
    title,
    body,
    lines,
  };
}
