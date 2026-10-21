import { normalizeContent } from "@line_bot_v1/platform/text";
import { ResourceError } from "./resource-error.js";

export type ResourceKind = "LOCATION" | "EQUIPMENT" | "MATERIAL";
export type ResourceState = "ACTIVE" | "ARCHIVED";
export type ResourceAction = "create" | "edit" | "archive" | "unarchive";

export type ResourceRevision = Readonly<{
  id: string;
  resourceId: string;
  repositoryId: string;
  version: number;
  parentRevisionId: string | null;
  actorUserId: string;
  at: number;
  action: ResourceAction;
  kind: ResourceKind;
  name: string;
  description: string;
  state: ResourceState;
}>;

export type ResourceEdit =
  | Readonly<{ action: "create"; kind: ResourceKind; name: string; description: string }>
  | Readonly<{ action: "edit"; name: string; description: string }>
  | Readonly<{ action: "archive" | "unarchive" }>;

function assertResourceTransition(
  current: ResourceRevision | null,
  expectedVersion: number,
  action: ResourceAction,
): void {
  if ((current?.version ?? 0) !== expectedVersion)
    throw new ResourceError(409, "Resource version conflict.", "VERSION_CONFLICT");
  if (action === "create" ? current !== null : current === null)
    throw new ResourceError(409, "Resource lifecycle conflict.", "LIFECYCLE_CONFLICT");
  if (action === "edit" && current?.state !== "ACTIVE")
    throw new ResourceError(409, "An archived Resource cannot be edited.", "LIFECYCLE_CONFLICT");
  if (action === "archive" && current?.state !== "ACTIVE")
    throw new ResourceError(409, "Only an active Resource can be archived.", "LIFECYCLE_CONFLICT");
  if (action === "unarchive" && current?.state !== "ARCHIVED")
    throw new ResourceError(
      409,
      "Only an archived Resource can be restored.",
      "LIFECYCLE_CONFLICT",
    );
}

function normalizeResourceText(name: string, description: string) {
  const normalized = normalizeContent({ title: name, body: description });
  if (!normalized.ok)
    throw new ResourceError(400, "Invalid Resource name or description size.", "INVALID_INPUT");
  return { name: normalized.value.title, description: normalized.value.body };
}

export function reviseResource(
  current: ResourceRevision | null,
  expectedVersion: number,
  edit: ResourceEdit,
  context: Readonly<{
    id: string;
    resourceId: string;
    repositoryId: string;
    actorUserId: string;
    at: number;
  }>,
): ResourceRevision {
  assertResourceTransition(current, expectedVersion, edit.action);
  const text =
    edit.action === "create" || edit.action === "edit"
      ? normalizeResourceText(edit.name, edit.description)
      : { name: current?.name ?? "", description: current?.description ?? "" };
  const kind = edit.action === "create" ? edit.kind : current?.kind;
  if (!kind) throw new ResourceError(409, "Resource lifecycle conflict.", "LIFECYCLE_CONFLICT");
  const state: ResourceState =
    edit.action === "archive"
      ? "ARCHIVED"
      : edit.action === "unarchive"
        ? "ACTIVE"
        : (current?.state ?? "ACTIVE");
  if (
    current &&
    edit.action === "edit" &&
    text.name === current.name &&
    text.description === current.description
  )
    throw new ResourceError(409, "Resource has not changed.", "LIFECYCLE_CONFLICT");
  return {
    ...context,
    version: expectedVersion + 1,
    parentRevisionId: current?.id ?? null,
    action: edit.action,
    kind,
    name: text.name,
    description: text.description,
    state,
  };
}
