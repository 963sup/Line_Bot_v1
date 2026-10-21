import { normalizeContent } from "@line_bot_v1/platform/text";
import type { Quantity } from "./engineering.js";
import { ObjectError } from "./error.js";

export type ObjectRevision = Readonly<{
  id: string;
  objectId: string;
  repositoryId: string;
  version: number;
  parentRevisionId: string | null;
  actorUserId: string;
  at: number;
  action: "create" | "edit" | "reclassify" | "archive" | "unarchive" | "restore" | "set-quantity";
  typeId: string;
  typeName: string;
  name: string;
  content: string;
  archived: boolean;
  quantity?: Quantity | null;
}>;

export type ObjectEdit =
  | Readonly<{
      action: "create";
      name: string;
      content: string;
      typeId: string;
      quantity?: Quantity | null;
    }>
  | Readonly<{ action: "edit"; name: string; content: string }>
  | Readonly<{ action: "reclassify"; typeId: string }>
  | Readonly<{ action: "archive" }>
  | Readonly<{ action: "unarchive" }>
  | Readonly<{ action: "set-quantity"; quantity: Quantity | null }>
  | Readonly<{ action: "restore"; revisionId: string }>;

function normalizeObjectContent(name: string, content: string) {
  const normalized = normalizeContent({ title: name, body: content });
  if (!normalized.ok) {
    if (normalized.field === "title")
      throw new ObjectError(400, "Object 名稱需為 1 到 200 字。", "INVALID_INPUT");
    throw new ObjectError(400, "Object 內容不可超過 262144 字。", "INVALID_INPUT");
  }
  return { name: normalized.value.title, content: normalized.value.body };
}

export function reviseObject(
  current: ObjectRevision | null,
  edit: ObjectEdit,
  context: Readonly<{
    id: string;
    objectId: string;
    repositoryId: string;
    actorUserId: string;
    expectedVersion: number;
    at: number;
    typeName: string;
  }>,
  restored: ObjectRevision | null = null,
): ObjectRevision {
  if ((current?.version ?? 0) !== context.expectedVersion)
    throw new ObjectError(409, "Object 版本衝突。", "VERSION_CONFLICT");
  if (edit.action === "create" ? current !== null : current === null)
    throw new ObjectError(409, "Object 生命週期衝突。", "LIFECYCLE_CONFLICT");
  if (current?.archived && edit.action !== "unarchive")
    throw new ObjectError(409, "封存的 Object 只允許取消封存。", "OBJECT_ARCHIVED");
  if (edit.action === "unarchive" && !current?.archived)
    throw new ObjectError(409, "Object 尚未封存。", "LIFECYCLE_CONFLICT");

  let name = current?.name ?? "";
  let content = current?.content ?? "";
  let typeId = current?.typeId ?? "";
  let typeName = current?.typeName ?? "";
  let archived = current?.archived ?? false;
  let quantity = current?.quantity ?? null;
  if (edit.action === "create") {
    ({ name, content } = normalizeObjectContent(edit.name, edit.content));
    typeId = edit.typeId;
    typeName = context.typeName;
    quantity = edit.quantity ?? null;
  } else if (edit.action === "edit") {
    ({ name, content } = normalizeObjectContent(edit.name, edit.content));
  } else if (edit.action === "reclassify") {
    typeId = edit.typeId;
    typeName = context.typeName;
  } else if (edit.action === "archive") archived = true;
  else if (edit.action === "unarchive") archived = false;
  else if (edit.action === "set-quantity") quantity = edit.quantity;
  else {
    if (
      !restored ||
      restored.id !== edit.revisionId ||
      restored.objectId !== context.objectId ||
      restored.repositoryId !== context.repositoryId
    )
      throw new ObjectError(404, "找不到此 Object 的 Revision。", "NOT_FOUND");
    name = restored.name;
    content = restored.content;
    typeId = restored.typeId;
    typeName = context.typeName;
    quantity = restored.quantity ?? null;
  }
  typeName = context.typeName;
  if (
    current &&
    current.name === name &&
    current.content === content &&
    current.typeId === typeId &&
    current.archived === archived &&
    JSON.stringify(current.quantity ?? null) === JSON.stringify(quantity)
  )
    throw new ObjectError(409, "Object 沒有變更。", "LIFECYCLE_CONFLICT");
  return {
    id: context.id,
    objectId: context.objectId,
    repositoryId: context.repositoryId,
    version: context.expectedVersion + 1,
    parentRevisionId: current?.id ?? null,
    actorUserId: context.actorUserId,
    at: context.at,
    action: edit.action,
    typeId,
    typeName,
    name,
    content,
    archived,
    quantity,
  };
}
