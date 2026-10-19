import type { ObservedEngineering, Quantity, RelationshipKind } from "../../domain/engineering.js";

export type { Quantity, RelationshipKind } from "../../domain/engineering.js";

export type ObjectMeasureDto = Readonly<{
  id: string;
  repositoryId: string;
  name: string;
  subject: string;
  unit: "m" | "pcs";
  createdAt: number;
}>;
export type ObjectTypeDto = Readonly<{
  id: string;
  repositoryId: string;
  name: string;
  description: string;
  enabled: boolean;
  version: number;
  createdAt: number;
  updatedAt: number;
}>;

type ObjectRevisionAction =
  | "create"
  | "edit"
  | "reclassify"
  | "archive"
  | "unarchive"
  | "restore"
  | "set-quantity";

export type ObjectRevisionDto = Readonly<{
  id: string;
  objectId: string;
  repositoryId: string;
  version: number;
  parentRevisionId: string | null;
  actorUserId: string;
  at: number;
  action: ObjectRevisionAction;
  typeId: string;
  typeName: string;
  name: string;
  content: string;
  archived: boolean;
  quantity?: Quantity | null;
}>;

export type ObjectSummaryDto = Readonly<{
  objectId: string;
  repositoryId: string;
  revisionId: string;
  version: number;
  typeId: string;
  typeName: string;
  name: string;
  archived: boolean;
  updatedAt: number;
}>;

type ObjectRelationshipAction = "create" | "rename" | "remove";
export type ObjectRelationshipRevisionDto = Readonly<{
  id: string;
  relationshipId: string;
  repositoryId: string;
  version: number;
  parentRevisionId: string | null;
  actorUserId: string;
  at: number;
  action: ObjectRelationshipAction;
  sourceObjectId: string;
  targetObjectId: string;
  name: string;
  active: boolean;
  kind?: RelationshipKind;
}>;

export type ObjectCommandReceipt =
  | Readonly<{ requestId: string; kind: "type"; result: ObjectTypeDto }>
  | Readonly<{ requestId: string; kind: "object"; result: ObjectRevisionDto }>
  | Readonly<{ requestId: string; kind: "relationship"; result: ObjectRelationshipRevisionDto }>
  | Readonly<{ requestId: string; kind: "engineering"; result: EngineeringResultDto }>;

type EngineeringResultDto = Readonly<{
  repositoryId: string;
  objects: readonly ObjectRevisionDto[];
  relationships: readonly ObjectRelationshipRevisionDto[];
  measure: ObjectMeasureDto | null;
}>;
export type StructureNodeDto = Readonly<{
  objectId: string;
  revisionId: string;
  version: number;
  name: string;
  typeId: string;
  typeName: string;
  archived: boolean;
  quantity: Quantity | null;
  relationship: Readonly<{
    relationshipId: string;
    version: number;
    kind: RelationshipKind;
  }> | null;
  hasChildren: boolean;
}>;
export type StructureDto = Readonly<{
  rootId: string;
  parentId: string;
  basis: Quantity | null;
  allocated: string | null;
  remaining: string | null;
  nodes: CursorPage<StructureNodeDto>;
  node: StructureNodeDto;
  parentObjectId: string | null;
  location: Readonly<{
    objectId: string;
    name: string;
    relationshipId: string;
    version: number;
  }> | null;
  observed: ObservedEngineering;
  measures: readonly ObjectMeasureDto[];
  groups: readonly Readonly<{
    key: string;
    name: string;
    measureId: string;
    purpose: Quantity["purpose"];
    value: string;
  }>[];
}>;

export type CursorPage<T> = Readonly<{ items: readonly T[]; next: string | null }>;
export type ObjectRevisionDifference = Readonly<{
  field: "typeId" | "typeName" | "name" | "content" | "archived" | "quantity";
  before: string | boolean;
  after: string | boolean;
}>;
