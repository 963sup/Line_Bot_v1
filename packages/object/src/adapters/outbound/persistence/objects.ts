import { createHash, randomUUID } from "node:crypto";
import {
  businessDatabase,
  type Database,
  type Sql,
  type SqlRow,
} from "@line_bot_v1/platform/postgres";
import {
  booleanValue,
  literalValue,
  numberValue,
  numericValue,
  stringValue,
} from "@line_bot_v1/platform/validation";
import { repositoryContentScope } from "@line_bot_v1/repository/postgres/content-scope";
import type { ObjectCommandReceipt, ObjectSummaryDto } from "../../../contracts/dto/objects.js";
import type {
  ObjectReads,
  ObjectTransaction,
  ObjectTransactions,
} from "../../../contracts/output/objects.js";
import type { Quantity } from "../../../domain/engineering.js";
import { ObjectError } from "../../../domain/error.js";
import type { ObjectRevision } from "../../../domain/object.js";
import type { ObjectType } from "../../../domain/object-type.js";
import type { ObjectRelationshipRevision } from "../../../domain/relationship.js";
import { measureRow, quantityRow, readEngineeringGraph } from "./engineering.js";
import { readObjectTree } from "./tree.js";

const objectActions = [
  "create",
  "edit",
  "reclassify",
  "archive",
  "unarchive",
  "restore",
  "set-quantity",
] as const;
const relationshipActions = ["create", "rename", "remove"] as const;

