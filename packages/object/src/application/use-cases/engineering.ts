import type {
  ObjectCommandReceipt,
  ObjectTreeDto,
  StructureDto,
} from "../../contracts/dto/objects.js";
import type {
  ObjectReads,
  ObjectTransaction,
  ObjectTransactions,
} from "../../contracts/output/objects.js";
import {
  createMeasure,
  type EngineeringGraph,
  engineeringScope,
  engineeringTotals,
  isStructural,
  observeEngineering,
  quantityUnits,
  quantityValue,
  requireObserved,
  validateEngineering,
  validateQuantity,
} from "../../domain/engineering.js";
import { ObjectError } from "../../domain/error.js";
import { type ObjectRevision, reviseObject } from "../../domain/object.js";
import { canEditObject, canManageObjectTypes } from "../../domain/policies/access.js";
import { reviseRelationship } from "../../domain/relationship.js";
import { parseEngineeringCommand } from "../engineering-commands.js";
import { measureDto, objectDto, relationshipDto, structureNodeDto } from "../object-dto.js";
import { objectId, optionalIdCursor, repositoryId } from "../queries.js";

export async function validateQuantitySource(
  tx: ObjectTransaction,
  quantity: { sourceReference: { objectId: string; revisionId: string } | null },
) {
  const source = quantity.sourceReference;
  if (!source) return;
  const current = await tx.loadObject(source.objectId);
  const revision = await tx.loadObjectRevision(source.objectId, source.revisionId);
  if (!current || !revision)
    throw new ObjectError(404, "找不到同一 Repository 的固定來源 Revision。", "NOT_FOUND");
  if (current.archived)
    throw new ObjectError(409, "封存的 Object 不可新增來源引用。", "OBJECT_ARCHIVED");
}

