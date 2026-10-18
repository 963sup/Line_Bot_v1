export type ObjectFamily = "types" | "objects" | "relationships";

export type ObjectCommand = Record<string, unknown> & {
  action: string;
  repositoryId: string;
  requestId: string;
  expectedVersion: number;
};

export type PendingObjectCommand = {
  actorUserId: string;
  family: ObjectFamily;
  command: ObjectCommand;
};

function stringProperty(value: object, property: string) {
  if (!(property in value)) return null;
  const candidate = Reflect.get(value, property);
  return typeof candidate === "string" ? candidate : null;
}

function numberProperty(value: object, property: string) {
  if (!(property in value)) return null;
  const candidate = Reflect.get(value, property);
  return typeof candidate === "number" ? candidate : null;
}

function isObjectFamily(value: unknown): value is ObjectFamily {
  return value === "types" || value === "objects" || value === "relationships";
}

function isObjectCommand(value: unknown): value is ObjectCommand {
  return (
    !!value &&
    typeof value === "object" &&
    stringProperty(value, "action") !== null &&
    stringProperty(value, "repositoryId") !== null &&
    stringProperty(value, "requestId") !== null &&
    numberProperty(value, "expectedVersion") !== null
  );
}

export function parsePendingObjectCommand(
  value: unknown,
  actorUserId: string,
  repositoryId: string,
  objectId?: string,
): PendingObjectCommand | null {
  if (!value || typeof value !== "object") return null;
  const family = "family" in value ? Reflect.get(value, "family") : null;
  const command = "command" in value ? Reflect.get(value, "command") : null;
  if (
    stringProperty(value, "actorUserId") !== actorUserId ||
    !isObjectFamily(family) ||
    !isObjectCommand(command) ||
    command.repositoryId !== repositoryId ||
    (objectId && family === "objects" && stringProperty(command, "objectId") !== objectId)
  )
    return null;
  return { actorUserId, family, command };
}

export function confirmsObjectReceipt(value: unknown, pending: PendingObjectCommand) {
  if (!value || typeof value !== "object") return false;
  const result = "result" in value ? Reflect.get(value, "result") : null;
  if (!result || typeof result !== "object") return false;
  const expectedKind =
    pending.family === "types" ? "type" : pending.family === "objects" ? "object" : "relationship";
  const commandTargetProperty =
    pending.family === "types"
      ? "typeId"
      : pending.family === "objects"
        ? "objectId"
        : "relationshipId";
  const resultTargetProperty = pending.family === "types" ? "id" : commandTargetProperty;
  const commandTarget = stringProperty(pending.command, commandTargetProperty);
  const actionAndActorMatch =
    pending.family === "types" ||
    (stringProperty(result, "action") === pending.command.action &&
      stringProperty(result, "actorUserId") === pending.actorUserId);
  return (
    commandTarget !== null &&
    actionAndActorMatch &&
    stringProperty(value, "requestId") === pending.command.requestId &&
    stringProperty(value, "kind") === expectedKind &&
    stringProperty(result, "repositoryId") === pending.command.repositoryId &&
    stringProperty(result, resultTargetProperty) === commandTarget &&
    numberProperty(result, "version") === pending.command.expectedVersion + 1
  );
}