function typeRow(row: SqlRow): ObjectType {
  return {
    id: stringValue(row.id),
    repositoryId: stringValue(row.repository_id),
    name: stringValue(row.name),
    description: stringValue(row.description),
    enabled: booleanValue(row.enabled),
    version: numberValue(row.version),
    createdAt: Number(numericValue(row.created_at)),
    updatedAt: Number(numericValue(row.updated_at)),
  };
}
function objectRevision(row: SqlRow): ObjectRevision {
  return {
    id: stringValue(row.id),
    objectId: stringValue(row.object_id),
    repositoryId: stringValue(row.repository_id),
    version: numberValue(row.version),
    parentRevisionId: row.parent_revision_id === null ? null : stringValue(row.parent_revision_id),
    actorUserId: stringValue(row.actor_user_id),
    at: Number(numericValue(row.at)),
    action: literalValue(row.action, objectActions),
    typeId: stringValue(row.type_id),
    typeName: stringValue(row.type_name),
    name: stringValue(row.name),
    content: stringValue(row.content),
    archived: booleanValue(row.archived),
    quantity: quantityRow(row),
  };
}
function relationshipRevision(row: SqlRow): ObjectRelationshipRevision {
  return {
    id: stringValue(row.id),
    relationshipId: stringValue(row.relationship_id),
    repositoryId: stringValue(row.repository_id),
    version: numberValue(row.version),
    parentRevisionId: row.parent_revision_id === null ? null : stringValue(row.parent_revision_id),
    actorUserId: stringValue(row.actor_user_id),
    at: Number(numericValue(row.at)),
    action: literalValue(row.action, relationshipActions),
    sourceObjectId: stringValue(row.source_object_id),
    targetObjectId: stringValue(row.target_object_id),
    name: stringValue(row.name),
    active: booleanValue(row.active),
    kind: literalValue(row.kind ?? "REFERENCE", [
      "REFERENCE",
      "INCLUDES",
      "ALLOCATES",
      "LOCATED_IN",
    ]),
  };
}
function summary(row: SqlRow): ObjectSummaryDto {
  return {
    objectId: stringValue(row.object_id),
    repositoryId: stringValue(row.repository_id),
    revisionId: stringValue(row.revision_id),
    version: numberValue(row.version),
    typeId: stringValue(row.type_id),
    typeName: stringValue(row.type_name),
    name: stringValue(row.name),
    archived: booleanValue(row.archived),
    updatedAt: Number(numericValue(row.updated_at)),
  };
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function jsonString(value: unknown): string {
  if (typeof value !== "string") throw new ObjectError(503, "Object 回執無法讀取。", "UNAVAILABLE");
  return value;
}
function jsonNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value))
    throw new ObjectError(503, "Object 回執無法讀取。", "UNAVAILABLE");
  return value;
}
function jsonBoolean(value: unknown): boolean {
  if (typeof value !== "boolean")
    throw new ObjectError(503, "Object 回執無法讀取。", "UNAVAILABLE");
  return value;
}
function jsonParent(value: unknown): string | null {
  return value === null ? null : jsonString(value);
}
function jsonQuantity(value: unknown): Quantity | null {
  if (value === null) return null;
  if (!isRecord(value)) throw new ObjectError(503, "Object 計量回執無法讀取。", "UNAVAILABLE");
  const source = value.sourceReference;
  if (source !== null && !isRecord(source))
    throw new ObjectError(503, "Object 來源回執無法讀取。", "UNAVAILABLE");
  return {
    measureId: jsonString(value.measureId),
    value: jsonString(value.value),
    purpose: literalValue(value.purpose, ["REFERENCE", "PLANNED"]),
    sourceReference:
      source === null
        ? null
        : { objectId: jsonString(source.objectId), revisionId: jsonString(source.revisionId) },
  };
}
function receiptV2(value: Record<string, unknown>): ObjectCommandReceipt {
  if (value.family !== "objects" || !isRecord(value.result))
    throw new ObjectError(503, "Object 回執無法讀取。", "UNAVAILABLE");
  const result = value.result;
  if (result.kind !== "engineering") {
    const legacy = receipt({ ...value, receiptVersion: 1 });
    if (!isRecord(result.result))
      throw new ObjectError(503, "Object 回執無法讀取。", "UNAVAILABLE");
    if (legacy.kind === "object" && "objectId" in legacy.result)
      return {
        ...legacy,
        result: { ...legacy.result, quantity: jsonQuantity(result.result.quantity) },
      };
    if (legacy.kind === "relationship" && "relationshipId" in legacy.result)
      return {
        ...legacy,
        result: {
          ...legacy.result,
          kind: literalValue(result.result.kind, [
            "REFERENCE",
            "INCLUDES",
            "ALLOCATES",
            "LOCATED_IN",
          ]),
        },
      };
    return legacy;
  }
  const payload = result.result;
  if (
    !isRecord(payload) ||
    !Array.isArray(payload.objects) ||
    !Array.isArray(payload.relationships)
  )
    throw new ObjectError(503, "工程回執無法讀取。", "UNAVAILABLE");
  const objects = payload.objects.map((item: unknown) => {
    const decoded = receiptV2({
      receiptVersion: 2,
      family: "objects",
      result: { requestId: result.requestId, kind: "object", result: item },
    });
    if (!("objectId" in decoded.result))
      throw new ObjectError(503, "工程回執無法讀取。", "UNAVAILABLE");
    return decoded.result;
  });
  const relationships = payload.relationships.map((item: unknown) => {
    const decoded = receiptV2({
      receiptVersion: 2,
      family: "objects",
      result: { requestId: result.requestId, kind: "relationship", result: item },
    });
    if (!("relationshipId" in decoded.result))
      throw new ObjectError(503, "工程回執無法讀取。", "UNAVAILABLE");
    return decoded.result;
  });
  const measure = payload.measure;
  if (measure !== null && !isRecord(measure))
    throw new ObjectError(503, "計量回執無法讀取。", "UNAVAILABLE");
  return {
    requestId: jsonString(result.requestId),
    kind: "engineering",
    result: {
      repositoryId: jsonString(payload.repositoryId),
      objects,
      relationships,
      measure:
        measure === null
          ? null
          : {
              id: jsonString(measure.id),
              repositoryId: jsonString(measure.repositoryId),
              name: jsonString(measure.name),
              subject: jsonString(measure.subject),
              unit: literalValue(measure.unit, ["m", "pcs"]),
              createdAt: jsonNumber(measure.createdAt),
            },
    },
  };
}
function receipt(value: unknown): ObjectCommandReceipt {
  if (isRecord(value) && value.receiptVersion === 2) return receiptV2(value);
  if (
    !isRecord(value) ||
    value.receiptVersion !== 1 ||
    value.family !== "objects" ||
    !isRecord(value.result)
  )
    throw new ObjectError(503, "Object 回執無法讀取。", "UNAVAILABLE");
  const result = value.result;
  if (
    typeof result.requestId !== "string" ||
    !["type", "object", "relationship"].includes(String(result.kind)) ||
    !isRecord(result.result)
  )
    throw new ObjectError(503, "Object 回執無法讀取。", "UNAVAILABLE");
  const payload = result.result;
  if (result.kind === "type") {
    return {
      requestId: result.requestId,
      kind: "type",
      result: {
        id: jsonString(payload.id),
        repositoryId: jsonString(payload.repositoryId),
        name: jsonString(payload.name),
        description: jsonString(payload.description),
        enabled: jsonBoolean(payload.enabled),
        version: jsonNumber(payload.version),
        createdAt: jsonNumber(payload.createdAt),
        updatedAt: jsonNumber(payload.updatedAt),
      },
    };
  }
  if (result.kind === "object") {
    return {
      requestId: result.requestId,
      kind: "object",
      result: {
        id: jsonString(payload.id),
        objectId: jsonString(payload.objectId),
        repositoryId: jsonString(payload.repositoryId),
        version: jsonNumber(payload.version),
        parentRevisionId: jsonParent(payload.parentRevisionId),
        actorUserId: jsonString(payload.actorUserId),
        at: jsonNumber(payload.at),
        action: literalValue(payload.action, objectActions),
        typeId: jsonString(payload.typeId),
        typeName: jsonString(payload.typeName),
        name: jsonString(payload.name),
        content: jsonString(payload.content),
        archived: jsonBoolean(payload.archived),
      },
    };
  }
  return {
    requestId: result.requestId,
    kind: "relationship",
    result: {
      id: jsonString(payload.id),
      relationshipId: jsonString(payload.relationshipId),
      repositoryId: jsonString(payload.repositoryId),
      version: jsonNumber(payload.version),
      parentRevisionId: jsonParent(payload.parentRevisionId),
      actorUserId: jsonString(payload.actorUserId),
      at: jsonNumber(payload.at),
      action: literalValue(payload.action, relationshipActions),
      sourceObjectId: jsonString(payload.sourceObjectId),
      targetObjectId: jsonString(payload.targetObjectId),
      name: jsonString(payload.name),
      active: jsonBoolean(payload.active),
    },
  };
}
async function readObjectRevision(
  sql: Sql,
  repositoryId: string,
  objectId: string,
  revisionId?: string,
) {
  const row = (
    await sql.query(
      revisionId === undefined
        ? `SELECT r.* FROM objects o JOIN object_revisions r ON r.id=o.head_revision_id AND r.object_id=o.id
         WHERE o.repository_id=$1 AND o.id=$2`
        : "SELECT * FROM object_revisions WHERE repository_id=$1 AND object_id=$2 AND id=$3",
      revisionId === undefined ? [repositoryId, objectId] : [repositoryId, objectId, revisionId],
      objectRevision,
    )
  ).rows[0];
  return row ?? null;
}
async function readRelationshipRevision(sql: Sql, repositoryId: string, relationshipId: string) {
  const row = (
    await sql.query(
      `SELECT r.* FROM object_relationships h
     JOIN object_relationship_revisions r ON r.id=h.head_revision_id AND r.relationship_id=h.id
     WHERE h.repository_id=$1 AND h.id=$2`,
      [repositoryId, relationshipId],
      relationshipRevision,
    )
  ).rows[0];
  return row ?? null;
}

