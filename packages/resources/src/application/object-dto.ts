import type { EngineeringEdge, EngineeringObject, ObjectMeasure } from "../domain/engineering.js";
import type { ObjectRevision } from "../domain/object.js";
import type { ObjectType } from "../domain/object-type.js";
import type { ObjectRelationshipRevision } from "../domain/relationship.js";

export const typeDto = (value: ObjectType) => ({
  id: value.id,
  repositoryId: value.repositoryId,
  name: value.name,
  description: value.description,
  enabled: value.enabled,
  version: value.version,
  createdAt: value.createdAt,
  updatedAt: value.updatedAt,
});
export const objectDto = (value: ObjectRevision) => ({
  id: value.id,
  objectId: value.objectId,
  repositoryId: value.repositoryId,
  version: value.version,
  parentRevisionId: value.parentRevisionId,
  actorUserId: value.actorUserId,
  at: value.at,
  action: value.action,
  typeId: value.typeId,
  typeName: value.typeName,
  name: value.name,
  content: value.content,
  archived: value.archived,
  quantity: value.quantity ?? null,
});
export const relationshipDto = (value: ObjectRelationshipRevision) => ({
  id: value.id,
  relationshipId: value.relationshipId,
  repositoryId: value.repositoryId,
  version: value.version,
  parentRevisionId: value.parentRevisionId,
  actorUserId: value.actorUserId,
  at: value.at,
  action: value.action,
  sourceObjectId: value.sourceObjectId,
  targetObjectId: value.targetObjectId,
  name: value.name,
  active: value.active,
  kind: value.kind ?? "REFERENCE",
});

export const measureDto = (value: ObjectMeasure) => ({
  id: value.id,
  repositoryId: value.repositoryId,
  name: value.name,
  subject: value.subject,
  unit: value.unit,
  createdAt: value.createdAt,
});
export const structureNodeDto = (
  value: EngineeringObject,
  edge: EngineeringEdge | undefined,
  hasChildren: boolean,
) => ({
  objectId: value.objectId,
  revisionId: value.revisionId,
  version: value.version,
  name: value.name,
  typeId: value.typeId,
  typeName: value.typeName,
  archived: value.archived,
  quantity: value.quantity,
  relationship: edge
    ? { relationshipId: edge.relationshipId, version: edge.version, kind: edge.kind }
    : null,
  hasChildren,
});
