import type {
  Quantity,
  StructureDto,
  StructureNodeDto,
} from "@line_bot_v1/object/contracts/dto/objects";
import {
  booleanValue,
  literalValue,
  nullableString,
  numberValue,
  record,
  stringValue,
} from "@line_bot_v1/platform/validation";

export function quantityView(value: unknown): Quantity | null {
  if (value === undefined || value === null) return null;
  const v = record(value);
  const source = v.sourceReference === null ? null : record(v.sourceReference);
  return {
    measureId: stringValue(v.measureId),
    value: stringValue(v.value),
    purpose: literalValue(v.purpose, ["REFERENCE", "PLANNED"]),
    sourceReference: source
      ? { objectId: stringValue(source.objectId), revisionId: stringValue(source.revisionId) }
      : null,
  };
}
function list<T>(value: unknown, decode: (value: unknown) => T): T[] {
  if (!Array.isArray(value)) throw new Error("工程清單格式不正確。");
  return value.map(decode);
}
function node(value: unknown): StructureNodeDto {
  const v = record(value);
  const edge = v.relationship === null ? null : record(v.relationship);
  return {
    objectId: stringValue(v.objectId),
    revisionId: stringValue(v.revisionId),
    version: numberValue(v.version),
    name: stringValue(v.name),
    typeId: stringValue(v.typeId),
    typeName: stringValue(v.typeName),
    archived: booleanValue(v.archived),
    quantity: quantityView(v.quantity),
    hasChildren: booleanValue(v.hasChildren),
    relationship: edge
      ? {
          relationshipId: stringValue(edge.relationshipId),
          version: numberValue(edge.version),
          kind: literalValue(edge.kind, ["REFERENCE", "INCLUDES", "ALLOCATES", "LOCATED_IN"]),
        }
      : null,
  };
}
export function structureView(value: unknown): StructureDto {
  const v = record(value);
  const nodes = record(v.nodes);
  const observed = record(v.observed);
  const location = v.location === null ? null : record(v.location);
  return {
    rootId: stringValue(v.rootId),
    parentId: stringValue(v.parentId),
    basis: quantityView(v.basis),
    allocated: nullableString(v.allocated),
    remaining: nullableString(v.remaining),
    node: node(v.node),
    parentObjectId: nullableString(v.parentObjectId),
    location: location
      ? {
          objectId: stringValue(location.objectId),
          name: stringValue(location.name),
          relationshipId: stringValue(location.relationshipId),
          version: numberValue(location.version),
        }
      : null,
    nodes: { items: list(nodes.items, node), next: nullableString(nodes.next) },
    observed: {
      objects: list(observed.objects, (value) => {
        const v = record(value);
        return { objectId: stringValue(v.objectId), version: numberValue(v.version) };
      }),
      relationships: list(observed.relationships, (value) => {
        const v = record(value);
        return {
          relationshipId: stringValue(v.relationshipId),
          version: numberValue(v.version),
          sourceObjectId: stringValue(v.sourceObjectId),
          targetObjectId: stringValue(v.targetObjectId),
          kind: literalValue(v.kind, ["INCLUDES", "ALLOCATES", "LOCATED_IN"]),
        };
      }),
    },
    measures: list(v.measures, (value) => {
      const v = record(value);
      return {
        id: stringValue(v.id),
        repositoryId: stringValue(v.repositoryId),
        name: stringValue(v.name),
        subject: stringValue(v.subject),
        unit: literalValue(v.unit, ["m", "pcs"]),
        createdAt: numberValue(v.createdAt),
      };
    }),
    groups: list(v.groups, (value) => {
      const v = record(value);
      return {
        key: stringValue(v.key),
        name: stringValue(v.name),
        measureId: stringValue(v.measureId),
        purpose: literalValue(v.purpose, ["REFERENCE", "PLANNED"]),
        value: stringValue(v.value),
      };
    }),
  };
}

/** Joining independently read pages must never silently refresh an already observed fact. */
export function mergeEngineeringObservations(
  first: StructureDto["observed"],
  second: StructureDto["observed"],
): StructureDto["observed"] {
  const objects = new Map(first.objects.map((object) => [object.objectId, object]));
  const relationships = new Map(first.relationships.map((edge) => [edge.relationshipId, edge]));
  const conflict = () => Object.assign(new Error("工程基準已變更，請重新讀取。"), { status: 409 });
  for (const object of second.objects) {
    const before = objects.get(object.objectId);
    if (before && before.version !== object.version) throw conflict();
    objects.set(object.objectId, object);
  }
  for (const edge of second.relationships) {
    const before = relationships.get(edge.relationshipId);
    if (
      before &&
      (before.version !== edge.version ||
        before.kind !== edge.kind ||
        before.sourceObjectId !== edge.sourceObjectId ||
        before.targetObjectId !== edge.targetObjectId)
    )
      throw conflict();
    relationships.set(edge.relationshipId, edge);
  }
  return { objects: [...objects.values()], relationships: [...relationships.values()] };
}
