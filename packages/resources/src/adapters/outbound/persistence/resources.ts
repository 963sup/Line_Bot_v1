import { createHash, randomUUID } from "node:crypto";
import {
  businessDatabase,
  type Database,
  type Sql,
  type SqlRow,
} from "@line_bot_v1/platform/postgres";
import {
  literalValue,
  numberValue,
  numericValue,
  stringValue,
} from "@line_bot_v1/platform/validation";
import { repositoryContentScope } from "@line_bot_v1/repository/postgres/content-scope";
import type { ResourceSummary } from "../../../contracts/dto/resources.js";
import type {
  ResourceReads,
  ResourceTransaction,
  ResourceTransactions,
} from "../../../contracts/output/resources.js";
import type { ResourceRevision } from "../../../domain/resource.js";
import { ResourceError } from "../../../domain/resource-error.js";

function decodeResourceRevision(row: SqlRow): ResourceRevision {
  return {
    id: stringValue(row.id),
    resourceId: stringValue(row.resource_id),
    repositoryId: stringValue(row.repository_id),
    version: numberValue(row.version),
    parentRevisionId: row.parent_revision_id === null ? null : stringValue(row.parent_revision_id),
    actorUserId: stringValue(row.actor_user_id),
    at: Number(numericValue(row.at)),
    action: literalValue(row.action, ["create", "edit", "archive", "unarchive"]),
    kind: literalValue(row.kind, ["LOCATION", "EQUIPMENT", "MATERIAL"]),
    name: stringValue(row.name),
    description: stringValue(row.description),
    state: literalValue(row.state, ["ACTIVE", "ARCHIVED"]),
  };
}

async function readResourceRevision(
  sql: Sql,
  repositoryId: string,
  resourceId: string,
  revisionId?: string,
): Promise<ResourceRevision | null> {
  const row = (
    await sql.query(
      revisionId === undefined
        ? `SELECT revision.*
           FROM repository_resources resource
           JOIN resource_revisions revision
             ON revision.resource_id=resource.id AND revision.id=resource.head_revision_id
           WHERE resource.repository_id=$1 AND resource.id=$2`
        : `SELECT * FROM resource_revisions
           WHERE repository_id=$1 AND resource_id=$2 AND id=$3`,
      revisionId === undefined
        ? [repositoryId, resourceId]
        : [repositoryId, resourceId, revisionId],
      decodeResourceRevision,
    )
  ).rows[0];
  return row ?? null;
}

function persistenceError(error: unknown): never {
  if (error instanceof ResourceError) throw error;
  if (error && typeof error === "object") {
    const code = Reflect.get(error, "code");
    const constraint = String(Reflect.get(error, "constraint") ?? "");
    if (code === "23505") {
      if (constraint.includes("resource_commands_pkey"))
        throw new ResourceError(
          409,
          "Resource request identity reused with different content.",
          "REQUEST_ID_REUSED",
        );
      throw new ResourceError(409, "Resource identity already exists.", "LIFECYCLE_CONFLICT");
    }
    if (code === "23503" || code === "23514")
      throw new ResourceError(409, "Resource revision constraint failed.", "LIFECYCLE_CONFLICT");
  }
  throw error;
}

export class PostgresResources implements ResourceReads, ResourceTransactions {
  constructor(private readonly db: Database = businessDatabase()) {}

  list(userId: string, repositoryId: string, after?: string) {
    return this.db.transaction(async (sql) => {
      await repositoryContentScope(sql, userId, { repositoryId });
      const rows = (
        await sql.query(
          `SELECT resource.id,resource.version,revision.id revision_id,
                  revision.kind,revision.name,revision.state,revision.at
           FROM repository_resources resource
           JOIN resource_revisions revision
             ON revision.id=resource.head_revision_id AND revision.resource_id=resource.id
           WHERE resource.repository_id=$1 AND ($2::uuid IS NULL OR resource.id>$2)
           ORDER BY resource.id LIMIT 21`,
          [repositoryId, after ?? null],
          (row): ResourceSummary => ({
            resourceId: stringValue(row.id),
            revisionId: stringValue(row.revision_id),
            version: numberValue(row.version),
            kind: literalValue(row.kind, ["LOCATION", "EQUIPMENT", "MATERIAL"]),
            name: stringValue(row.name),
            state: literalValue(row.state, ["ACTIVE", "ARCHIVED"]),
            updatedAt: Number(numericValue(row.at)),
          }),
        )
      ).rows;
      const resources = rows.slice(0, 20);
      return {
        resources,
        next: rows.length > 20 ? (resources.at(-1)?.resourceId ?? null) : null,
      };
    });
  }

