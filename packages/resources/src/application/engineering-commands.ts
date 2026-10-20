import type { ObservedEngineering, Quantity } from "../domain/engineering.js";
import { ObjectError } from "../domain/error.js";
import { objectId, repositoryId } from "./queries.js";

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ObjectError(400, "工程操作格式不正確。", "INVALID_INPUT");
  return Object.fromEntries(Object.entries(value));
}
function exact(value: Record<string, unknown>, keys: readonly string[]) {
  if (Object.keys(value).some((key) => !keys.includes(key)))
    throw new ObjectError(400, "工程操作含有未知欄位。", "INVALID_INPUT");
}
function text(value: unknown): string {
  if (typeof value !== "string")
    throw new ObjectError(400, "工程文字格式不正確。", "INVALID_INPUT");
  return value;
}
function id(value: unknown) {
  return objectId(text(value));
}
function version(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) >= 2_147_483_647)
    throw new ObjectError(400, "工程版本不正確。", "INVALID_INPUT");
  return Number(value);
}
function array(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max)
    throw new ObjectError(400, "工程清單格式或長度不正確。", "INVALID_INPUT");
  return value;
}
function parseQuantity(raw: unknown): Quantity | null {
  if (raw === null) return null;
  const value = record(raw);
  exact(value, ["measureId", "value", "purpose", "sourceReference"]);
  if (value.purpose !== "REFERENCE" && value.purpose !== "PLANNED")
    throw new ObjectError(400, "數量用途不正確。", "INVALID_INPUT");
  let sourceReference: Quantity["sourceReference"] = null;
  if (value.sourceReference !== null) {
    const source = record(value.sourceReference);
    exact(source, ["objectId", "revisionId"]);
    sourceReference = { objectId: id(source.objectId), revisionId: id(source.revisionId) };
  }
  return {
    measureId: id(value.measureId),
    value: text(value.value),
    purpose: value.purpose,
    sourceReference,
  };
}
export function parseObserved(raw: unknown): ObservedEngineering {
  const value = record(raw);
  exact(value, ["objects", "relationships"]);
  const objects = array(value.objects, 10000).map((raw) => {
    const item = record(raw);
    exact(item, ["objectId", "version"]);
    return { objectId: id(item.objectId), version: version(item.version) };
  });
  const relationships = array(value.relationships, 10000).map(
    (raw): ObservedEngineering["relationships"][number] => {
      const item = record(raw);
      exact(item, ["relationshipId", "version", "sourceObjectId", "targetObjectId", "kind"]);
      const kind = item.kind;
      if (kind !== "INCLUDES" && kind !== "ALLOCATES" && kind !== "LOCATED_IN")
        throw new ObjectError(400, "觀察關係種類不正確。", "INVALID_INPUT");
      return {
        relationshipId: id(item.relationshipId),
        version: version(item.version),
        sourceObjectId: id(item.sourceObjectId),
        targetObjectId: id(item.targetObjectId),
        kind,
      };
    },
  );
  if (
    new Set(objects.map((item) => item.objectId)).size !== objects.length ||
    new Set(relationships.map((item) => item.relationshipId)).size !== relationships.length
  )
    throw new ObjectError(400, "觀察版本不可重複。", "INVALID_INPUT");
  return { objects, relationships };
}
export function parseEngineeringCommand(raw: unknown) {
  const value = record(raw);
  const common = {
    repositoryId: repositoryId(text(value.repositoryId)),
    requestId: id(value.requestId),
    expectedVersion: version(value.expectedVersion),
  };
  const keys = ["repositoryId", "requestId", "expectedVersion", "action"];
  if (value.action === "create-measure") {
    exact(value, [...keys, "measureId", "name", "subject", "unit"]);
    if ((value.unit !== "m" && value.unit !== "pcs") || common.expectedVersion !== 0)
      throw new ObjectError(400, "計量定義單位或版本不正確。", "INVALID_INPUT");
    return {
      ...common,
      action: value.action,
      measureId: id(value.measureId),
      name: text(value.name),
      subject: text(value.subject),
      unit: value.unit,
    } as const;
  }
  if (value.action === "set-quantities") {
    exact(value, [...keys, "changes", "observed"]);
    const changes = array(value.changes, 100).map((raw) => {
      const item = record(raw);
      exact(item, ["objectId", "expectedVersion", "quantity"]);
      return {
        objectId: id(item.objectId),
        expectedVersion: version(item.expectedVersion),
        quantity: parseQuantity(item.quantity),
      };
    });
    if (
      !changes.length ||
      new Set(changes.map((item) => item.objectId)).size !== changes.length ||
      common.expectedVersion !== 0
    )
      throw new ObjectError(400, "一次須調整 1–100 個不同 Object。", "INVALID_INPUT");
    return {
      ...common,
      action: value.action,
      changes,
      observed: parseObserved(value.observed),
    } as const;
  }
  if (value.action === "create-child") {
    exact(value, [
      ...keys,
      "objectId",
      "typeId",
      "name",
      "content",
      "parentObjectId",
      "kind",
      "quantity",
      "relationshipId",
      "observed",
    ]);
    if (common.expectedVersion !== 0 || (value.kind !== "INCLUDES" && value.kind !== "ALLOCATES"))
      throw new ObjectError(400, "子 Object 種類或版本不正確。", "INVALID_INPUT");
    return {
      ...common,
      action: value.action,
      objectId: id(value.objectId),
      typeId: id(value.typeId),
      name: text(value.name),
      content: text(value.content),
      parentObjectId: id(value.parentObjectId),
      kind: value.kind,
      quantity: parseQuantity(value.quantity),
      relationshipId: id(value.relationshipId),
      observed: parseObserved(value.observed),
    } as const;
  }
  if (value.action === "set-parent" || value.action === "set-location") {
    exact(value, [
      ...keys,
      "objectId",
      "targetObjectId",
      "relationshipId",
      "previousRelationshipId",
      "kind",
      "observed",
    ]);
    const kind = value.kind;
    if (kind !== "INCLUDES" && kind !== "ALLOCATES" && kind !== "LOCATED_IN")
      throw new ObjectError(400, "工程關係種類不正確。", "INVALID_INPUT");
    if (value.action === "set-parent" ? kind === "LOCATED_IN" : kind !== "LOCATED_IN")
      throw new ObjectError(400, "工程關係種類不正確。", "INVALID_INPUT");
    return {
      ...common,
      action: value.action,
      objectId: id(value.objectId),
      targetObjectId: value.targetObjectId === null ? null : id(value.targetObjectId),
      relationshipId: id(value.relationshipId),
      previousRelationshipId:
        value.previousRelationshipId === null ? null : id(value.previousRelationshipId),
      kind,
      observed: parseObserved(value.observed),
    } as const;
  }
  throw new ObjectError(400, "工程操作不正確。", "INVALID_INPUT");
}
