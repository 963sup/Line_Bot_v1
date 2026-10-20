import type { ObservedEngineering } from "../domain/engineering.js";
import { ObjectError } from "../domain/error.js";
import type { ObjectEdit } from "../domain/object.js";
import { parseObserved } from "./engineering-commands.js";

type Base = Readonly<{
  repositoryId: string;
  requestId: string;
  expectedVersion: number;
}>;
export type ObjectTypeCommand = Base &
  Readonly<{ typeId: string }> &
  (
    | Readonly<{ action: "create" | "update"; name: string; description: string }>
    | Readonly<{ action: "disable" | "enable" }>
  );
type PublicObjectEdit =
  | Omit<Extract<ObjectEdit, { action: "create" }>, "quantity">
  | Exclude<ObjectEdit, { action: "create" | "restore" | "set-quantity" }>
  | (Extract<ObjectEdit, { action: "restore" }> & Readonly<{ observed?: ObservedEngineering }>);
export type ObjectCommand = Base & Readonly<{ objectId: string }> & PublicObjectEdit;
export type ObjectRelationshipCommand = Base &
  Readonly<{ relationshipId: string }> &
  (
    | Readonly<{
        action: "create";
        sourceObjectId: string;
        targetObjectId: string;
        name: string;
      }>
    | Readonly<{ action: "rename"; name: string }>
    | Readonly<{ action: "remove" }>
  );

const uuidPattern = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
function input(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ObjectError(400, "Object 操作格式不正確。", "INVALID_INPUT");
  return Object.fromEntries(Object.entries(value));
}
function exact(value: Record<string, unknown>, keys: readonly string[]) {
  if (Object.keys(value).some((key) => !keys.includes(key)))
    throw new ObjectError(400, "Object 操作含有未知欄位。", "INVALID_INPUT");
}
function uuid(value: unknown, label: string) {
  if (typeof value !== "string" || !uuidPattern.test(value))
    throw new ObjectError(400, `${label} 不正確。`, "INVALID_INPUT");
  return value.toLowerCase();
}
function repositoryId(value: unknown) {
  if (typeof value !== "string" || !value || value !== value.trim() || value.length > 128)
    throw new ObjectError(400, "Repository 識別碼不正確。", "INVALID_INPUT");
  return value;
}
function version(value: unknown) {
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) >= 2_147_483_647)
    throw new ObjectError(400, "Object 版本不正確。", "INVALID_INPUT");
  return Number(value);
}
function text(value: unknown, label: string) {
  if (typeof value !== "string")
    throw new ObjectError(400, `${label} 格式不正確。`, "INVALID_INPUT");
  return value;
}
function base(value: Record<string, unknown>) {
  return {
    repositoryId: repositoryId(value.repositoryId),
    requestId: uuid(value.requestId, "Request ID"),
    expectedVersion: version(value.expectedVersion),
  };
}

export function parseObjectTypeCommand(raw: unknown): ObjectTypeCommand {
  const value = input(raw);
  const common = { ...base(value), typeId: uuid(value.typeId, "Object Type ID") };
  if (value.action === "create" || value.action === "update") {
    exact(value, [
      "action",
      "repositoryId",
      "requestId",
      "expectedVersion",
      "typeId",
      "name",
      "description",
    ]);
    return {
      ...common,
      action: value.action,
      name: text(value.name, "Object Type 名稱"),
      description: text(value.description, "Object Type 說明"),
    };
  }
  if (value.action === "disable" || value.action === "enable") {
    exact(value, ["action", "repositoryId", "requestId", "expectedVersion", "typeId"]);
    return { ...common, action: value.action };
  }
  throw new ObjectError(400, "Object Type 操作不正確。", "INVALID_INPUT");
}

export function parseObjectCommand(raw: unknown): ObjectCommand {
  const value = input(raw);
  const common = { ...base(value), objectId: uuid(value.objectId, "Object ID") };
  if (value.action === "create") {
    exact(value, [
      "action",
      "repositoryId",
      "requestId",
      "expectedVersion",
      "objectId",
      "typeId",
      "name",
      "content",
    ]);
    return {
      ...common,
      action: value.action,
      typeId: uuid(value.typeId, "Object Type ID"),
      name: text(value.name, "Object 名稱"),
      content: text(value.content, "Object 內容"),
    };
  }
  if (value.action === "edit") {
    exact(value, [
      "action",
      "repositoryId",
      "requestId",
      "expectedVersion",
      "objectId",
      "name",
      "content",
    ]);
    return {
      ...common,
      action: value.action,
      name: text(value.name, "Object 名稱"),
      content: text(value.content, "Object 內容"),
    };
  }
  if (value.action === "reclassify") {
    exact(value, ["action", "repositoryId", "requestId", "expectedVersion", "objectId", "typeId"]);
    return { ...common, action: value.action, typeId: uuid(value.typeId, "Object Type ID") };
  }
  if (value.action === "archive" || value.action === "unarchive") {
    exact(value, ["action", "repositoryId", "requestId", "expectedVersion", "objectId"]);
    return { ...common, action: value.action };
  }
  if (value.action === "restore") {
    exact(value, [
      "action",
      "repositoryId",
      "requestId",
      "expectedVersion",
      "objectId",
      "revisionId",
      "observed",
    ]);
    return {
      ...common,
      action: value.action,
      revisionId: uuid(value.revisionId, "Object Revision ID"),
      ...(value.observed === undefined ? {} : { observed: parseObserved(value.observed) }),
    };
  }
  throw new ObjectError(400, "Object 操作不正確。", "INVALID_INPUT");
}

export function parseObjectRelationshipCommand(raw: unknown): ObjectRelationshipCommand {
  const value = input(raw);
  const common = { ...base(value), relationshipId: uuid(value.relationshipId, "Relationship ID") };
  if (value.action === "create") {
    exact(value, [
      "action",
      "repositoryId",
      "requestId",
      "expectedVersion",
      "relationshipId",
      "sourceObjectId",
      "targetObjectId",
      "name",
    ]);
    return {
      ...common,
      action: value.action,
      sourceObjectId: uuid(value.sourceObjectId, "Source Object ID"),
      targetObjectId: uuid(value.targetObjectId, "Target Object ID"),
      name: text(value.name, "Relationship 名稱"),
    };
  }
  if (value.action === "rename") {
    exact(value, [
      "action",
      "repositoryId",
      "requestId",
      "expectedVersion",
      "relationshipId",
      "name",
    ]);
    return { ...common, action: value.action, name: text(value.name, "Relationship 名稱") };
  }
  if (value.action === "remove") {
    exact(value, ["action", "repositoryId", "requestId", "expectedVersion", "relationshipId"]);
    return { ...common, action: value.action };
  }
  throw new ObjectError(400, "Relationship 操作不正確。", "INVALID_INPUT");
}