  read(
    userId: string,
    query: Readonly<{ repositoryId: string; resourceId: string; revisionId?: string }>,
  ) {
    return this.db.transaction(async (sql) => {
      await repositoryContentScope(sql, userId, { repositoryId: query.repositoryId });
      const found = await readResourceRevision(
        sql,
        query.repositoryId,
        query.resourceId,
        query.revisionId,
      );
      if (!found) throw new ResourceError(404, "Resource revision not found.", "NOT_FOUND");
      return found;
    });
  }

  history(
    userId: string,
    query: Readonly<{ repositoryId: string; resourceId: string }>,
    before?: number,
  ) {
    return this.db.transaction(async (sql) => {
      await repositoryContentScope(sql, userId, { repositoryId: query.repositoryId });
      if (!(await readResourceRevision(sql, query.repositoryId, query.resourceId)))
        throw new ResourceError(404, "Resource not found.", "NOT_FOUND");
      const rows = (
        await sql.query(
          `SELECT * FROM resource_revisions
           WHERE repository_id=$1 AND resource_id=$2
             AND ($3::integer IS NULL OR version<$3)
           ORDER BY version DESC LIMIT 21`,
          [query.repositoryId, query.resourceId, before ?? null],
          decodeResourceRevision,
        )
      ).rows;
      const revisions = rows.slice(0, 20);
      return {
        revisions,
        next: rows.length > 20 ? (revisions.at(-1)?.version ?? null) : null,
      };
    });
  }

  transact<T>(
    userId: string,
    scope: Readonly<{ repositoryId: string; resourceId: string }>,
    evidence: Readonly<{ requestId: string; payload: string }>,
    operation: (tx: ResourceTransaction) => Promise<T>,
  ) {
    const fingerprint = createHash("sha256").update(evidence.payload).digest("hex");
    return this.db
      .transaction(async (sql) => {
        const { repository, archived } = await repositoryContentScope(sql, userId, {
          repositoryId: scope.repositoryId,
        });
        await sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
          `resource:${userId}:${evidence.requestId}`,
        ]);
        return operation({
          scope: { repositoryId: repository.id, permissions: repository.permissions, archived },
          nextId: randomUUID,
          replay: async () => {
            const row = (
              await sql.query(
                `SELECT fingerprint,resource_id,revision_id
                 FROM resource_commands WHERE actor_user_id=$1 AND request_id=$2`,
                [userId, evidence.requestId],
                (value) => ({
                  fingerprint: stringValue(value.fingerprint),
                  resourceId: stringValue(value.resource_id),
                  revisionId: stringValue(value.revision_id),
                }),
              )
            ).rows[0];
            if (!row) return null;
            if (row.fingerprint !== fingerprint || row.resourceId !== scope.resourceId)
              throw new ResourceError(
                409,
                "Resource request identity reused with different content.",
                "REQUEST_ID_REUSED",
              );
            const revision = await readResourceRevision(
              sql,
              repository.id,
              row.resourceId,
              row.revisionId,
            );
            if (!revision)
              throw new ResourceError(503, "Resource receipt unavailable.", "UNAVAILABLE");
            return { requestId: evidence.requestId, revision };
          },
          resources: {
            load: async () => {
              await sql.query(
                `SELECT id FROM repository_resources
                 WHERE repository_id=$1 AND id=$2 FOR UPDATE`,
                [repository.id, scope.resourceId],
              );
              return readResourceRevision(sql, repository.id, scope.resourceId);
            },
            save: async (next, expectedVersion) => {
              if (next.parentRevisionId === null)
                await sql.query(
                  `INSERT INTO repository_resources(id,repository_id,kind,version,head_revision_id)
                   VALUES($1,$2,$3,$4,$5)`,
                  [next.resourceId, repository.id, next.kind, next.version, next.id],
                );
              await sql.query(
                `INSERT INTO resource_revisions(
                   id,resource_id,repository_id,version,parent_revision_id,actor_user_id,
                   at,action,kind,name,description,state
                 ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
                [
                  next.id,
                  next.resourceId,
                  repository.id,
                  next.version,
                  next.parentRevisionId,
                  next.actorUserId,
                  next.at,
                  next.action,
                  next.kind,
                  next.name,
                  next.description,
                  next.state,
                ],
              );
              if (
                next.parentRevisionId !== null &&
                !(
                  await sql.query(
                    `UPDATE repository_resources SET version=$3,head_revision_id=$4
                     WHERE id=$1 AND repository_id=$2 AND version=$5 RETURNING id`,
                    [next.resourceId, repository.id, next.version, next.id, expectedVersion],
                  )
                ).rows.length
              )
                throw new ResourceError(409, "Resource version conflict.", "VERSION_CONFLICT");
            },
          },
          record: async (next) => {
            await sql.query(
              `INSERT INTO resource_commands(
                 actor_user_id,request_id,repository_id,resource_id,fingerprint,revision_id
               ) VALUES($1,$2,$3,$4,$5,$6)`,
              [userId, evidence.requestId, repository.id, next.resourceId, fingerprint, next.id],
            );
          },
        });
      })
      .catch(persistenceError);
  }
}
