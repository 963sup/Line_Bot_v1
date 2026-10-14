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
import type { WikiCommand, WikiQuery } from "../../../contracts/dto/wiki.js";
import type { WikiStore, WikiTransaction } from "../../../contracts/repositories/wiki-pages.js";
import { WikiError } from "../../../domain/wiki-error.js";
import type { WikiRevision } from "../../../domain/wiki-page.js";

function decode(row: SqlRow): WikiRevision {
  return {
    id: stringValue(row.id),
    pageId: stringValue(row.page_id),
    repositoryId: stringValue(row.repository_id),
    version: numberValue(row.version),
    parentRevisionId: row.parent_revision_id === null ? null : stringValue(row.parent_revision_id),
    actorUserId: stringValue(row.actor_user_id),
    at: Number(numericValue(row.at)),
    action: literalValue(row.action, ["create", "edit", "rename", "archive", "restore"]),
    title: stringValue(row.title),
    body: stringValue(row.body),
    archived: booleanValue(row.archived),
  };
}
async function readRevision(sql: Sql, repositoryId: string, pageId: string, revisionId?: string) {
  const row = (
    await sql.query(
      revisionId === undefined
        ? "SELECT r.* FROM wiki_pages p JOIN wiki_revisions r ON r.page_id=p.id AND r.id=p.head_revision_id WHERE p.repository_id=$1 AND p.id=$2"
        : "SELECT * FROM wiki_revisions WHERE repository_id=$1 AND page_id=$2 AND id=$3",
      revisionId === undefined ? [repositoryId, pageId] : [repositoryId, pageId, revisionId],
      decode,
    )
  ).rows[0];
  return row ?? null;
}
export class PostgresWikiStore implements WikiStore {
  constructor(private readonly db: Database = businessDatabase()) {}
  list(userId: string, repositoryId: string, after?: string) {
    return this.db.transaction(async (sql) => {
      await repositoryContentScope(sql, userId, { repositoryId });
      const rows = (
        await sql.query(
          "SELECT p.id,p.version,r.title,r.archived,r.at FROM wiki_pages p JOIN wiki_revisions r ON r.id=p.head_revision_id AND r.page_id=p.id WHERE p.repository_id=$1 AND ($2::uuid IS NULL OR p.id>$2) ORDER BY p.id LIMIT 21",
          [repositoryId, after ?? null],
          (r) => ({
            pageId: stringValue(r.id),
            version: numberValue(r.version),
            title: stringValue(r.title),
            archived: booleanValue(r.archived),
            updatedAt: Number(numericValue(r.at)),
          }),
        )
      ).rows;
      const pages = rows.slice(0, 20);
      return { pages, next: rows.length > 20 ? (pages.at(-1)?.pageId ?? null) : null };
    });
  }
  read(userId: string, query: WikiQuery) {
    return this.db.transaction(async (sql) => {
      await repositoryContentScope(sql, userId, { repositoryId: query.repositoryId });
      const found = await readRevision(sql, query.repositoryId, query.pageId, query.revisionId);
      if (!found) throw new WikiError(404, "Wiki revision not found.");
      return found;
    });
  }
  history(userId: string, query: WikiQuery, before?: number) {
    return this.db.transaction(async (sql) => {
      await repositoryContentScope(sql, userId, { repositoryId: query.repositoryId });
      if (!(await readRevision(sql, query.repositoryId, query.pageId)))
        throw new WikiError(404, "Wiki page not found.");
      const rows = (
        await sql.query(
          "SELECT * FROM wiki_revisions WHERE repository_id=$1 AND page_id=$2 AND ($3::integer IS NULL OR version<$3) ORDER BY version DESC LIMIT 21",
          [query.repositoryId, query.pageId, before ?? null],
          decode,
        )
      ).rows;
      const revisions = rows.slice(0, 20);
      return { revisions, next: rows.length > 20 ? (revisions.at(-1)?.version ?? null) : null };
    });
  }
  transact<T>(
    userId: string,
    command: WikiCommand,
    operation: (tx: WikiTransaction) => Promise<T>,
  ) {
    const fingerprint = createHash("sha256").update(JSON.stringify(command)).digest("hex");
    return this.db.transaction(async (sql) => {
      const { repository, archived } = await repositoryContentScope(sql, userId, {
        repositoryId: command.repositoryId,
      });
      await sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `wiki:${userId}:${command.requestId}`,
      ]);
      return operation({
        scope: { repositoryId: repository.id, archived, permissions: repository.permissions },
        nextId: randomUUID,
        replay: async () => {
          const row = (
            await sql.query(
              "SELECT fingerprint,page_id,revision_id FROM wiki_commands WHERE actor_user_id=$1 AND request_id=$2",
              [userId, command.requestId],
              (r) => ({
                fingerprint: stringValue(r.fingerprint),
                pageId: stringValue(r.page_id),
                revisionId: stringValue(r.revision_id),
              }),
            )
          ).rows[0];
          if (!row) return null;
          if (row.fingerprint !== fingerprint)
            throw new WikiError(409, "Wiki request identity reused with different content.");
          const revision = await readRevision(sql, repository.id, row.pageId, row.revisionId);
          if (!revision) throw new WikiError(503, "Wiki receipt unavailable.");
          return { requestId: command.requestId, revision };
        },
        load: async () => {
          await sql.query("SELECT id FROM wiki_pages WHERE repository_id=$1 AND id=$2 FOR UPDATE", [
            repository.id,
            command.pageId,
          ]);
          return readRevision(sql, repository.id, command.pageId);
        },
        revision: (id) => readRevision(sql, repository.id, command.pageId, id),
        save: async (next) => {
          if (next.parentRevisionId === null)
            await sql.query(
              "INSERT INTO wiki_pages(id,repository_id,version,head_revision_id) VALUES($1,$2,$3,$4)",
              [next.pageId, repository.id, next.version, next.id],
            );
          await sql.query(
            "INSERT INTO wiki_revisions(id,page_id,repository_id,version,parent_revision_id,actor_user_id,at,action,title,body,archived) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
            [
              next.id,
              next.pageId,
              repository.id,
              next.version,
              next.parentRevisionId,
              next.actorUserId,
              next.at,
              next.action,
              next.title,
              next.body,
              next.archived,
            ],
          );
          if (
            next.parentRevisionId !== null &&
            !(
              await sql.query(
                "UPDATE wiki_pages SET version=$3,head_revision_id=$4 WHERE id=$1 AND repository_id=$2 AND version=$5 RETURNING id",
                [next.pageId, repository.id, next.version, next.id, command.expectedVersion],
              )
            ).rows.length
          )
            throw new WikiError(409, "Wiki version conflict.");
          await sql.query(
            "INSERT INTO wiki_commands(actor_user_id,request_id,page_id,repository_id,fingerprint,revision_id) VALUES($1,$2,$3,$4,$5,$6)",
            [userId, command.requestId, next.pageId, repository.id, fingerprint, next.id],
          );
          return { requestId: command.requestId, revision: next };
        },
      });
    });
  }
}
