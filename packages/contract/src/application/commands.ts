import type { ContractLineInput } from "../domain/contract.js";
import { ContractError } from "../domain/error.js";

const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export type ContractCommand =
  | Readonly<{
      action: "create" | "edit";
      repositoryId: string;
      contractId: string;
      requestId: string;
      expectedVersion: number;
      title: string;
      body: string;
      lines: readonly ContractLineInput[] | readonly HistoricalResourceContractLineInput[];
    }>
  | Readonly<{
      action: "activate" | "close";
      repositoryId: string;
      contractId: string;
      requestId: string;
      expectedVersion: number;
    }>;

function identifier(value: unknown): string | null {
  return typeof value === "string" && uuid.test(value) ? value.toLowerCase() : null;
}

export type HistoricalResourceContractLineInput = Readonly<{
  lineId: string;
  resourceId: string;
  resourceRevisionId: string;
  agreedQuantity: string;
}>;

export function isContentContractLineInput(
  line: ContractLineInput | HistoricalResourceContractLineInput,
): line is ContractLineInput {
  return "planRevisionId" in line;
}

function isHistoricalResourceContractLineInput(
  line: ContractLineInput | HistoricalResourceContractLineInput,
): line is HistoricalResourceContractLineInput {
  return "resourceId" in line;
}

function parseLines(
  value: unknown,
): readonly ContractLineInput[] | readonly HistoricalResourceContractLineInput[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100)
    throw new ContractError(400, "Contract must contain 1 to 100 lines.", "INVALID_INPUT");
  const lines = value.map((line): ContractLineInput | HistoricalResourceContractLineInput => {
    if (!line || typeof line !== "object" || Array.isArray(line))
      throw new ContractError(400, "Invalid Contract line.", "INVALID_INPUT");
    const record: Record<string, unknown> = { ...line };
    const lineId = identifier(record.lineId);
    const contentShape = Object.hasOwn(record, "planRevisionId") || Object.hasOwn(record, "nodeId");
    const planRevisionId = identifier(record.planRevisionId);
    const nodeId = identifier(record.nodeId);
    const resourceId = identifier(record.resourceId);
    const resourceRevisionId = identifier(record.resourceRevisionId);
    const allowed = contentShape
      ? ["lineId", "planRevisionId", "nodeId", "agreedQuantity"]
      : ["lineId", "resourceId", "resourceRevisionId", "agreedQuantity"];
    if (
      !lineId ||
      typeof record.agreedQuantity !== "string" ||
      record.agreedQuantity.length < 1 ||
      record.agreedQuantity.length > 32 ||
      Object.keys(record).some((key) => !allowed.includes(key))
    )
      throw new ContractError(400, "Invalid Contract line.", "INVALID_INPUT");
    if (contentShape) {
      if (!planRevisionId || !nodeId)
        throw new ContractError(400, "Invalid Contract line.", "INVALID_INPUT");
      return { lineId, planRevisionId, nodeId, agreedQuantity: record.agreedQuantity };
    }
    if (!resourceId || !resourceRevisionId)
      throw new ContractError(400, "Invalid Contract line.", "INVALID_INPUT");
    return { lineId, resourceId, resourceRevisionId, agreedQuantity: record.agreedQuantity };
  });
  if (new Set(lines.map((line) => line.lineId)).size !== lines.length)
    throw new ContractError(400, "Contract line identifiers must be unique.", "INVALID_INPUT");
  if (lines.every(isContentContractLineInput)) return lines;
  if (lines.every(isHistoricalResourceContractLineInput)) return lines;
  throw new ContractError(400, "Contract lines must use one source model.", "INVALID_INPUT");
}

export function parseContractCommand(input: unknown): ContractCommand {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new ContractError(400, "Invalid Contract command.", "INVALID_INPUT");
  const value: Record<string, unknown> = { ...input };
  const repositoryId = value.repositoryId;
  const contractId = identifier(value.contractId);
  const requestId = identifier(value.requestId);
  const expectedVersion = value.expectedVersion;
  if (
    typeof repositoryId !== "string" ||
    repositoryId.length < 1 ||
    repositoryId.length > 128 ||
    !contractId ||
    !requestId ||
    typeof expectedVersion !== "number" ||
    !Number.isSafeInteger(expectedVersion) ||
    expectedVersion < 0 ||
    expectedVersion >= 2_147_483_647
  )
    throw new ContractError(
      400,
      "Invalid Contract scope, request identity or version.",
      "INVALID_INPUT",
    );
  const base = { repositoryId, contractId, requestId, expectedVersion };
  let command: ContractCommand;
  if (
    (value.action === "create" || value.action === "edit") &&
    typeof value.title === "string" &&
    typeof value.body === "string"
  )
    command = {
      ...base,
      action: value.action,
      title: value.title,
      body: value.body,
      lines: parseLines(value.lines),
    };
  else if (value.action === "activate" || value.action === "close")
    command = { ...base, action: value.action };
  else throw new ContractError(400, "Invalid Contract action.", "INVALID_INPUT");
  if (Object.keys(value).some((key) => !Object.hasOwn(command, key)))
    throw new ContractError(400, "Unknown Contract command field.", "INVALID_INPUT");
  return command;
}
