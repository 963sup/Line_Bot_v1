import { createHash, randomUUID } from "node:crypto";
import {
  readAccountLogin,
  readAccountLogins,
  readActiveUserQualification,
} from "@line-work/account/adapters/postgres";
import { businessDatabase, type Database, type Sql } from "@line-work/platform/adapters/postgres";
import type {
  RepositoryStarListCommand,
  RepositoryStarListCreateCommand,
  RepositoryStarListDetail,
  RepositoryStarListMutationResult,
  RepositoryStarListRepository,
  RepositoryStarListStore,
  RepositoryStarListSummary,
  RepositoryStarListVisibility,
} from "../../application/ports/star-lists.js";
import { RepositoryError } from "../../domain.js";
import { readVisibleStarListRepositoryRows } from "./star-list-reads.js";

type ListRow = {
  id: string;
  owner_user_id: string;
  name: string;
  description: string;
  visibility: RepositoryStarListVisibility;
  version: number | string;
  created_at: number | string;
  updated_at: number | string;
};

type Receipt = Readonly<{
  receiptVersion: 1;
  family: "repository-star-list";
  action: string;
  result: RepositoryStarListMutationResult;
}>;

const fingerprint = (command: unknown) =>
  createHash("sha256")
    .update(JSON.stringify({ family: "repository-star-list", command }))
    .digest("hex");

function mutationResult(row: ListRow, deleted = false): RepositoryStarListMutationResult {
  return {
    id: row.id,
    version: Number(row.version),
    visibility: row.visibility,
    deleted,
  };
}

function readReceipt(
  previous: { fingerprint: string; result: unknown } | undefined,
  commandFingerprint: string,
): RepositoryStarListMutationResult | null {
  if (!previous) return null;
  if (previous.fingerprint !== commandFingerprint) {
    throw new RepositoryError(409, "此請求編號已用於不同 Repository 操作。");
  }
  const receipt = previous.result as Partial<Receipt>;
  if (
    receipt.receiptVersion !== 1 ||
    receipt.family !== "repository-star-list" ||
    typeof receipt.action !== "string" ||
    !receipt.result ||
    typeof receipt.result.id !== "string" ||
    !Number.isSafeInteger(receipt.result.version) ||
    (receipt.result.visibility !== "private" && receipt.result.visibility !== "public") ||
    typeof receipt.result.deleted !== "boolean"
  ) {
    throw new RepositoryError(503, "List 操作回執無法讀取。");
  }
  return receipt.result;
}

async function previousReceipt(sql: Sql, userId: string, requestId: string) {
  return (
    await sql.query(
      "SELECT fingerprint,result FROM repository_commands WHERE actor=$1 AND request_id=$2",
      [userId, requestId],
    )
  ).rows[0] as { fingerprint: string; result: unknown } | undefined;
}

async function writeReceipt(
  sql: Sql,
  userId: string,
  requestId: string,
  commandFingerprint: string,
  action: string,
  result: RepositoryStarListMutationResult,
  at: number,
) {
  const receipt: Receipt = {
    receiptVersion: 1,
    family: "repository-star-list",
    action,
    result,
  };
  await sql.query(
    `INSERT INTO repository_commands(actor,request_id,fingerprint,result,at)
     VALUES($1,$2,$3,$4::jsonb,$5)`,
    [userId, requestId, commandFingerprint, JSON.stringify(receipt), at],
  );
}

async function requireActiveUser(sql: Sql, userId: string) {
  if (!(await readActiveUserQualification(sql, userId, "update"))) {
    throw new RepositoryError(403, "目前 User 資格不能管理 List。");
  }
}

async function visibleRepositories(
  sql: Sql,
  viewerUserId: string,
  listId: string,
): Promise<RepositoryStarListRepository[]> {
  const rows = await readVisibleStarListRepositoryRows(sql, viewerUserId, [listId]);
  const owners = await readAccountLogins(
    sql,
    rows.map((row) => ({ id: row.owner_account_id, kind: row.owner_account_kind })),
  );
  const ownerLogins = new Map(
    owners.map((owner) => [`${owner.id}:\0:${owner.kind}`, owner.login]),
  );
  return rows.map((row) => {
    const ownerLogin = ownerLogins.get(`${row.owner_account_id}:\0:${row.owner_account_kind}`);
    if (!ownerLogin) throw new RepositoryError(409, "Repository owner locator 不可用。");
    return {
      id: row.repository_id,
      ownerLogin,
      name: row.repository_name,
      visibility: row.repository_visibility,
    };
  });
}

