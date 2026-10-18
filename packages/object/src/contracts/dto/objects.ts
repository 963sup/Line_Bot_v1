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

type ObjectRevisionAction = "create" | "edit" | "reclassify" | "archive" | "unarchive" | "restore";

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
}>;

export type ObjectCommandReceipt = Readonly<{
  requestId: string;
  kind: "type" | "object" | "relationship";
  result: ObjectTypeDto | ObjectRevisionDto | ObjectRelationshipRevisionDto;
}>;

export type CursorPage<T> = Readonly<{ items: readonly T[]; next: string | null }>;
export type ObjectRevisionDifference = Readonly<{
  field: "typeId" | "typeName" | "name" | "content" | "archived";
  before: string | boolean;
  after: string | boolean;
}>;
