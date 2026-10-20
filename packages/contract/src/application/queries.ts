import { ContractError } from "../domain/error.js";

const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export type ContractQuery = Readonly<{
  repositoryId: string;
  contractId: string;
  revisionId?: string;
}>;

export function contractId(value: unknown): string {
  if (typeof value !== "string" || !uuid.test(value))
    throw new ContractError(400, "Invalid Contract identifier.", "INVALID_INPUT");
  return value.toLowerCase();
}

export function repositoryId(value: unknown): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 128)
    throw new ContractError(400, "Invalid Repository scope.", "INVALID_INPUT");
  return value;
}

export function contractQuery(input: unknown): ContractQuery {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new ContractError(400, "Invalid Contract query.", "INVALID_INPUT");
  const value: Record<string, unknown> = { ...input };
  const query = {
    repositoryId: repositoryId(value.repositoryId),
    contractId: contractId(value.contractId),
    ...(value.revisionId === undefined ? {} : { revisionId: contractId(value.revisionId) }),
  };
  if (Object.keys(value).some((key) => !Object.hasOwn(query, key)))
    throw new ContractError(400, "Unknown Contract query field.", "INVALID_INPUT");
  return query;
}

export function contractHistoryQuery(input: unknown): Omit<ContractQuery, "revisionId"> {
  const query = contractQuery(input);
  if (query.revisionId !== undefined)
    throw new ContractError(400, "Unknown Contract query field.", "INVALID_INPUT");
  return query;
}

export function historyCursor(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > 2_147_483_647
  )
    throw new ContractError(400, "Invalid Contract history cursor.", "INVALID_INPUT");
  return value;
}
