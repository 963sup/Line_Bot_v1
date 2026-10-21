import type { ResourceKind } from "../domain/resource.js";
import { ResourceError } from "../domain/resource-error.js";

const uuidPattern = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

type Base = Readonly<{
  repositoryId: string;
  resourceId: string;
  requestId: string;
  expectedVersion: number;
}>;

export type ResourceCommand = Base &
  (
    | Readonly<{
        action: "create";
        kind: ResourceKind;
        name: string;
        description: string;
      }>
    | Readonly<{ action: "edit"; name: string; description: string }>
    | Readonly<{ action: "archive" | "unarchive" }>
  );

function identifier(value: unknown): string | null {
  return typeof value === "string" && uuidPattern.test(value) ? value.toLowerCase() : null;
}

export function parseResourceCommand(input: unknown): ResourceCommand {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new ResourceError(400, "Invalid Resource command.", "INVALID_INPUT");
  const value: Record<string, unknown> = { ...input };
  const repositoryId = value.repositoryId;
  const resourceId = identifier(value.resourceId);
  const requestId = identifier(value.requestId);
  const expectedVersion = value.expectedVersion;
  if (
    typeof repositoryId !== "string" ||
    repositoryId.length < 1 ||
    repositoryId.length > 128 ||
    repositoryId !== repositoryId.trim() ||
    !resourceId ||
    !requestId ||
    typeof expectedVersion !== "number" ||
    !Number.isSafeInteger(expectedVersion) ||
    expectedVersion < 0 ||
    expectedVersion >= 2_147_483_647
  )
    throw new ResourceError(
      400,
      "Invalid Resource scope, request identity or version.",
      "INVALID_INPUT",
    );
  const base = { repositoryId, resourceId, requestId, expectedVersion };
  let command: ResourceCommand;
  if (
    value.action === "create" &&
    (value.kind === "LOCATION" || value.kind === "EQUIPMENT" || value.kind === "MATERIAL") &&
    typeof value.name === "string" &&
    typeof value.description === "string"
  )
    command = {
      ...base,
      action: "create",
      kind: value.kind,
      name: value.name,
      description: value.description,
    };
  else if (
    value.action === "edit" &&
    typeof value.name === "string" &&
    typeof value.description === "string"
  )
    command = {
      ...base,
      action: "edit",
      name: value.name,
      description: value.description,
    };
  else if (value.action === "archive" || value.action === "unarchive")
    command = { ...base, action: value.action };
  else throw new ResourceError(400, "Invalid Resource action.", "INVALID_INPUT");
  if (Object.keys(value).some((key) => !Object.hasOwn(command, key)))
    throw new ResourceError(400, "Unknown Resource command field.", "INVALID_INPUT");
  return command;
}
