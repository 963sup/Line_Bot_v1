import type { RelationshipKind } from "./engineering.js";
import { ObjectError } from "./error.js";

export type ObjectRelationshipRevision = Readonly<{
  id: string;
  relationshipId: string;
  repositoryId: string;
  version: number;
  parentRevisionId: string | null;
  actorUserId: string;
  at: number;
  action: "create" | "rename" | "remove";
  sourceObjectId: string;
  targetObjectId: string;
  name: string;
  active: boolean;
  kind?: RelationshipKind;
}>;

function normalizeRelationshipName(value: string) {
  const name = value.trim();
  if (!name || name.length > 100)
    throw new ObjectError(400, "Relationship 名稱需為 1 到 100 字。", "INVALID_INPUT");
  return name;
}

export function reviseRelationship(
  current: ObjectRelationshipRevision | null,
  edit:
    | Readonly<{
        action: "create";
        sourceObjectId: string;
        targetObjectId: string;
        name: string;
        kind?: RelationshipKind;
      }>
    | Readonly<{ action: "rename"; name: string }>
    | Readonly<{ action: "remove" }>,
  context: Readonly<{
    id: string;
    relationshipId: string;
    repositoryId: string;
    actorUserId: string;
    expectedVersion: number;
    at: number;
  }>,
): ObjectRelationshipRevision {
  if ((current?.version ?? 0) !== context.expectedVersion)
    throw new ObjectError(409, "Relationship 版本衝突。", "VERSION_CONFLICT");
  if (edit.action === "create" ? current !== null : current === null)
    throw new ObjectError(409, "Relationship 生命週期衝突。", "LIFECYCLE_CONFLICT");
  if (current && !current.active)
    throw new ObjectError(409, "Relationship 已移除。", "LIFECYCLE_CONFLICT");
  const sourceObjectId =
    edit.action === "create" ? edit.sourceObjectId : (current?.sourceObjectId ?? "");
  const targetObjectId =
    edit.action === "create" ? edit.targetObjectId : (current?.targetObjectId ?? "");
  if (sourceObjectId === targetObjectId)
    throw new ObjectError(409, "Object 不可建立指向自己的 Relationship。", "LIFECYCLE_CONFLICT");
  const name =
    edit.action === "remove" ? (current?.name ?? "") : normalizeRelationshipName(edit.name);
  const active = edit.action !== "remove";
  if (current && current.name === name && current.active === active)
    throw new ObjectError(409, "Relationship 沒有變更。", "LIFECYCLE_CONFLICT");
  return {
    id: context.id,
    relationshipId: context.relationshipId,
    repositoryId: context.repositoryId,
    version: context.expectedVersion + 1,
    parentRevisionId: current?.id ?? null,
    actorUserId: context.actorUserId,
    at: context.at,
    action: edit.action,
    sourceObjectId,
    targetObjectId,
    name,
    active,
    kind: edit.action === "create" ? (edit.kind ?? "REFERENCE") : (current?.kind ?? "REFERENCE"),
  };
}
