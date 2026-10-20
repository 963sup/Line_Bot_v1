import { normalizeContent } from "@line_bot_v1/content/text";
import type { ResourceQuantityBasis } from "@line_bot_v1/resources/contracts/output/engineering-references";
import { normalizeQuantity, quantityUnits } from "@line_bot_v1/resources/domain/quantity";
import { ContractError } from "./error.js";

type ContractState = "DRAFT" | "ACTIVE" | "CLOSED";
export type ContractAction = "create" | "edit" | "activate" | "close";

export type ContractLineInput = Readonly<{
  lineId: string;
  resourceId: string;
  resourceRevisionId: string;
  agreedQuantity: string;
}>;

export type FrozenContractLine = Readonly<{
  lineId: string;
  resource: ResourceQuantityBasis;
  agreedQuantity: string;
}>;

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
      lines: readonly FrozenContractLine[];
    }>
  | Readonly<{ action: "activate"; lines: readonly FrozenContractLine[] }>
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

export function copyContractLines(lines: readonly FrozenContractLine[]): FrozenContractLine[] {
  return lines.map((line) => ({
    lineId: line.lineId,
    resource: copyResource(line.resource),
    agreedQuantity: line.agreedQuantity,
  }));
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
  resources: readonly ResourceQuantityBasis[],
): FrozenContractLine[] {
  if (inputs.length < 1 || inputs.length > 100 || resources.length !== inputs.length)
    throw new ContractError(400, "Contract must contain 1 to 100 lines.", "INVALID_INPUT");
  return normalizeFrozenLines(
    inputs.map((input, index) => {
      const resource = resources[index];
      if (
        !resource ||
        resource.resourceId !== input.resourceId ||
        resource.resourceRevisionId !== input.resourceRevisionId
      )
        throw new ContractError(
          503,
          "Contract Resource qualification is incomplete.",
          "UNAVAILABLE",
        );
      return {
        lineId: input.lineId,
        resource: copyResource(resource),
        agreedQuantity: input.agreedQuantity,
      };
    }),
  );
}

function normalizeFrozenLines(lines: readonly FrozenContractLine[]): FrozenContractLine[] {
  if (lines.length < 1 || lines.length > 100)
    throw new ContractError(400, "Contract must contain 1 to 100 lines.", "INVALID_INPUT");
  const seen = new Set<string>();
  return lines.map((line) => {
    if (seen.has(line.lineId))
      throw new ContractError(400, "Contract line identifiers must be unique.", "INVALID_INPUT");
    seen.add(line.lineId);
    let agreedQuantity: string;
    try {
      agreedQuantity = normalizeQuantity(line.agreedQuantity, line.resource.measure.unit);
      if (quantityUnits(agreedQuantity) <= 0n) throw new Error("non-positive");
    } catch {
      throw new ContractError(400, "Contract agreed quantity must be positive.", "INVALID_INPUT");
    }
    return { lineId: line.lineId, resource: copyResource(line.resource), agreedQuantity };
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
    lines = normalizeFrozenLines(edit.lines);
    state = "DRAFT";
  } else if (edit.action === "activate") {
    const activated = normalizeFrozenLines(edit.lines);
    if (
      !current ||
      activated.length !== current.lines.length ||
      activated.some((line, index) => {
        const previous = current.lines[index];
        return (
          !previous ||
          line.lineId !== previous.lineId ||
          line.resource.resourceId !== previous.resource.resourceId ||
          line.resource.resourceRevisionId !== previous.resource.resourceRevisionId ||
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