export class PostgresObjects implements ObjectReads, ObjectTransactions {
  constructor(private readonly db: Database = businessDatabase()) {}

  listTree(
    userId: string,
    query: { repositoryId: string; parentId?: string; after?: string; includeArchived?: boolean },
  ) {
    return this.db.transaction(async (sql) => {
      await repositoryContentScope(sql, userId, { repositoryId: query.repositoryId });
      return readObjectTree(sql, query);
    });
  }
  engineeringGraph(userId: string, repositoryId: string) {
    return this.db.transaction(async (sql) => {
      await repositoryContentScope(sql, userId, { repositoryId });
      return readEngineeringGraph(sql, repositoryId);
    });
  }
  listMeasures(userId: string, query: { repositoryId: string; after?: string }) {
    return this.db.transaction(async (sql) => {
      await repositoryContentScope(sql, userId, { repositoryId: query.repositoryId });
      const rows = (
        await sql.query(
          "SELECT * FROM object_measures WHERE repository_id=$1 AND ($2::uuid IS NULL OR id>$2) ORDER BY id LIMIT 51",
          [query.repositoryId, query.after ?? null],
          measureRow,
        )
      ).rows;
      return { items: rows.slice(0, 50), next: rows.length > 50 ? (rows[49]?.id ?? null) : null };
    });
  }
  listTypes(userId: string, query: { repositoryId: string; after?: string }) {
    return this.db.transaction(async (sql) => {
      await repositoryContentScope(sql, userId, { repositoryId: query.repositoryId });
      const rows = (
        await sql.query(
          `SELECT * FROM object_types WHERE repository_id=$1 AND ($2::uuid IS NULL OR id>$2)
         ORDER BY id LIMIT 51`,
          [query.repositoryId, query.after ?? null],
          typeRow,
        )
      ).rows;
      const items = rows.slice(0, 50);
      return { items, next: rows.length > 50 ? (items.at(-1)?.id ?? null) : null };
    });
  }
  listObjects(
    userId: string,
    query: { repositoryId: string; after?: string; typeId?: string; archived?: boolean },
  ) {
    return this.db.transaction(async (sql) => {
      await repositoryContentScope(sql, userId, { repositoryId: query.repositoryId });
      const rows = (
        await sql.query(
          `SELECT o.id object_id,o.repository_id,r.id revision_id,o.version,r.type_id,r.type_name,r.name,r.archived,r.at updated_at
         FROM objects o JOIN object_revisions r ON r.id=o.head_revision_id AND r.object_id=o.id
         WHERE o.repository_id=$1 AND ($2::uuid IS NULL OR o.id>$2)
           AND ($3::uuid IS NULL OR r.type_id=$3) AND ($4::boolean IS NULL OR r.archived=$4)
         ORDER BY o.id LIMIT 51`,
          [query.repositoryId, query.after ?? null, query.typeId ?? null, query.archived ?? false],
          summary,
        )
      ).rows;
      const items = rows.slice(0, 50);
      return { items, next: rows.length > 50 ? (items.at(-1)?.objectId ?? null) : null };
    });
  }
  readObject(
    userId: string,
    query: { repositoryId: string; objectId: string; revisionId?: string },
  ) {
    return this.db.transaction(async (sql) => {
      await repositoryContentScope(sql, userId, { repositoryId: query.repositoryId });
      const value = await readObjectRevision(
        sql,
        query.repositoryId,
        query.objectId,
        query.revisionId,
      );
      if (!value) throw new ObjectError(404, "找不到 Object Revision。", "NOT_FOUND");
      return value;
    });
  }
  history(userId: string, query: { repositoryId: string; objectId: string; before?: number }) {
    return this.db.transaction(async (sql) => {
      await repositoryContentScope(sql, userId, { repositoryId: query.repositoryId });
      if (!(await readObjectRevision(sql, query.repositoryId, query.objectId)))
        throw new ObjectError(404, "找不到 Object。", "NOT_FOUND");
      const rows = (
        await sql.query(
          `SELECT * FROM object_revisions WHERE repository_id=$1 AND object_id=$2
         AND ($3::integer IS NULL OR version<$3) ORDER BY version DESC LIMIT 51`,
          [query.repositoryId, query.objectId, query.before ?? null],
          objectRevision,
        )
      ).rows;
      const items = rows.slice(0, 50);
      return { items, next: rows.length > 50 ? String(items.at(-1)?.version ?? "") : null };
    });
  }
  listRelationships(
    userId: string,
    query: { repositoryId: string; objectId: string; after?: string },
  ) {
    return this.db.transaction(async (sql) => {
      await repositoryContentScope(sql, userId, { repositoryId: query.repositoryId });
      if (!(await readObjectRevision(sql, query.repositoryId, query.objectId)))
        throw new ObjectError(404, "找不到 Object。", "NOT_FOUND");
      const rows = (
        await sql.query(
          `SELECT r.* FROM object_relationships h
         JOIN object_relationship_revisions r ON r.id=h.head_revision_id AND r.relationship_id=h.id
         WHERE h.repository_id=$1 AND h.active AND (h.source_object_id=$2 OR h.target_object_id=$2)
           AND ($3::uuid IS NULL OR h.id>$3) ORDER BY h.id LIMIT 51`,
          [query.repositoryId, query.objectId, query.after ?? null],
          relationshipRevision,
        )
      ).rows;
      const items = rows.slice(0, 50);
      return { items, next: rows.length > 50 ? (items.at(-1)?.relationshipId ?? null) : null };
    });
  }
  relationshipHistory(
    userId: string,
    query: { repositoryId: string; relationshipId: string; before?: number },
  ) {
    return this.db.transaction(async (sql) => {
      await repositoryContentScope(sql, userId, { repositoryId: query.repositoryId });
      if (!(await readRelationshipRevision(sql, query.repositoryId, query.relationshipId)))
        throw new ObjectError(404, "找不到 Relationship。", "NOT_FOUND");
      const rows = (
        await sql.query(
          `SELECT * FROM object_relationship_revisions
         WHERE repository_id=$1 AND relationship_id=$2
           AND ($3::integer IS NULL OR version<$3)
         ORDER BY version DESC LIMIT 51`,
          [query.repositoryId, query.relationshipId, query.before ?? null],
          relationshipRevision,
        )
      ).rows;
      const items = rows.slice(0, 50);
      return { items, next: rows.length > 50 ? String(items.at(-1)?.version ?? "") : null };
    });
  }
  compareObjectRevisions(
    userId: string,
    query: { repositoryId: string; objectId: string; beforeId: string; afterId: string },
  ) {
    return this.db.transaction(async (sql) => {
      await repositoryContentScope(sql, userId, { repositoryId: query.repositoryId });
      const [before, after] = await Promise.all([
        readObjectRevision(sql, query.repositoryId, query.objectId, query.beforeId),
        readObjectRevision(sql, query.repositoryId, query.objectId, query.afterId),
      ]);
      if (!before || !after) throw new ObjectError(404, "找不到 Object Revision。", "NOT_FOUND");
      const contentDifferences = (
        ["typeId", "typeName", "name", "content", "archived"] as const
      ).flatMap((field) =>
        before[field] === after[field]
          ? []
          : [{ field, before: before[field], after: after[field] }],
      );
      const beforeQuantity = JSON.stringify(before.quantity ?? null);
      const afterQuantity = JSON.stringify(after.quantity ?? null);
      return [
        ...contentDifferences,
        ...(beforeQuantity === afterQuantity
          ? []
          : [{ field: "quantity" as const, before: beforeQuantity, after: afterQuantity }]),
      ];
    });
  }

