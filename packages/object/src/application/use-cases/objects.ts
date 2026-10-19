import type { ObjectReads, ObjectTransactions } from "../../contracts/output/objects.js";
import { requireObserved, validateEngineering } from "../../domain/engineering.js";
import { ObjectError } from "../../domain/error.js";
import { reviseObject } from "../../domain/object.js";
import { reviseObjectType } from "../../domain/object-type.js";
import { canEditObject, canManageObjectTypes } from "../../domain/policies/access.js";
import { reviseRelationship } from "../../domain/relationship.js";
import {
  parseObjectCommand,
  parseObjectRelationshipCommand,
  parseObjectTypeCommand,
} from "../commands.js";
import { objectDto, relationshipDto, typeDto } from "../object-dto.js";
import { historyCursor, objectId, optionalIdCursor, repositoryId } from "../queries.js";
import { createEngineering, validateQuantitySource } from "./engineering.js";

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
    ...createEngineering(deps),
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
          if (replay) {
            if (replay.kind !== "type")
              throw new ObjectError(503, "Object Type 回執種類不正確。", "UNAVAILABLE");
            return replay;
          }
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
          if (replay) {
            if (replay.kind !== "object")
              throw new ObjectError(503, "Object 回執種類不正確。", "UNAVAILABLE");
            return replay;
          }
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
          if (command.action === "restore") {
            const graph = await tx.engineeringGraph();
            if (
              JSON.stringify(current?.quantity ?? null) !== JSON.stringify(next.quantity ?? null)
            ) {
              requireObserved(
                graph,
                [next.objectId],
                command.observed ?? { objects: [], relationships: [] },
              );
              if (
                next.quantity &&
                JSON.stringify(current?.quantity?.sourceReference ?? null) !==
                  JSON.stringify(next.quantity.sourceReference)
              )
                await validateQuantitySource(tx, next.quantity);
            }
            validateEngineering({
              ...graph,
              objects: graph.objects.map((item) =>
                item.objectId === next.objectId
                  ? { ...item, quantity: next.quantity ?? null }
                  : item,
              ),
            });
          }
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
          if (replay) {
            if (replay.kind !== "relationship")
              throw new ObjectError(503, "Relationship 回執種類不正確。", "UNAVAILABLE");
            return replay;
          }
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
