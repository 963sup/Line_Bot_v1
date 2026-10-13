import { createHash, randomUUID } from "node:crypto";
import { businessDatabase, type Database, type SqlRow } from "@line_bot_v1/platform/postgres";
import { isRecord, numberValue, numericValue, stringValue } from "@line_bot_v1/platform/validation";
import type { RepositorySelector } from "@line_bot_v1/repository/contracts/selectors";
import { repositoryContentScope } from "@line_bot_v1/repository/postgres/content-scope";
import type {
  WbsCommand,
  WbsHistory,
  WbsReceipt,
  WbsRevision,
  WbsStore,
  WbsView,
} from "../../../contracts.js";
import { applyWbsEdit, parseWbsDocument, WbsError } from "../../../domain.js";

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
  try {
    return { ...metadata, document: parseWbsDocument(row.document) };
  } catch {
    throw new WbsError(503, "WBS 已保存內容格式不正確。");
  }
}
function canWrite(permissions: readonly string[]) {
  return permissions.some((p) => p === "write" || p === "maintain" || p === "admin");
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
        canEdit: !archived && canWrite(repository.permissions) && revisionId === undefined,
        canManageRepository: repository.permissions.includes("admin"),
        version: root?.version ?? 0,
        revision: found ?? null,
      };
    });
  }
  history(userId: string, selector: RepositorySelector, before?: number): Promise<WbsHistory> {
    return this.db.transaction(async (sql) => {
      const { repository } = await repositoryContentScope(sql, userId, selector);
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
  execute(userId: string, command: WbsCommand, now: number): Promise<WbsReceipt> {
    const fingerprint = createHash("sha256")
      .update(JSON.stringify(canonical(command)))
      .digest("hex");
    return this.db.transaction(async (sql) => {
      const { repository, archived } = await repositoryContentScope(sql, userId, {
        repositoryId: command.repositoryId,
      });
      if (!canWrite(repository.permissions))
        throw new WbsError(403, "需要 Repository write、maintain 或 admin 才能編輯 WBS。");
      await sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `wbs-command:${userId}:${command.requestId}`,
      ]);
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
      if (receipt) {
        if (receipt.fingerprint !== fingerprint || receipt.repositoryId !== repository.id)
          throw new WbsError(409, "此 requestId 已用於不同 WBS 操作。");
        const replay = (
          await sql.query(
            "SELECT * FROM repository_wbs_revisions WHERE repository_id=$1 AND id=$2",
            [repository.id, receipt.revisionId],
            revision,
          )
        ).rows[0];
        if (!replay) throw new WbsError(503, "WBS 回執無法讀取。");
        return { requestId: command.requestId, repositoryId: repository.id, revision: replay };
      }
      if (archived) throw new WbsError(409, "Repository 已封存，不能修改 WBS。");
      const root = (
        await sql.query(
          "SELECT version,head_revision_id FROM repository_wbs WHERE repository_id=$1 FOR UPDATE",
          [repository.id],
          (r) => ({ version: numberValue(r.version), head: stringValue(r.head_revision_id) }),
        )
      ).rows[0];
      if ((root?.version ?? 0) !== command.expectedVersion)
        throw new WbsError(409, "WBS 已更新；請重新讀取並確認你的修改。");
      if (command.action === "initialize" ? Boolean(root) : !root)
        throw new WbsError(409, "WBS 初始化狀態不符合此操作。");
      const previous = root
        ? (
            await sql.query(
              "SELECT * FROM repository_wbs_revisions WHERE repository_id=$1 AND id=$2",
              [repository.id, root.head],
              revision,
            )
          ).rows[0]
        : undefined;
      if (root && !previous) throw new WbsError(503, "WBS 目前版本無法讀取。");
      const document = applyWbsEdit(previous?.document ?? { schemaVersion: 1, nodes: [] }, command);
      if (previous && JSON.stringify(document) === JSON.stringify(previous.document))
        throw new WbsError(409, "WBS 內容沒有變更。");
      const id = randomUUID();
      const version = (root?.version ?? 0) + 1;
      if (!root)
        await sql.query(
          "INSERT INTO repository_wbs(repository_id,version,head_revision_id) VALUES($1,$2,$3)",
          [repository.id, version, id],
        );
      await sql.query(
        "INSERT INTO repository_wbs_revisions(id,repository_id,version,parent_revision_id,actor_user_id,action,document,at) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8)",
        [
          id,
          repository.id,
          version,
          root?.head ?? null,
          userId,
          command.action,
          JSON.stringify(document),
          now,
        ],
      );
      if (root) {
        const updated = await sql.query(
          "UPDATE repository_wbs SET version=$2,head_revision_id=$3 WHERE repository_id=$1 AND version=$4 RETURNING version",
          [repository.id, version, id, command.expectedVersion],
        );
        if (!updated.rows.length) throw new WbsError(409, "WBS 版本衝突。");
      }
      await sql.query(
        "INSERT INTO repository_wbs_commands(actor_user_id,request_id,repository_id,fingerprint,revision_id) VALUES($1,$2,$3,$4,$5)",
        [userId, command.requestId, repository.id, fingerprint, id],
      );
      return {
        requestId: command.requestId,
        repositoryId: repository.id,
        revision: {
          id,
          version,
          parentRevisionId: root?.head ?? null,
          actorUserId: userId,
          action: command.action,
          document,
          at: now,
        },
      };
    });
  }
}
