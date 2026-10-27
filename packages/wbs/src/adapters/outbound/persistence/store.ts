import { createHash, randomUUID } from "node:crypto";
import { businessDatabase, type Database, type SqlRow } from "@line_bot_v1/platform/postgres";
import { isRecord, numberValue, numericValue, stringValue } from "@line_bot_v1/platform/validation";
import type { RepositorySelector } from "@line_bot_v1/repository/contracts/selectors";
import { repositoryContentScope } from "@line_bot_v1/repository/postgres/content-scope";
import type { WbsCommand, WbsHistory, WbsView } from "../../../contracts/dto/content.js";
import type { WbsContentTransaction, WbsStore } from "../../../contracts/repositories/content.js";
import type { WbsRevision } from "../../../domain/content.js";
import { parseWbsDocument, WbsError } from "../../../domain/document.js";
import { canEditWbs } from "../../../domain/policies/access.js";
import { PostgresWbsScopeBoundary } from "./scope-boundary.js";

function revisionMetadata(row: SqlRow): Omit<WbsRevision, "document"> {
  const action = stringValue(row.action);
  if (
    action !== "initialize" &&
    action !== "create-node" &&
    action !== "update-node" &&
    action !== "move-node" &&
    action !== "delete-subtree"
  )
    throw new WbsError(503, "WBS 歷史操作無法讀取。");
  return {
    id: stringValue(row.id),
    version: numberValue(row.version),
    parentRevisionId: row.parent_revision_id === null ? null : stringValue(row.parent_revision_id),
    actorUserId: stringValue(row.actor_user_id),
    action,
    at: Number(numericValue(row.at)),
  };
}
function revision(row: SqlRow): WbsRevision {
  const metadata = revisionMetadata(row);
  return { ...metadata, document: parseWbsDocument(row.document) };
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (isRecord(value))
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  return value;
}

