import type { EngineeringGraph, ObjectMeasure } from "../../domain/engineering.js";
import type { ObjectRevision } from "../../domain/object.js";
import type { ObjectType } from "../../domain/object-type.js";
import type { ObjectRelationshipRevision } from "../../domain/relationship.js";
import type {
  CursorPage,
  ObjectCommandReceipt,
  ObjectRelationshipRevisionDto,
  ObjectRevisionDifference,
  ObjectRevisionDto,
  ObjectSummaryDto,
  ObjectTreeDto,
  ObjectTypeDto,
} from "../dto/objects.js";

export interface ObjectReads {
  listTree(
    userId: string,
    query: { repositoryId: string; parentId?: string; after?: string; includeArchived?: boolean },
  ): Promise<ObjectTreeDto>;
  engineeringGraph(userId: string, repositoryId: string): Promise<EngineeringGraph>;
  listMeasures(
    userId: string,
    query: { repositoryId: string; after?: string },
  ): Promise<CursorPage<ObjectMeasure>>;
  listTypes(
    userId: string,
    query: { repositoryId: string; after?: string },
  ): Promise<CursorPage<ObjectTypeDto>>;
  listObjects(
    userId: string,
    query: { repositoryId: string; after?: string; typeId?: string; archived?: boolean },
  ): Promise<CursorPage<ObjectSummaryDto>>;
  readObject(
    userId: string,
    query: { repositoryId: string; objectId: string; revisionId?: string },
  ): Promise<ObjectRevisionDto>;
  history(
    userId: string,
    query: { repositoryId: string; objectId: string; before?: number },
  ): Promise<CursorPage<ObjectRevisionDto>>;
  listRelationships(
    userId: string,
    query: { repositoryId: string; objectId: string; after?: string },
  ): Promise<CursorPage<ObjectRelationshipRevisionDto>>;
  relationshipHistory(
    userId: string,
    query: { repositoryId: string; relationshipId: string; before?: number },
  ): Promise<CursorPage<ObjectRelationshipRevisionDto>>;
  compareObjectRevisions(
    userId: string,
    query: { repositoryId: string; objectId: string; beforeId: string; afterId: string },
  ): Promise<readonly ObjectRevisionDifference[]>;
}

export interface ObjectTransaction {
  readonly scope: { repositoryId: string; permissions: readonly string[]; archived: boolean };
  nextId(): string;
  engineeringGraph(): Promise<EngineeringGraph>;
  saveMeasure(measure: ObjectMeasure): Promise<void>;
  replay(): Promise<ObjectCommandReceipt | null>;
  loadType(typeId: string): Promise<ObjectType | null>;
  saveType(next: ObjectType, expectedVersion: number): Promise<void>;
  loadObject(objectId: string): Promise<ObjectRevision | null>;
  loadObjectRevision(objectId: string, revisionId: string): Promise<ObjectRevision | null>;
  saveObject(next: ObjectRevision, expectedVersion: number): Promise<void>;
  lockObjects(objectIds: readonly string[]): Promise<readonly ObjectRevision[]>;
  loadRelationship(relationshipId: string): Promise<ObjectRelationshipRevision | null>;
  saveRelationship(next: ObjectRelationshipRevision, expectedVersion: number): Promise<void>;
  record(receipt: ObjectCommandReceipt): Promise<void>;
}

export interface ObjectTransactions {
  transact<T>(
    userId: string,
    evidence: Readonly<{ repositoryId: string; requestId: string; payload: string }>,
    operation: (tx: ObjectTransaction) => Promise<T>,
  ): Promise<T>;
}
