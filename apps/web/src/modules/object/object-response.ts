import type { RelationshipKind } from "@line_bot_v1/object/contracts/dto/objects";
import {
  booleanValue,
  literalValue,
  nullableString,
  numberValue,
  record,
  stringValue,
} from "@line_bot_v1/platform/validation";
import { quantityView } from "./engineering-response";

export function objectScope(value: unknown) {
  const v = record(value);
  const repository = record(v.repository);
  return {
    actorUserId: stringValue(v.actorUserId),
    repository: {
      id: stringValue(repository.id),
      ownerLogin: stringValue(repository.ownerLogin),
      name: stringValue(repository.name),
    },
    archived: booleanValue(v.archived),
    canEdit: booleanValue(v.canEdit),
    canManageTypes: booleanValue(v.canManageTypes),
    canManageRepository: booleanValue(v.canManageRepository),
  };
}

export type ObjectTypeView = ReturnType<typeof objectType>;
function objectType(value: unknown) {
  const v = record(value);
  return {
    id: stringValue(v.id),
    repositoryId: stringValue(v.repositoryId),
    name: stringValue(v.name),
    description: stringValue(v.description),
    enabled: booleanValue(v.enabled),
    version: numberValue(v.version),
    createdAt: numberValue(v.createdAt),
    updatedAt: numberValue(v.updatedAt),
  };
}

export type ObjectRevisionView = ReturnType<typeof objectRevision>;
export function objectRevision(value: unknown) {
  const v = record(value);
  return {
    id: stringValue(v.id),
    objectId: stringValue(v.objectId),
    repositoryId: stringValue(v.repositoryId),
    version: numberValue(v.version),
    parentRevisionId: nullableString(v.parentRevisionId),
    actorUserId: stringValue(v.actorUserId),
    at: numberValue(v.at),
    action: literalValue(v.action, [
      "create",
      "edit",
      "reclassify",
      "archive",
      "unarchive",
      "restore",
      "set-quantity",
    ]),
    name: stringValue(v.name),
    content: stringValue(v.content),
    typeId: stringValue(v.typeId),
    typeName: stringValue(v.typeName),
    archived: booleanValue(v.archived),
    quantity: quantityView(v.quantity),
  };
}

export type ObjectRelationshipView = ReturnType<typeof objectRelationship>;
function objectRelationship(value: unknown) {
  const v = record(value);
  const kind: RelationshipKind =
    v.kind === undefined
      ? "REFERENCE"
      : literalValue(v.kind, ["REFERENCE", "INCLUDES", "ALLOCATES", "LOCATED_IN"]);
  return {
    id: stringValue(v.id),
    relationshipId: stringValue(v.relationshipId),
    repositoryId: stringValue(v.repositoryId),
    version: numberValue(v.version),
    parentRevisionId: nullableString(v.parentRevisionId),
    actorUserId: stringValue(v.actorUserId),
    at: numberValue(v.at),
    action: literalValue(v.action, ["create", "rename", "remove"]),
    sourceObjectId: stringValue(v.sourceObjectId),
    targetObjectId: stringValue(v.targetObjectId),
    name: stringValue(v.name),
    active: booleanValue(v.active),
    kind,
  };
}

export function objectTypes(value: unknown) {
  const v = record(value);
  if (!Array.isArray(v.items)) throw new Error("Object Type 清單格式不正確。");
  return { types: v.items.map(objectType), next: nullableString(v.next) };
}

export function objects(value: unknown) {
  const v = record(value);
  if (!Array.isArray(v.items)) throw new Error("Object 清單格式不正確。");
  return {
    objects: v.items.map((value: unknown) => {
      const item = record(value);
      return {
        objectId: stringValue(item.objectId),
        repositoryId: stringValue(item.repositoryId),
        revisionId: stringValue(item.revisionId),
        version: numberValue(item.version),
        typeId: stringValue(item.typeId),
        typeName: stringValue(item.typeName),
        name: stringValue(item.name),
        archived: booleanValue(item.archived),
        updatedAt: numberValue(item.updatedAt),
      };
    }),
    next: nullableString(v.next),
  };
}

export function objectHistory(value: unknown) {
  const v = record(value);
  if (!Array.isArray(v.items)) throw new Error("Object 歷史格式不正確。");
  return {
    revisions: v.items.map(objectRevision),
    next: nullableString(v.next),
  };
}

export function objectRelationships(value: unknown) {
  const v = record(value);
  if (!Array.isArray(v.items)) throw new Error("Object 關係格式不正確。");
  return { relationships: v.items.map(objectRelationship), next: nullableString(v.next) };
}

export function objectComparison(value: unknown) {
  const v = record(value);
  if (!Array.isArray(v.differences)) throw new Error("Object 比較格式不正確。");
  return v.differences.map((value: unknown) => {
    const item = record(value);
    const before = item.before;
    const after = item.after;
    if (
      (typeof before !== "string" && typeof before !== "boolean") ||
      (typeof after !== "string" && typeof after !== "boolean")
    )
      throw new Error("Object 比較內容不正確。");
    return {
      field: literalValue(item.field, [
        "typeId",
        "typeName",
        "name",
        "content",
        "archived",
        "quantity",
      ]),
      before,
      after,
    };
  });
}
