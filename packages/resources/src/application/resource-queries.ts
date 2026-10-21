import { ResourceError } from "../domain/resource-error.js";

const uuidPattern = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export type ResourceQuery = Readonly<{
  repositoryId: string;
  resourceId: string;
  revisionId?: string;
}>;

export function resourceId(value: unknown): string {
  if (typeof value !== "string" || !uuidPattern.test(value))
    throw new ResourceError(400, "Invalid Resource identifier.", "INVALID_INPUT");
  return value.toLowerCase();
}

export function repositoryId(value: unknown): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 128 || value !== value.trim())
    throw new ResourceError(400, "Invalid Repository scope.", "INVALID_INPUT");
  return value;
}

export function resourceQuery(input: unknown): ResourceQuery {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new ResourceError(400, "Invalid Resource query.", "INVALID_INPUT");
  const value: Record<string, unknown> = { ...input };
  const query = {
    repositoryId: repositoryId(value.repositoryId),
    resourceId: resourceId(value.resourceId),
    ...(value.revisionId === undefined ? {} : { revisionId: resourceId(value.revisionId) }),
  };
  if (Object.keys(value).some((key) => !Object.hasOwn(query, key)))
    throw new ResourceError(400, "Unknown Resource query field.", "INVALID_INPUT");
  return query;
}

export function resourceHistoryQuery(input: unknown): Omit<ResourceQuery, "revisionId"> {
  const query = resourceQuery(input);
  if (query.revisionId !== undefined)
    throw new ResourceError(400, "Unknown Resource query field.", "INVALID_INPUT");
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
    throw new ResourceError(400, "Invalid Resource history cursor.", "INVALID_INPUT");
  return value;
}