export function createEngineering(deps: {
  reads: ObjectReads;
  transactions: ObjectTransactions;
  now(): number;
}) {
  return {
    async tree(
      userId: string,
      query: { repositoryId: string; parentId?: string; after?: string; includeArchived?: boolean },
    ): Promise<ObjectTreeDto> {
      return deps.reads.listTree(userId, {
        repositoryId: repositoryId(query.repositoryId),
        ...(query.parentId === undefined ? {} : { parentId: objectId(query.parentId) }),
        ...(query.after === undefined ? {} : { after: optionalIdCursor(query.after) }),
        ...(query.includeArchived === undefined ? {} : { includeArchived: query.includeArchived }),
      });
    },
    async listMeasures(userId: string, query: { repositoryId: string; after?: string }) {
      const page = await deps.reads.listMeasures(userId, {
        repositoryId: repositoryId(query.repositoryId),
        ...(query.after === undefined ? {} : { after: optionalIdCursor(query.after) }),
      });
      return { items: page.items.map(measureDto), next: page.next };
    },
    async structure(
      userId: string,
      query: {
        repositoryId: string;
        rootId: string;
        parentId?: string;
        after?: string;
        groupBy?: string;
      },
    ): Promise<StructureDto> {
      const rootId = objectId(query.rootId);
      const parentId = query.parentId === undefined ? rootId : objectId(query.parentId);
      const after = query.after === undefined ? undefined : optionalIdCursor(query.after);
      if (query.groupBy !== undefined && query.groupBy !== "location" && query.groupBy !== "type")
        throw new ObjectError(400, "工程分組不正確。", "INVALID_INPUT");
      const graph = await deps.reads.engineeringGraph(userId, repositoryId(query.repositoryId));
      const ids = engineeringScope(graph, rootId);
      if (!ids.has(parentId))
        throw new ObjectError(404, "父節點不在此工程範圍。", "STRUCTURE_SCOPE_CHANGED");
      const parent = graph.objects.find((object) => object.objectId === parentId);
      if (!parent) throw new ObjectError(404, "找不到父節點。", "NOT_FOUND");
      const parentEdge = graph.edges.find(
        (edge) => isStructural(edge.kind) && edge.targetObjectId === parentId,
      );
      const locationEdge = graph.edges.find(
        (edge) => edge.kind === "LOCATED_IN" && edge.sourceObjectId === parentId,
      );
      const children = graph.edges.filter(
        (edge) => isStructural(edge.kind) && edge.sourceObjectId === parentId,
      );
      const byChild = new Map(children.map((edge) => [edge.targetObjectId, edge]));
      const hasChildren = new Set(
        graph.edges.filter((edge) => isStructural(edge.kind)).map((edge) => edge.sourceObjectId),
      );
      const nodes = graph.objects
        .filter(
          (object) =>
            byChild.has(object.objectId) && (after === undefined || object.objectId > after),
        )
        .sort((a, b) => a.objectId.localeCompare(b.objectId))
        .slice(0, 51)
        .map((object) =>
          structureNodeDto(object, byChild.get(object.objectId), hasChildren.has(object.objectId)),
        );
      const allocated = children
        .filter((edge) => edge.kind === "ALLOCATES")
        .reduce(
          (sum, edge) =>
            sum +
            quantityUnits(
              graph.objects.find((object) => object.objectId === edge.targetObjectId)?.quantity
                ?.value ?? "0",
            ),
          0n,
        );
      return {
        rootId,
        parentId,
        basis: parent?.quantity ?? null,
        allocated: parent?.quantity ? quantityValue(allocated) : null,
        remaining: parent?.quantity
          ? quantityValue(quantityUnits(parent.quantity.value) - allocated)
          : null,
        nodes: {
          items: nodes.slice(0, 50),
          next: nodes.length > 50 ? (nodes[49]?.objectId ?? null) : null,
        },
        node: structureNodeDto(parent, parentEdge, hasChildren.has(parentId)),
        parentObjectId: parentEdge?.sourceObjectId ?? null,
        location: locationEdge
          ? {
              objectId: locationEdge.targetObjectId,
              name:
                graph.objects.find((object) => object.objectId === locationEdge.targetObjectId)
                  ?.name ?? "位置",
              relationshipId: locationEdge.relationshipId,
              version: locationEdge.version,
            }
          : null,
        observed: observeEngineering(graph, [
          parentId,
          ...nodes.slice(0, 50).map((node) => node.objectId),
        ]),
        measures: graph.measures.map(measureDto),
        groups: engineeringTotals(graph, rootId, query.groupBy === "type" ? "type" : "location"),
      };
    },
    async executeEngineering(
      userId: string,
      raw: unknown,
    ): Promise<Extract<ObjectCommandReceipt, { kind: "engineering" }>> {
      const command = parseEngineeringCommand(raw);
      return deps.transactions.transact(
        userId,
        {
          repositoryId: command.repositoryId,
          requestId: command.requestId,
          payload: JSON.stringify(command),
        },
        async (tx) => {
          if (
            command.action === "create-measure"
              ? !canManageObjectTypes(tx.scope.permissions)
              : !canEditObject(tx.scope.permissions)
          )
            throw new ObjectError(403, "沒有此工程操作權限。", "FORBIDDEN");
          const replay = await tx.replay();
          if (replay) {
            if (replay.kind !== "engineering")
              throw new ObjectError(503, "工程回執種類不正確。", "UNAVAILABLE");
            return replay;
          }
          if (tx.scope.archived)
            throw new ObjectError(409, "封存的 Repository 不可變更工程。", "LIFECYCLE_CONFLICT");
          const result: {
            repositoryId: string;
            objects: ReturnType<typeof objectDto>[];
            relationships: ReturnType<typeof relationshipDto>[];
            measure: ReturnType<typeof createMeasure> | null;
          } = {
            repositoryId: tx.scope.repositoryId,
            objects: [],
            relationships: [],
            measure: null,
          };
          if (command.action === "create-measure") {
            const measure = createMeasure({
              id: command.measureId,
              repositoryId: tx.scope.repositoryId,
              name: command.name,
              subject: command.subject,
              unit: command.unit,
              createdAt: deps.now(),
            });
            await tx.saveMeasure(measure);
            result.measure = measureDto(measure);
          } else {
            const graph = await tx.engineeringGraph();
            if (command.action === "create-child") {
              requireObserved(graph, [command.parentObjectId], command.observed);
              const parent = graph.objects.find(
                (object) => object.objectId === command.parentObjectId,
              );
              if (!parent) throw new ObjectError(404, "找不到父 Object。", "NOT_FOUND");
              if (parent.archived)
                throw new ObjectError(409, "封存的 Object 不可新增子範圍。", "OBJECT_ARCHIVED");
              const type = await tx.loadType(command.typeId);
              if (!type?.enabled)
                throw new ObjectError(409, "Object Type 不可新增指派。", "LIFECYCLE_CONFLICT");
              const measure = graph.measures.find(
                (measure) => measure.id === command.quantity?.measureId,
              );
              if (command.quantity && !measure)
                throw new ObjectError(404, "找不到計量定義。", "NOT_FOUND");
              const quantity =
                command.quantity && measure ? validateQuantity(command.quantity, measure) : null;
              if (quantity) await validateQuantitySource(tx, quantity);
              const current = await tx.loadObject(command.objectId);
              const next = reviseObject(
                current,
                {
                  action: "create",
                  name: command.name,
                  content: command.content,
                  typeId: command.typeId,
                  quantity,
                },
                {
                  id: tx.nextId(),
                  objectId: command.objectId,
                  repositoryId: tx.scope.repositoryId,
                  actorUserId: userId,
                  expectedVersion: 0,
                  at: deps.now(),
                  typeName: type.name,
                },
              );
              const edge = reviseRelationship(
                null,
                {
                  action: "create",
                  sourceObjectId: parent.objectId,
                  targetObjectId: next.objectId,
                  name: command.kind,
                  kind: command.kind,
                },
                {
                  id: tx.nextId(),
                  relationshipId: command.relationshipId,
                  repositoryId: tx.scope.repositoryId,
                  actorUserId: userId,
                  expectedVersion: 0,
                  at: deps.now(),
                },
              );
              validateEngineering({
                ...graph,
                objects: [
                  ...graph.objects,
                  {
                    objectId: next.objectId,
                    revisionId: next.id,
                    version: next.version,
                    name: next.name,
                    typeId: next.typeId,
                    typeName: next.typeName,
                    archived: next.archived,
                    quantity: next.quantity ?? null,
                  },
                ],
                edges: [
                  ...graph.edges,
                  {
                    relationshipId: edge.relationshipId,
                    version: edge.version,
                    sourceObjectId: edge.sourceObjectId,
                    targetObjectId: edge.targetObjectId,
                    kind: edge.kind ?? "REFERENCE",
                  },
                ],
              });
              await tx.saveObject(next, 0);
              await tx.saveRelationship(edge, 0);
              result.objects.push(objectDto(next));
              result.relationships.push(relationshipDto(edge));
            } else if (command.action === "set-quantities") {
              requireObserved(
                graph,
                command.changes.map((change) => change.objectId),
                command.observed,
              );
              const nextObjects: ObjectRevision[] = [];
              for (const change of command.changes) {
                const current = await tx.loadObject(change.objectId);
                if (!current) throw new ObjectError(404, "找不到 Object。", "NOT_FOUND");
                const measure = change.quantity
                  ? graph.measures.find((measure) => measure.id === change.quantity?.measureId)
                  : null;
                if (change.quantity && !measure)
                  throw new ObjectError(404, "找不到計量定義。", "NOT_FOUND");
                const quantity =
                  change.quantity && measure ? validateQuantity(change.quantity, measure) : null;
                if (
                  quantity &&
                  JSON.stringify(current.quantity?.sourceReference ?? null) !==
                    JSON.stringify(quantity.sourceReference)
                )
                  await validateQuantitySource(tx, quantity);
                const type = await tx.loadType(current.typeId);
                if (!type) throw new ObjectError(404, "找不到 Object Type。", "NOT_FOUND");
                nextObjects.push(
                  reviseObject(
                    current,
                    { action: "set-quantity", quantity },
                    {
                      id: tx.nextId(),
                      objectId: current.objectId,
                      repositoryId: tx.scope.repositoryId,
                      actorUserId: userId,
                      expectedVersion: change.expectedVersion,
                      at: deps.now(),
                      typeName: type.name,
                    },
                  ),
                );
              }
              const quantities = new Map(
                nextObjects.map((object) => [object.objectId, object.quantity ?? null]),
              );
              validateEngineering({
                ...graph,
                objects: graph.objects.map((object) =>
                  quantities.has(object.objectId)
                    ? { ...object, quantity: quantities.get(object.objectId) ?? null }
                    : object,
                ),
              });
              for (const next of nextObjects) {
                await tx.saveObject(next, next.version - 1);
                result.objects.push(objectDto(next));
              }
            } else {
              const parentChange = command.action === "set-parent";
              const touched = [
                command.objectId,
                ...(command.targetObjectId ? [command.targetObjectId] : []),
              ];
              requireObserved(graph, touched, command.observed);
              const currentObject = graph.objects.find(
                (object) => object.objectId === command.objectId,
              );
              if (!currentObject) throw new ObjectError(404, "找不到 Object。", "NOT_FOUND");
              if (currentObject.version !== command.expectedVersion)
                throw new ObjectError(409, "Object 版本衝突。", "VERSION_CONFLICT");
              const previous = graph.edges.find((edge) =>
                parentChange
                  ? isStructural(edge.kind) && edge.targetObjectId === command.objectId
                  : edge.kind === "LOCATED_IN" && edge.sourceObjectId === command.objectId,
              );
              if ((previous?.relationshipId ?? null) !== command.previousRelationshipId)
                throw new ObjectError(409, "工程關係已變更。", "VERSION_CONFLICT");
              if (!previous && !command.targetObjectId)
                throw new ObjectError(409, "工程關係沒有變更。", "LIFECYCLE_CONFLICT");
              const target = command.targetObjectId
                ? graph.objects.find((object) => object.objectId === command.targetObjectId)
                : null;
              if (command.targetObjectId && !target)
                throw new ObjectError(404, "找不到目標 Object。", "NOT_FOUND");
              if (target && (target.archived || currentObject.archived))
                throw new ObjectError(409, "封存的 Object 不可新增工程關係。", "OBJECT_ARCHIVED");
              if (target?.objectId === currentObject.objectId)
                throw new ObjectError(409, "Object 不可關聯自己。", "LIFECYCLE_CONFLICT");
              const context = {
                repositoryId: tx.scope.repositoryId,
                actorUserId: userId,
                at: deps.now(),
              };
              const removed = previous ? await tx.loadRelationship(previous.relationshipId) : null;
              if (previous && !removed)
                throw new ObjectError(409, "工程關係已變更。", "VERSION_CONFLICT");
              const removal = removed
                ? reviseRelationship(
                    removed,
                    { action: "remove" },
                    {
                      ...context,
                      id: tx.nextId(),
                      relationshipId: removed.relationshipId,
                      expectedVersion: removed.version,
                    },
                  )
                : null;
              const created = target
                ? reviseRelationship(
                    null,
                    {
                      action: "create",
                      sourceObjectId: parentChange ? target.objectId : currentObject.objectId,
                      targetObjectId: parentChange ? currentObject.objectId : target.objectId,
                      name: command.kind,
                      kind: command.kind,
                    },
                    {
                      ...context,
                      id: tx.nextId(),
                      relationshipId: command.relationshipId,
                      expectedVersion: 0,
                    },
                  )
                : null;
              const nextGraph: EngineeringGraph = {
                ...graph,
                edges: [
                  ...graph.edges.filter((edge) => edge.relationshipId !== previous?.relationshipId),
                  ...(created
                    ? [
                        {
                          relationshipId: created.relationshipId,
                          version: created.version,
                          sourceObjectId: created.sourceObjectId,
                          targetObjectId: created.targetObjectId,
                          kind: created.kind ?? "REFERENCE",
                        },
                      ]
                    : []),
                ],
              };
              validateEngineering(nextGraph);
              if (removal) {
                await tx.saveRelationship(removal, removal.version - 1);
                result.relationships.push(relationshipDto(removal));
              }
              if (created) {
                await tx.saveRelationship(created, 0);
                result.relationships.push(relationshipDto(created));
              }
            }
          }
          const receipt = { requestId: command.requestId, kind: "engineering" as const, result };
          await tx.record(receipt);
          return receipt;
        },
      );
    },
  };
}
