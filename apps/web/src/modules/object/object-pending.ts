export type ObjectFamily = "types" | "objects" | "relationships" | "measures";

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
  return (
    value === "types" || value === "objects" || value === "relationships" || value === "measures"
  );
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
    (objectId &&
      family === "objects" &&
      command.action !== "set-quantities" &&
      command.action !== "create-child" &&
      stringProperty(command, "objectId") !== objectId)
  )
    return null;
  return { actorUserId, family, command };
}

export function confirmsObjectReceipt(value: unknown, pending: PendingObjectCommand) {
  if (!value || typeof value !== "object") return false;
  const result = "result" in value ? Reflect.get(value, "result") : null;
  if (!result || typeof result !== "object") return false;
  if (
    ["create-measure", "set-quantities", "set-parent", "set-location", "create-child"].includes(
      pending.command.action,
    )
  )
    return confirmsEngineeringReceipt(value, result, pending);
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

function confirmsEngineeringReceipt(
  value: object,
  result: object,
  pending: PendingObjectCommand,
): boolean {
  const command = pending.command;
  if (
    stringProperty(value, "requestId") !== command.requestId ||
    stringProperty(value, "kind") !== "engineering" ||
    stringProperty(result, "repositoryId") !== command.repositoryId
  )
    return false;
  const objects: unknown = Reflect.get(result, "objects");
  const relationships: unknown = Reflect.get(result, "relationships");
  if (!Array.isArray(objects) || !Array.isArray(relationships)) return false;
  const actor = (item: unknown) =>
    !!item &&
    typeof item === "object" &&
    stringProperty(item, "actorUserId") === pending.actorUserId &&
    stringProperty(item, "repositoryId") === command.repositoryId;
  if (command.action === "create-measure") {
    const measure: unknown = Reflect.get(result, "measure");
    return (
      objects.length === 0 &&
      relationships.length === 0 &&
      !!measure &&
      typeof measure === "object" &&
      stringProperty(measure, "id") === command.measureId &&
      stringProperty(measure, "repositoryId") === command.repositoryId
    );
  }
  if (Reflect.get(result, "measure") !== null) return false;
  if (command.action === "set-quantities") {
    const changes: unknown = command.changes;
    return (
      Array.isArray(changes) &&
      relationships.length === 0 &&
      objects.length === changes.length &&
      changes.every((change: unknown) => {
        if (!change || typeof change !== "object") return false;
        return objects.some(
          (item: unknown) =>
            item &&
            typeof item === "object" &&
            actor(item) &&
            stringProperty(item, "objectId") === stringProperty(change, "objectId") &&
            numberProperty(item, "version") ===
              (numberProperty(change, "expectedVersion") ?? -2) + 1 &&
            stringProperty(item, "action") === "set-quantity",
        );
      })
    );
  }
  const created = relationships.filter(
    (item: unknown) =>
      item && typeof item === "object" && stringProperty(item, "action") === "create",
  );
  const removed = relationships.filter(
    (item: unknown) =>
      item && typeof item === "object" && stringProperty(item, "action") === "remove",
  );
  const hasTarget = command.action === "create-child" || command.targetObjectId !== null;
  if (
    created.length !== (hasTarget ? 1 : 0) ||
    removed.length !== (command.previousRelationshipId ? 1 : 0)
  )
    return false;
  if (command.action === "create-child") {
    if (
      objects.length !== 1 ||
      !objects.every(
        (item: unknown) =>
          item &&
          typeof item === "object" &&
          actor(item) &&
          stringProperty(item, "objectId") === command.objectId &&
          numberProperty(item, "version") === 1 &&
          stringProperty(item, "action") === "create",
      )
    )
      return false;
  } else if (objects.length !== 0) return false;
  return relationships.every((item: unknown) => {
    if (!item || typeof item !== "object" || !actor(item)) return false;
    if (stringProperty(item, "action") === "remove")
      return (
        stringProperty(item, "relationshipId") === command.previousRelationshipId &&
        Reflect.get(item, "active") === false
      );
    const source =
      command.action === "create-child"
        ? command.parentObjectId
        : command.action === "set-parent"
          ? command.targetObjectId
          : command.objectId;
    const target =
      command.action === "set-parent" || command.action === "create-child"
        ? command.objectId
        : command.targetObjectId;
    return (
      stringProperty(item, "relationshipId") === command.relationshipId &&
      numberProperty(item, "version") === 1 &&
      stringProperty(item, "sourceObjectId") === source &&
      stringProperty(item, "targetObjectId") === target &&
      stringProperty(item, "kind") === command.kind &&
      Reflect.get(item, "active") === true
    );
  });
}
