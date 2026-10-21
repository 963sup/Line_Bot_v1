import { ContentError } from "../../domain/error.js";

const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export function contentRepositoryId(value: unknown): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 128)
    throw new ContentError(400, "Invalid Content Repository scope.", "INVALID_INPUT");
  return value;
}

function contentRevisionId(value: unknown): string {
  if (typeof value !== "string" || !uuid.test(value))
    throw new ContentError(400, "Invalid Content revision identifier.", "INVALID_INPUT");
  return value.toLowerCase();
}

export function contentPlanQuery(input: unknown): { repositoryId: string; revisionId?: string } {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new ContentError(400, "Invalid Content query.", "INVALID_INPUT");
  const value: Record<string, unknown> = { ...input };
  const query = {
    repositoryId: contentRepositoryId(value.repositoryId),
    ...(value.revisionId === undefined ? {} : { revisionId: contentRevisionId(value.revisionId) }),
  };
  if (Object.keys(value).some((key) => !Object.hasOwn(query, key)))
    throw new ContentError(400, "Unknown Content query field.", "INVALID_INPUT");
  return query;
}

export function contentHistoryCursor(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > 2_147_483_647
  )
    throw new ContentError(400, "Invalid Content history cursor.", "INVALID_INPUT");
  return value;
}