async function listSummary(
  sql: Sql,
  row: ListRow,
  visibleRepositoryCount: number,
): Promise<RepositoryStarListSummary> {
  const owner = await readAccountLogin(sql, row.owner_user_id, "USER");
  if (!owner) throw new RepositoryError(409, "List owner locator 不可用。");
  return {
    id: row.id,
    ownerLogin: owner.login,
    name: row.name,
    description: row.description,
    visibility: row.visibility,
    version: Number(row.version),
    visibleRepositoryCount,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

export class PostgresRepositoryStarListStore implements RepositoryStarListStore {
  constructor(private db: Database = businessDatabase()) {}

  mine(userId: string): Promise<RepositoryStarListSummary[]> {
    return this.db.transaction(async (sql) => {
      const rows = (
        await sql.query(
          `SELECT id,owner_user_id,name,description,visibility,version,created_at,updated_at
           FROM repository_star_lists
           WHERE owner_user_id=$1
           ORDER BY updated_at DESC,id`,
          [userId],
        )
      ).rows as ListRow[];
      if (!rows.length) return [];
      const visibleRows = await readVisibleStarListRepositoryRows(
        sql,
        userId,
        rows.map((row) => row.id),
      );
      const visibleCounts = new Map<string, number>();
      for (const row of visibleRows) {
        visibleCounts.set(row.list_id, (visibleCounts.get(row.list_id) ?? 0) + 1);
      }
      const owner = await readAccountLogin(sql, userId, "USER");
      if (!owner) throw new RepositoryError(409, "List owner locator 不可用。");
      return rows.map((row) => ({
        id: row.id,
        ownerLogin: owner.login,
        name: row.name,
        description: row.description,
        visibility: row.visibility,
        version: Number(row.version),
        visibleRepositoryCount: visibleCounts.get(row.id) ?? 0,
        createdAt: Number(row.created_at),
        updatedAt: Number(row.updated_at),
      }));
    });
  }

  detail(userId: string, listId: string): Promise<RepositoryStarListDetail> {
    return this.db.transaction(async (sql) => {
      const row = (
        await sql.query(
          `SELECT id,owner_user_id,name,description,visibility,version,created_at,updated_at
           FROM repository_star_lists
           WHERE id=$1`,
          [listId],
        )
      ).rows[0] as ListRow | undefined;
      if (!row || (row.owner_user_id !== userId && row.visibility !== "public")) {
        throw new RepositoryError(404, "找不到 List。");
      }
      if (!(await readActiveUserQualification(sql, row.owner_user_id))) {
        throw new RepositoryError(404, "找不到 List。");
      }
      const repositories = await visibleRepositories(sql, userId, listId);
      return {
        ...(await listSummary(sql, row, repositories.length)),
        editable: row.owner_user_id === userId,
        repositories,
      };
    });
  }

  create(
    userId: string,
    command: RepositoryStarListCreateCommand,
    at: number,
  ): Promise<RepositoryStarListMutationResult> {
    const commandFingerprint = fingerprint(command);
    return this.db.transaction(async (sql) => {
      await requireActiveUser(sql, userId);
      await sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `repository-command:${userId}:${command.requestId}`,
      ]);
      const replay = readReceipt(
        await previousReceipt(sql, userId, command.requestId),
        commandFingerprint,
      );
      if (replay) return replay;

      const row = (
        await sql.query(
          `INSERT INTO repository_star_lists(
             id,owner_user_id,name,description,visibility,version,created_at,updated_at
           ) VALUES($1,$2,$3,$4,'private',1,$5,$5)
           RETURNING id,owner_user_id,name,description,visibility,version,created_at,updated_at`,
          [randomUUID(), userId, command.name, command.description, at],
        )
      ).rows[0] as ListRow;
      const result = mutationResult(row);
      await writeReceipt(sql, userId, command.requestId, commandFingerprint, "create", result, at);
      return result;
    });
  }

  execute(
    userId: string,
    command: RepositoryStarListCommand,
    at: number,
  ): Promise<RepositoryStarListMutationResult> {
    const commandFingerprint = fingerprint(command);
    return this.db.transaction(async (sql) => {
      await requireActiveUser(sql, userId);
      await sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `repository-command:${userId}:${command.requestId}`,
      ]);
      const replay = readReceipt(
        await previousReceipt(sql, userId, command.requestId),
        commandFingerprint,
      );
      if (replay) return replay;

      let row = (
        await sql.query(
          `SELECT id,owner_user_id,name,description,visibility,version,created_at,updated_at
           FROM repository_star_lists
           WHERE id=$1
           FOR UPDATE`,
          [command.listId],
        )
      ).rows[0] as ListRow | undefined;
      if (!row || row.owner_user_id !== userId) throw new RepositoryError(404, "找不到 List。");
      if (Number(row.version) !== command.expectedVersion) {
        throw new RepositoryError(409, "List 已更新，請重新讀取後再操作。");
      }

      let deleted = false;
      if (command.action === "update") {
        if (row.name !== command.name || row.description !== command.description) {
          row = (
            await sql.query(
              `UPDATE repository_star_lists
               SET name=$2,description=$3,version=version+1,updated_at=$4
               WHERE id=$1
               RETURNING id,owner_user_id,name,description,visibility,version,created_at,updated_at`,
              [row.id, command.name, command.description, at],
            )
          ).rows[0] as ListRow;
        }
      } else if (command.action === "publish" || command.action === "unpublish") {
        const visibility: RepositoryStarListVisibility =
          command.action === "publish" ? "public" : "private";
        if (row.visibility !== visibility) {
          row = (
            await sql.query(
              `UPDATE repository_star_lists
               SET visibility=$2,version=version+1,updated_at=$3
               WHERE id=$1
               RETURNING id,owner_user_id,name,description,visibility,version,created_at,updated_at`,
              [row.id, visibility, at],
            )
          ).rows[0] as ListRow;
        }
      } else if (command.action === "add") {
        const star = (
          await sql.query(
            "SELECT 1 FROM repository_stars WHERE repository_id=$1 AND user_id=$2",
            [command.repositoryId, userId],
          )
        ).rows[0];
        if (!star) throw new RepositoryError(409, "請先 Star 此 Repository 再加入 List。");
        const access = (
          await sql.query(
            "SELECT 1 FROM repository_effective_access WHERE repository_id=$1 AND user_id=$2",
            [command.repositoryId, userId],
          )
        ).rows[0];
        if (!access) throw new RepositoryError(403, "目前沒有此 Repository 的存取權限。");
        const inserted = (
          await sql.query(
            `INSERT INTO repository_star_list_items(list_id,owner_user_id,repository_id,added_at)
             VALUES($1,$2,$3,$4)
             ON CONFLICT DO NOTHING
             RETURNING repository_id`,
            [row.id, userId, command.repositoryId, at],
          )
        ).rows[0];
        if (inserted) {
          row = (
            await sql.query(
              `UPDATE repository_star_lists
               SET version=version+1,updated_at=$2
               WHERE id=$1
               RETURNING id,owner_user_id,name,description,visibility,version,created_at,updated_at`,
              [row.id, at],
            )
          ).rows[0] as ListRow;
        }
      } else if (command.action === "remove") {
        const removed = (
          await sql.query(
            "DELETE FROM repository_star_list_items WHERE list_id=$1 AND repository_id=$2 RETURNING repository_id",
            [row.id, command.repositoryId],
          )
        ).rows[0];
        if (removed) {
          row = (
            await sql.query(
              `UPDATE repository_star_lists
               SET version=version+1,updated_at=$2
               WHERE id=$1
               RETURNING id,owner_user_id,name,description,visibility,version,created_at,updated_at`,
              [row.id, at],
            )
          ).rows[0] as ListRow;
        }
      } else {
        await sql.query("DELETE FROM repository_star_lists WHERE id=$1", [row.id]);
        deleted = true;
      }

      const result = mutationResult(row, deleted);
      await writeReceipt(
        sql,
        userId,
        command.requestId,
        commandFingerprint,
        command.action,
        result,
        at,
      );
      return result;
    });
  }
}
