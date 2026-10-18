import type { ObjectReads, ObjectTransactions } from "../../contracts/output/objects.js";
import { ObjectError } from "../../domain/error.js";
import { type ObjectRevision, reviseObject } from "../../domain/object.js";
import { type ObjectType, reviseObjectType } from "../../domain/object-type.js";
import { canEditObject, canManageObjectTypes } from "../../domain/policies/access.js";
import { type ObjectRelationshipRevision, reviseRelationship } from "../../domain/relationship.js";
import {
  parseObjectCommand,
  parseObjectRelationshipCommand,
  parseObjectTypeCommand,
} from "../commands.js";
import { historyCursor, objectId, optionalIdCursor, repositoryId } from "../queries.js";

const typeDto = (value: ObjectType) => ({
  id: value.id,
  repositoryId: value.repositoryId,
  name: value.name,
  description: value.description,
  enabled: value.enabled,
  version: value.version,
  createdAt: value.createdAt,
  updatedAt: value.updatedAt,
});
const objectDto = (value: ObjectRevision) => ({
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
});
const relationshipDto = (value: ObjectRelationshipRevision) => ({
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
});
function requireMutable(tx: { scope: { archived: boolean } }) {
  if (tx.scope.archived)
    throw new ObjectError(409, "封存的 Repository 不可變更 Object。", "LIFECYCLE_CONFLICT");
}