export class PostgresWbsStore implements WbsStore {
  constructor(private readonly db: Database = businessDatabase()) {}
  read(userId: string, selector: RepositorySelector, revisionId?: string): Promise<WbsView> {
    return this.db.transaction(async (sql) => {
      const { repository, archived } = await repositoryContentScope(sql, userId, selector);
      await new PostgresWbsScopeBoundary(sql).repositoryAvailable(repository.id);
      const root = (
        await sql.query(
          "SELECT version,head_revision_id FROM repository_wbs WHERE repository_id=$1",
          [repository.id],
          (r) => ({ version: numberValue(r.version), head: stringValue(r.head_revision_id) }),
        )
      ).rows[0];
      const id = revisionId ?? root?.head;
      const found = id
        ? (
            await sql.query(
              "SELECT * FROM repository_wbs_revisions WHERE repository_id=$1 AND id=$2",
              [repository.id, id],
              revision,
            )
          ).rows[0]
        : undefined;
      if (id && !found) throw new WbsError(404, "找不到 WBS Revision。");
      return {
        repository: { id: repository.id, ownerLogin: repository.ownerLogin, name: repository.name },
        actorUserId: userId,
        archived,
        canEdit: !archived && canEditWbs(repository.permissions) && revisionId === undefined,
        canManageRepository: repository.permissions.includes("admin"),
        version: root?.version ?? 0,
        revision: found ?? null,
      };
    });
  }
  history(userId: string, selector: RepositorySelector, before?: number): Promise<WbsHistory> {
    return this.db.transaction(async (sql) => {
      const { repository } = await repositoryContentScope(sql, userId, selector);
      await new PostgresWbsScopeBoundary(sql).repositoryAvailable(repository.id);
      const rows = (
        await sql.query(
          "SELECT id,version,parent_revision_id,actor_user_id,action,at FROM repository_wbs_revisions WHERE repository_id=$1 AND ($2::integer IS NULL OR version<$2) ORDER BY version DESC LIMIT 21",
          [repository.id, before ?? null],
          revisionMetadata,
        )
      ).rows;
      const page = rows.slice(0, 20);
      return {
        revisions: page,
        next: rows.length > 20 ? (page.at(-1)?.version ?? null) : null,
      };
    });
  }
  transact<T>(
    userId: string,
    command: WbsCommand,
    operation: (transaction: WbsContentTransaction) => Promise<T>,
  ): Promise<T> {
    const fingerprint = createHash("sha256")
      .update(JSON.stringify(canonical(command)))
      .digest("hex");
    return this.db.transaction(async (sql) => {
      const { repository, archived } = await repositoryContentScope(sql, userId, {
        repositoryId: command.repositoryId,
      });
      await new PostgresWbsScopeBoundary(sql).repositoryAvailable(repository.id);
      return operation({
        scope: { repositoryId: repository.id, archived, permissions: repository.permissions },
        nextId: randomUUID,
        replay: async () => {
          await sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
            `wbs-command:${userId}:${command.requestId}`,
          ]);
          if (
            (
              await sql.query(
                "SELECT 1 FROM repository_wbs_governance_commands WHERE actor_user_id=$1 AND request_id=$2",
                [userId, command.requestId],
              )
            ).rows.length
          )
            throw new WbsError(409, "此 requestId 已用於 WBS 治理操作。");
          const receipt = (
            await sql.query(
              "SELECT fingerprint,revision_id,repository_id FROM repository_wbs_commands WHERE actor_user_id=$1 AND request_id=$2",
              [userId, command.requestId],
              (r) => ({
                fingerprint: stringValue(r.fingerprint),
                revisionId: stringValue(r.revision_id),
                repositoryId: stringValue(r.repository_id),
              }),
            )
          ).rows[0];
          if (!receipt) return null;
          if (receipt.fingerprint !== fingerprint || receipt.repositoryId !== repository.id)
            throw new WbsError(409, "此 requestId 已用於不同 WBS 操作。");
          const found = (
            await sql.query(
              "SELECT * FROM repository_wbs_revisions WHERE repository_id=$1 AND id=$2",
              [repository.id, receipt.revisionId],
              revision,
            )
          ).rows[0];
          if (!found) throw new WbsError(503, "WBS 回執無法讀取。");
          return { requestId: command.requestId, repositoryId: repository.id, revision: found };
        },
        load: async () => {
          const head = (
            await sql.query(
              "SELECT version,head_revision_id FROM repository_wbs WHERE repository_id=$1 FOR UPDATE",
              [repository.id],
              (r) => ({ version: numberValue(r.version), head: stringValue(r.head_revision_id) }),
            )
          ).rows[0];
          if (!head) return null;
          const current = (
            await sql.query(
              "SELECT * FROM repository_wbs_revisions WHERE repository_id=$1 AND id=$2",
              [repository.id, head.head],
              revision,
            )
          ).rows[0];
          if (!current || current.version !== head.version)
            throw new WbsError(503, "WBS 目前版本無法讀取。");
          return current;
        },
        save: async (next) => {
          if (next.parentRevisionId === null)
            await sql.query(
              "INSERT INTO repository_wbs(repository_id,version,head_revision_id) VALUES($1,$2,$3)",
              [repository.id, next.version, next.id],
            );
          await sql.query(
            "INSERT INTO repository_wbs_revisions(id,repository_id,version,parent_revision_id,actor_user_id,action,document,at) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8)",
            [
              next.id,
              repository.id,
              next.version,
              next.parentRevisionId,
              next.actorUserId,
              next.action,
              JSON.stringify(next.document),
              next.at,
            ],
          );
          if (next.parentRevisionId !== null) {
            const updated = await sql.query(
              "UPDATE repository_wbs SET version=$2,head_revision_id=$3 WHERE repository_id=$1 AND version=$4 RETURNING version",
              [repository.id, next.version, next.id, command.expectedVersion],
            );
            if (!updated.rows.length) throw new WbsError(409, "WBS 版本衝突。");
          }
          await sql.query(
            "INSERT INTO repository_wbs_commands(actor_user_id,request_id,repository_id,fingerprint,revision_id) VALUES($1,$2,$3,$4,$5)",
            [userId, command.requestId, repository.id, fingerprint, next.id],
          );
          return { requestId: command.requestId, repositoryId: repository.id, revision: next };
        },
      });
    });
  }
}