  transact<T>(
    userId: string,
    evidence: Readonly<{ repositoryId: string; requestId: string; payload: string }>,
    operation: (tx: ObjectTransaction) => Promise<T>,
  ): Promise<T> {
    const fingerprint = createHash("sha256").update(evidence.payload).digest("hex");
    return this.db.transaction(async (sql) => {
      const { repository, archived } = await repositoryContentScope(sql, userId, {
        repositoryId: evidence.repositoryId,
      });
      await sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `object:${userId}:${evidence.requestId}`,
      ]);
      const tx: ObjectTransaction = {
        scope: { repositoryId: repository.id, archived, permissions: repository.permissions },
        nextId: randomUUID,
        engineeringGraph: () => readEngineeringGraph(sql, repository.id),
        saveMeasure: async (measure) => {
          await sql.query(
            "INSERT INTO object_measures(id,repository_id,name,subject,unit,created_at) VALUES($1,$2,$3,$4,$5,$6)",
            [
              measure.id,
              measure.repositoryId,
              measure.name,
              measure.subject,
              measure.unit,
              measure.createdAt,
            ],
          );
        },
        replay: async () => {
          const row = (
            await sql.query(
              "SELECT fingerprint,result FROM object_commands WHERE actor_user_id=$1 AND request_id=$2",
              [userId, evidence.requestId],
              (value) => ({ fingerprint: stringValue(value.fingerprint), result: value.result }),
            )
          ).rows[0];
          if (!row) return null;
          if (row.fingerprint !== fingerprint)
            throw new ObjectError(409, "Request ID 已用於不同 Object 操作。", "REQUEST_ID_REUSED");
          const restored = receipt(row.result);
          if (restored.requestId !== evidence.requestId)
            throw new ObjectError(503, "Object 回執無法讀取。", "UNAVAILABLE");
          return restored;
        },
        loadType: async (typeId) =>
          (
            await sql.query(
              "SELECT * FROM object_types WHERE repository_id=$1 AND id=$2 FOR UPDATE",
              [repository.id, typeId],
              typeRow,
            )
          ).rows[0] ?? null,
        saveType: async (next, expectedVersion) => {
          if (expectedVersion === 0) {
            await sql.query(
              `INSERT INTO object_types(id,repository_id,name,description,enabled,version,created_at,updated_at)
               VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
              [
                next.id,
                next.repositoryId,
                next.name,
                next.description,
                next.enabled,
                next.version,
                next.createdAt,
                next.updatedAt,
              ],
            );
            return;
          }
          const changed = await sql.query(
            `UPDATE object_types SET name=$3,description=$4,enabled=$5,version=$6,updated_at=$7
             WHERE repository_id=$1 AND id=$2 AND version=$8 RETURNING id`,
            [
              next.repositoryId,
              next.id,
              next.name,
              next.description,
              next.enabled,
              next.version,
              next.updatedAt,
              expectedVersion,
            ],
          );
          if (!changed.rows.length)
            throw new ObjectError(409, "Object Type 版本衝突。", "VERSION_CONFLICT");
        },
        loadObject: async (objectId) => {
          await sql.query("SELECT id FROM objects WHERE repository_id=$1 AND id=$2 FOR UPDATE", [
            repository.id,
            objectId,
          ]);
          return readObjectRevision(sql, repository.id, objectId);
        },
        loadObjectRevision: (objectId, revisionId) =>
          readObjectRevision(sql, repository.id, objectId, revisionId),
        saveObject: async (next, expectedVersion) => {
          if (expectedVersion === 0)
            await sql.query(
              "INSERT INTO objects(id,repository_id,version,head_revision_id) VALUES($1,$2,$3,$4)",
              [next.objectId, next.repositoryId, next.version, next.id],
            );
          await sql.query(
            `INSERT INTO object_revisions(
               id,object_id,repository_id,version,parent_revision_id,actor_user_id,at,action,
               type_id,type_name,name,content,archived,measure_id,quantity_value,quantity_purpose,source_object_id,source_revision_id
             ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::numeric,$16,$17,$18)`,
            [
              next.id,
              next.objectId,
              next.repositoryId,
              next.version,
              next.parentRevisionId,
              next.actorUserId,
              next.at,
              next.action,
              next.typeId,
              next.typeName,
              next.name,
              next.content,
              next.archived,
              next.quantity?.measureId ?? null,
              next.quantity?.value ?? null,
              next.quantity?.purpose ?? null,
              next.quantity?.sourceReference?.objectId ?? null,
              next.quantity?.sourceReference?.revisionId ?? null,
            ],
          );
          if (expectedVersion > 0) {
            const changed = await sql.query(
              "UPDATE objects SET version=$3,head_revision_id=$4 WHERE repository_id=$1 AND id=$2 AND version=$5 RETURNING id",
              [next.repositoryId, next.objectId, next.version, next.id, expectedVersion],
            );
            if (!changed.rows.length)
              throw new ObjectError(409, "Object 版本衝突。", "VERSION_CONFLICT");
          }
        },
        lockObjects: async (objectIds) => {
          const ids = [...new Set(objectIds)].sort();
          await sql.query(
            "SELECT id FROM objects WHERE repository_id=$1 AND id=ANY($2::uuid[]) ORDER BY id FOR UPDATE",
            [repository.id, ids],
          );
          const values = await Promise.all(
            ids.map((id) => readObjectRevision(sql, repository.id, id)),
          );
          return values.filter((value): value is ObjectRevision => value !== null);
        },
        loadRelationship: async (relationshipId) => {
          await sql.query(
            "SELECT id FROM object_relationships WHERE repository_id=$1 AND id=$2 FOR UPDATE",
            [repository.id, relationshipId],
          );
          return readRelationshipRevision(sql, repository.id, relationshipId);
        },
        saveRelationship: async (next, expectedVersion) => {
          if (expectedVersion === 0)
            await sql.query(
              `INSERT INTO object_relationships(
                 id,repository_id,version,head_revision_id,source_object_id,target_object_id,name,active,kind
               ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
              [
                next.relationshipId,
                next.repositoryId,
                next.version,
                next.id,
                next.sourceObjectId,
                next.targetObjectId,
                next.name,
                next.active,
                next.kind ?? "REFERENCE",
              ],
            );
          await sql.query(
            `INSERT INTO object_relationship_revisions(
               id,relationship_id,repository_id,version,parent_revision_id,actor_user_id,at,action,
               source_object_id,target_object_id,name,active,kind
             ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
            [
              next.id,
              next.relationshipId,
              next.repositoryId,
              next.version,
              next.parentRevisionId,
              next.actorUserId,
              next.at,
              next.action,
              next.sourceObjectId,
              next.targetObjectId,
              next.name,
              next.active,
              next.kind ?? "REFERENCE",
            ],
          );
          if (expectedVersion > 0) {
            const changed = await sql.query(
              `UPDATE object_relationships SET version=$3,head_revision_id=$4,source_object_id=$5,
                 target_object_id=$6,name=$7,active=$8
               WHERE repository_id=$1 AND id=$2 AND version=$9 RETURNING id`,
              [
                next.repositoryId,
                next.relationshipId,
                next.version,
                next.id,
                next.sourceObjectId,
                next.targetObjectId,
                next.name,
                next.active,
                expectedVersion,
              ],
            );
            if (!changed.rows.length)
              throw new ObjectError(409, "Relationship 版本衝突。", "VERSION_CONFLICT");
          }
        },
        record: async (result) => {
          await sql.query(
            `INSERT INTO object_commands(actor_user_id,request_id,repository_id,fingerprint,result)
             VALUES($1,$2,$3,$4,$5::jsonb)`,
            [
              userId,
              evidence.requestId,
              repository.id,
              fingerprint,
              JSON.stringify({ receiptVersion: 2, family: "objects", result }),
            ],
          );
        },
      };
      try {
        return await operation(tx);
      } catch (error) {
        const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
        const constraint =
          error && typeof error === "object" && "constraint" in error
            ? String(error.constraint)
            : "";
        if (code === "23505" && constraint.includes("object_types_repository_name"))
          throw new ObjectError(
            409,
            "Repository 已有相同名稱的 Object Type。",
            "TYPE_NAME_CONFLICT",
          );
        if (code === "23505" && constraint.includes("object_relationships_live_edge"))
          throw new ObjectError(409, "相同 Relationship 已存在。", "RELATIONSHIP_DUPLICATE");
        if (
          code === "23505" &&
          [
            "object_measures_pkey",
            "object_types_pkey",
            "objects_pkey",
            "object_revisions_pkey",
            "object_relationships_pkey",
            "object_relationship_revisions_pkey",
          ].some((name) => constraint.includes(name))
        )
          throw new ObjectError(409, "Object 識別碼或版本已存在。", "LIFECYCLE_CONFLICT");
        if (code === "23503" || code === "23514")
          throw new ObjectError(409, "Object 關係或狀態不合法。", "LIFECYCLE_CONFLICT");
        throw error;
      }
    });
  }
}