export function createObjects(deps: {
  reads: ObjectReads;
  transactions: ObjectTransactions;
  now(): number;
}) {
  return {
    listTypes: (userId: string, query: { repositoryId: string; after?: string }) =>
      deps.reads.listTypes(userId, {
        repositoryId: repositoryId(query.repositoryId),
        ...(query.after === undefined ? {} : { after: optionalIdCursor(query.after) }),
      }),
    listObjects: (
      userId: string,
      query: { repositoryId: string; after?: string; typeId?: string; archived?: boolean },
    ) =>
      deps.reads.listObjects(userId, {
        repositoryId: repositoryId(query.repositoryId),
        ...(query.after === undefined ? {} : { after: optionalIdCursor(query.after) }),
        ...(query.typeId === undefined ? {} : { typeId: objectId(query.typeId) }),
        ...(query.archived === undefined ? {} : { archived: query.archived }),
      }),
    readObject: (
      userId: string,
      query: { repositoryId: string; objectId: string; revisionId?: string },
    ) =>
      deps.reads.readObject(userId, {
        repositoryId: repositoryId(query.repositoryId),
        objectId: objectId(query.objectId),
        ...(query.revisionId === undefined ? {} : { revisionId: objectId(query.revisionId) }),
      }),
    history: (userId: string, query: { repositoryId: string; objectId: string; before?: string }) =>
      deps.reads.history(userId, {
        repositoryId: repositoryId(query.repositoryId),
        objectId: objectId(query.objectId),
        ...(query.before === undefined ? {} : { before: historyCursor(query.before) }),
      }),
    listRelationships: (
      userId: string,
      query: { repositoryId: string; objectId: string; after?: string },
    ) =>
      deps.reads.listRelationships(userId, {
        repositoryId: repositoryId(query.repositoryId),
        objectId: objectId(query.objectId),
        ...(query.after === undefined ? {} : { after: optionalIdCursor(query.after) }),
      }),
    relationshipHistory: (
      userId: string,
      query: { repositoryId: string; relationshipId: string; before?: string },
    ) =>
      deps.reads.relationshipHistory(userId, {
        repositoryId: repositoryId(query.repositoryId),
        relationshipId: objectId(query.relationshipId),
        ...(query.before === undefined ? {} : { before: historyCursor(query.before) }),
      }),
    compareRevisions: (
      userId: string,
      query: { repositoryId: string; objectId: string; beforeId: string; afterId: string },
    ) =>
      deps.reads.compareObjectRevisions(userId, {
        repositoryId: repositoryId(query.repositoryId),
        objectId: objectId(query.objectId),
        beforeId: objectId(query.beforeId),
        afterId: objectId(query.afterId),
      }),
    async executeType(userId: string, raw: unknown) {
      const command = parseObjectTypeCommand(raw);
      return deps.transactions.transact(
        userId,
        {
          repositoryId: command.repositoryId,
          requestId: command.requestId,
          payload: JSON.stringify(command),
        },
        async (tx) => {
          if (!canManageObjectTypes(tx.scope.permissions))
            throw new ObjectError(403, "管理 Object Type 需要 admin。", "FORBIDDEN");
          const replay = await tx.replay();
          if (replay) return replay;
          requireMutable(tx);
          const current = await tx.loadType(command.typeId);
          const next = reviseObjectType(current, command, {
            id: command.typeId,
            repositoryId: tx.scope.repositoryId,
            expectedVersion: command.expectedVersion,
            at: deps.now(),
          });
          await tx.saveType(next, command.expectedVersion);
          const receipt = {
            requestId: command.requestId,
            kind: "type" as const,
            result: typeDto(next),
          };
          await tx.record(receipt);
          return receipt;
        },
      );
    },
    async executeObject(userId: string, raw: unknown) {
      const command = parseObjectCommand(raw);
      return deps.transactions.transact(
        userId,
        {
          repositoryId: command.repositoryId,
          requestId: command.requestId,
          payload: JSON.stringify(command),
        },
        async (tx) => {
          if (!canEditObject(tx.scope.permissions))
            throw new ObjectError(403, "管理 Object 需要 write、maintain 或 admin。", "FORBIDDEN");
          const replay = await tx.replay();
          if (replay) return replay;
          requireMutable(tx);
          const current = await tx.loadObject(command.objectId);
          const restored =
            command.action === "restore"
              ? await tx.loadObjectRevision(command.objectId, command.revisionId)
              : null;
          const assignsType =
            command.action === "create" ||
            command.action === "reclassify" ||
            command.action === "restore";
          const requestedTypeId =
            command.action === "create" || command.action === "reclassify"
              ? command.typeId
              : command.action === "restore"
                ? restored?.typeId
                : current?.typeId;
          if (!requestedTypeId) throw new ObjectError(404, "找不到 Object Type。", "NOT_FOUND");
          const type = await tx.loadType(requestedTypeId);
          if (!type) throw new ObjectError(404, "找不到 Object Type。", "NOT_FOUND");
          if (assignsType && !type.enabled)
            throw new ObjectError(409, "停用的 Object Type 不可新增指派。", "LIFECYCLE_CONFLICT");
          const next = reviseObject(
            current,
            command,
            {
              id: tx.nextId(),
              objectId: command.objectId,
              repositoryId: tx.scope.repositoryId,
              actorUserId: userId,
              expectedVersion: command.expectedVersion,
              at: deps.now(),
              typeName: type.name,
            },
            restored,
          );
          await tx.saveObject(next, command.expectedVersion);
          const receipt = {
            requestId: command.requestId,
            kind: "object" as const,
            result: objectDto(next),
          };
          await tx.record(receipt);
          return receipt;
        },
      );
    },
    async executeRelationship(userId: string, raw: unknown) {
      const command = parseObjectRelationshipCommand(raw);
      return deps.transactions.transact(
        userId,
        {
          repositoryId: command.repositoryId,
          requestId: command.requestId,
          payload: JSON.stringify(command),
        },
        async (tx) => {
          if (!canEditObject(tx.scope.permissions))
            throw new ObjectError(
              403,
              "管理 Relationship 需要 write、maintain 或 admin。",
              "FORBIDDEN",
            );
          const replay = await tx.replay();
          if (replay) return replay;
          requireMutable(tx);
          const current = await tx.loadRelationship(command.relationshipId);
          if (command.action !== "remove") {
            const sourceObjectId =
              command.action === "create" ? command.sourceObjectId : current?.sourceObjectId;
            const targetObjectId =
              command.action === "create" ? command.targetObjectId : current?.targetObjectId;
            if (!sourceObjectId || !targetObjectId)
              throw new ObjectError(404, "找不到 Relationship。", "NOT_FOUND");
            if (sourceObjectId === targetObjectId)
              throw new ObjectError(
                409,
                "Object 不可建立指向自己的 Relationship。",
                "LIFECYCLE_CONFLICT",
              );
            const endpoints = await tx.lockObjects([sourceObjectId, targetObjectId]);
            if (endpoints.length !== 2)
              throw new ObjectError(404, "找不到 Relationship 端點。", "NOT_FOUND");
            if (endpoints.some((value) => value.archived))
              throw new ObjectError(
                409,
                "封存的 Object 不可建立 Relationship。",
                "OBJECT_ARCHIVED",
              );
          }
          const next = reviseRelationship(current, command, {
            id: tx.nextId(),
            relationshipId: command.relationshipId,
            repositoryId: tx.scope.repositoryId,
            actorUserId: userId,
            expectedVersion: command.expectedVersion,
            at: deps.now(),
          });
          await tx.saveRelationship(next, command.expectedVersion);
          const receipt = {
            requestId: command.requestId,
            kind: "relationship" as const,
            result: relationshipDto(next),
          };
          await tx.record(receipt);
          return receipt;
        },
      );
    },
  };
}
