import { ObjectError } from "./error.js";

export type ObjectType = Readonly<{
  id: string;
  repositoryId: string;
  name: string;
  description: string;
  enabled: boolean;
  version: number;
  createdAt: number;
  updatedAt: number;
}>;

function normalizeTypeName(value: string) {
  const name = value.trim();
  if (!name || name.length > 100)
    throw new ObjectError(400, "Object Type 名稱需為 1 到 100 字。", "INVALID_INPUT");
  return name;
}

function normalizeTypeDescription(value: string) {
  const description = value.trim();
  if (description.length > 2_000)
    throw new ObjectError(400, "Object Type 說明不可超過 2000 字。", "INVALID_INPUT");
  return description;
}

export function reviseObjectType(
  current: ObjectType | null,
  command:
    | Readonly<{ action: "create"; name: string; description: string }>
    | Readonly<{ action: "update"; name: string; description: string }>
    | Readonly<{ action: "disable" | "enable" }>,
  context: Readonly<{ id: string; repositoryId: string; expectedVersion: number; at: number }>,
): ObjectType {
  if ((current?.version ?? 0) !== context.expectedVersion)
    throw new ObjectError(409, "Object Type 版本衝突。", "VERSION_CONFLICT");
  if (command.action === "create" ? current !== null : current === null)
    throw new ObjectError(409, "Object Type 生命週期衝突。", "LIFECYCLE_CONFLICT");
  const name =
    command.action === "create" || command.action === "update"
      ? normalizeTypeName(command.name)
      : (current?.name ?? "");
  const description =
    command.action === "create" || command.action === "update"
      ? normalizeTypeDescription(command.description)
      : (current?.description ?? "");
  const enabled =
    command.action === "disable"
      ? false
      : command.action === "enable"
        ? true
        : (current?.enabled ?? true);
  if (
    current &&
    current.name === name &&
    current.description === description &&
    current.enabled === enabled
  )
    throw new ObjectError(409, "Object Type 沒有變更。", "LIFECYCLE_CONFLICT");
  return {
    id: context.id,
    repositoryId: context.repositoryId,
    name,
    description,
    enabled,
    version: context.expectedVersion + 1,
    createdAt: current?.createdAt ?? context.at,
    updatedAt: context.at,
  };
}
