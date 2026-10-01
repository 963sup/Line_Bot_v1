import { createHash } from "node:crypto";
import { readActiveUserQualification } from "@line_bot_v1/account/postgres";
import { readAccountLogin, resolveAccountLogin } from "@line_bot_v1/namespace/postgres";
import { businessDatabase, type Database, type Sql } from "@line_bot_v1/platform/postgres";
import type {
  RepositoryManagementCommand,
  RepositoryManagementReceipt,
  RepositoryManagementSnapshot,
  RepositoryManagementStore,
} from "../../application/ports/management.js";
import type { RepositorySelector } from "../../contracts/selectors.js";
import {
  hasRepositoryPermission,
  RepositoryError,
  type RepositoryPermission,
  type RepositoryVisibility,
} from "../../domain.js";

type RepositoryRow = {
  id: string;
  owner_account_id: string;
  owner_account_kind: "USER" | "ORGANIZATION";
  name: string;
  visibility: RepositoryVisibility;
  is_archived: boolean;
  version: number;
};

type Receipt = Readonly<{
  receiptVersion: 1;
  family: "repository-management";
  action: RepositoryManagementCommand["action"];
  result: RepositoryManagementReceipt;
}>;

const fingerprint = (command: RepositoryManagementCommand) =>
  createHash("sha256")
    .update(JSON.stringify({ family: "repository-management", command }))
    .digest("hex");

const columns =
  "id,owner_account_id,owner_account_kind,name,visibility,is_archived,version";

async function repositoryBySelector(
  sql: Sql,
  selector: RepositorySelector,
  lock = false,
): Promise<RepositoryRow> {
  if ("repositoryId" in selector) {
    const row = (
      await sql.query(
        `SELECT ${columns} FROM repositories
         WHERE id=$1 ${lock ? "FOR UPDATE" : ""}`,
        [selector.repositoryId],
      )
    ).rows[0] as RepositoryRow | undefined;
    if (!row) throw new RepositoryError(404, "找不到 Repository。");
    return row;
  }

  const owner = await resolveAccountLogin(sql, selector.ownerLogin);
  if (!owner) throw new RepositoryError(404, "找不到 Repository。");
  const current = (
    await sql.query(
      `SELECT ${columns}
       FROM repositories
       WHERE owner_account_id=$1
         AND owner_account_kind=$2
         AND lower(name)=lower($3)
       ${lock ? "FOR UPDATE" : ""}`,
      [owner.id, owner.kind, selector.repositoryName],
    )
  ).rows[0] as RepositoryRow | undefined;
  if (current) return current;

  const historical = (
    await sql.query(
      `SELECT ${columns
        .split(",")
        .map((column) => `r.${column}`)
        .join(",")}
       FROM repository_name_history h
       JOIN repositories r ON r.id=h.repository_id
       WHERE r.owner_account_id=$1
         AND r.owner_account_kind=$2
         AND lower(h.old_name)=lower($3)
       ORDER BY h.renamed_at DESC,r.id
       LIMIT 2`,
      [owner.id, owner.kind, selector.repositoryName],
    )
  ).rows as RepositoryRow[];
  if (!historical.length) throw new RepositoryError(404, "找不到 Repository。");
  if (historical.length > 1) {
    throw new RepositoryError(409, "Repository 舊名稱解析不唯一，請使用目前名稱。");
  }
  if (lock) {
    const locked = (
      await sql.query(`SELECT ${columns} FROM repositories WHERE id=$1 FOR UPDATE`, [
        historical[0]!.id,
      ])
    ).rows[0] as RepositoryRow | undefined;
    if (!locked) throw new RepositoryError(404, "找不到 Repository。");
    return locked;
  }
  return historical[0]!;
}

async function actorPermissions(
  sql: Sql,
  repositoryId: string,
  userId: string,
): Promise<RepositoryPermission[]> {
  const row = (
    await sql.query(
      "SELECT permissions FROM repository_effective_access WHERE repository_id=$1 AND user_id=$2",
      [repositoryId, userId],
    )
  ).rows[0] as { permissions: RepositoryPermission[] } | undefined;
  return row?.permissions ?? [];
}

async function requireAdmin(sql: Sql, repositoryId: string, userId: string) {
  const permissions = await actorPermissions(sql, repositoryId, userId);
  if (!hasRepositoryPermission(permissions, "admin")) {
    throw new RepositoryError(403, "需要 Repository admin 才能管理 Repository 設定。");
  }
  return permissions;
}

async function internalEnterpriseId(sql: Sql, repository: RepositoryRow): Promise<string | null> {
  if (repository.owner_account_kind !== "ORGANIZATION") return null;
  const row = (
    await sql.query(
      `SELECT enterprise_account_id
       FROM repository_internal_scopes
       WHERE organization_account_id=$1
       LIMIT 1`,
      [repository.owner_account_id],
    )
  ).rows[0] as { enterprise_account_id: string } | undefined;
  return row?.enterprise_account_id ?? null;
}

async function snapshot(
  sql: Sql,
  repository: RepositoryRow,
  userId: string,
  permissions: readonly RepositoryPermission[],
): Promise<RepositoryManagementSnapshot> {
  const owner = await readAccountLogin(
    sql,
    repository.owner_account_id,
    repository.owner_account_kind,
  );
  if (!owner) throw new RepositoryError(409, "Repository owner locator 不可用。");
  return {
    repository: {
      id: repository.id,
      actorUserId: userId,
      ownerAccountId: repository.owner_account_id,
      ownerKind: repository.owner_account_kind,
      ownerLogin: owner.login,
      name: repository.name,
      visibility: repository.visibility,
      archived: Boolean(repository.is_archived),
      version: Number(repository.version),
      actorPermissions: permissions,
      internalEnterpriseId: await internalEnterpriseId(sql, repository),
    },
  };
}

function validVisibility(value: unknown): value is RepositoryVisibility {
  return value === "private" || value === "internal" || value === "public";
}

function readReceipt(
  previous: { fingerprint: string; result: unknown } | undefined,
  commandFingerprint: string,
): RepositoryManagementReceipt | null {
  if (!previous) return null;
  if (previous.fingerprint !== commandFingerprint) {
    throw new RepositoryError(409, "此請求編號已用於不同 Repository 操作。");
  }
  const receipt = previous.result as Partial<Receipt>;
  const result = receipt.result as Partial<RepositoryManagementReceipt> | undefined;
  if (
    receipt.receiptVersion !== 1 ||
    receipt.family !== "repository-management" ||
    (receipt.action !== "rename" &&
      receipt.action !== "visibility" &&
      receipt.action !== "archive" &&
      receipt.action !== "unarchive") ||
    !result ||
    typeof result.requestId !== "string" ||
    typeof result.repositoryId !== "string" ||
    result.action !== receipt.action ||
    typeof result.name !== "string" ||
    !validVisibility(result.visibility) ||
    typeof result.archived !== "boolean" ||
    !Number.isSafeInteger(result.version) ||
    !Number.isSafeInteger(result.at)
  ) {
    throw new RepositoryError(503, "Repository 管理回執無法讀取。");
  }
  return result as RepositoryManagementReceipt;
}

async function nameReserved(sql: Sql, repository: RepositoryRow, name: string): Promise<boolean> {
  const current = (
    await sql.query(
      `SELECT 1
       FROM repositories
       WHERE owner_account_id=$1
         AND owner_account_kind=$2
         AND id<>$3
         AND lower(name)=lower($4)
       LIMIT 1`,
      [
        repository.owner_account_id,
        repository.owner_account_kind,
        repository.id,
        name,
      ],
    )
  ).rows[0];
  if (current) return true;
  return Boolean(
    (
      await sql.query(
        `SELECT 1
         FROM repository_name_history h
         JOIN repositories historical_repository
           ON historical_repository.id=h.repository_id
         WHERE historical_repository.owner_account_id=$1
           AND historical_repository.owner_account_kind=$2
           AND lower(h.old_name)=lower($3)
         LIMIT 1`,
        [repository.owner_account_id, repository.owner_account_kind, name],
      )
    ).rows[0],
  );
}

function state(repository: RepositoryRow) {
  return {
    name: repository.name,
    visibility: repository.visibility,
    archived: Boolean(repository.is_archived),
    version: Number(repository.version),
  };
}

export class PostgresRepositoryManagementStore implements RepositoryManagementStore {
  constructor(private readonly db: Database = businessDatabase()) {}

  view(userId: string, selector: RepositorySelector): Promise<RepositoryManagementSnapshot> {
    return this.db.transaction(async (sql) => {
      const actor = await readActiveUserQualification(sql, userId, "share");
      if (!actor) throw new RepositoryError(403, "目前 User 資格不能讀取 Repository 設定。");
      const repository = await repositoryBySelector(sql, selector);
      const permissions = await actorPermissions(sql, repository.id, userId);
      if (!permissions.length) {
        throw new RepositoryError(403, "目前不是此 Repository 的有效成員。");
      }
      return snapshot(sql, repository, userId, permissions);
    });
  }

  execute(
    userId: string,
    command: RepositoryManagementCommand,
    now: number,
  ): Promise<RepositoryManagementReceipt> {
    const commandFingerprint = fingerprint(command);
    return this.db.transaction(async (sql) => {
      await sql.query("SELECT pg_advisory_xact_lock(71020260912::bigint)");
      const actor = await readActiveUserQualification(sql, userId, "update");
      if (!actor) throw new RepositoryError(403, "目前 User 資格不能管理 Repository。");

      let repository = await repositoryBySelector(
        sql,
        { repositoryId: command.repositoryId },
        true,
      );
      await requireAdmin(sql, repository.id, userId);

      await sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `repository-command:${userId}:${command.requestId}`,
      ]);
      const previous = (
        await sql.query(
          "SELECT fingerprint,result FROM repository_commands WHERE actor=$1 AND request_id=$2",
          [userId, command.requestId],
        )
      ).rows[0] as { fingerprint: string; result: unknown } | undefined;
      const replay = readReceipt(previous, commandFingerprint);
      if (replay) return replay;

      if (Number(repository.version) !== command.expectedVersion) {
        throw new RepositoryError(409, "Repository 已更新，請重新讀取後再操作。");
      }
      const previousState = state(repository);

      if (command.action === "rename") {
        if (repository.name === command.name) {
          throw new RepositoryError(409, "Repository name 沒有變更。");
        }
        if (await nameReserved(sql, repository, command.name)) {
          throw new RepositoryError(409, "此 owner 的 Repository 名稱已使用或保留為舊名稱。");
        }
        await sql.query(
          `INSERT INTO repository_name_history(repository_id,old_name,renamed_at)
           VALUES($1,$2,$3)
           ON CONFLICT DO NOTHING`,
          [repository.id, repository.name, now],
        );
        try {
          repository = (
            await sql.query(
              `UPDATE repositories
               SET name=$2,version=version+1
               WHERE id=$1 AND version=$3
               RETURNING ${columns}`,
              [repository.id, command.name, command.expectedVersion],
            )
          ).rows[0] as RepositoryRow;
        } catch (error) {
          const postgres = error as { code?: string; constraint?: string };
          if (postgres.code === "23505") {
            throw new RepositoryError(409, "此 owner 已有相同名稱的 Repository。");
          }
          throw error;
        }
      } else if (command.action === "visibility") {
        if (repository.visibility === command.visibility) {
          throw new RepositoryError(409, "Repository visibility 沒有變更。");
        }
        if (command.visibility === "internal") {
          if (repository.owner_account_kind !== "ORGANIZATION") {
            throw new RepositoryError(409, "INTERNAL Repository 必須由 Organization 擁有。");
          }
          if (!(await internalEnterpriseId(sql, repository))) {
            throw new RepositoryError(
              409,
              "Organization 必須連結 active Enterprise 才能使用 INTERNAL visibility。",
            );
          }
        }
        repository = (
          await sql.query(
            `UPDATE repositories
             SET visibility=$2,version=version+1
             WHERE id=$1 AND version=$3
             RETURNING ${columns}`,
            [repository.id, command.visibility, command.expectedVersion],
          )
        ).rows[0] as RepositoryRow;
      } else {
        const archived = command.action === "archive";
        if (Boolean(repository.is_archived) === archived) {
          throw new RepositoryError(
            409,
            archived ? "Repository 已封存。" : "Repository 尚未封存。",
          );
        }
        repository = (
          await sql.query(
            `UPDATE repositories
             SET is_archived=$2,version=version+1
             WHERE id=$1 AND version=$3
             RETURNING ${columns}`,
            [repository.id, archived, command.expectedVersion],
          )
        ).rows[0] as RepositoryRow;
      }

      if (!repository) throw new RepositoryError(409, "Repository 狀態已變更，請重新載入。");
      const currentState = state(repository);
      await sql.query(
        `INSERT INTO repository_events(
           repository_id,actor_user_id,action,previous_state,current_state,at
         ) VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6)`,
        [
          repository.id,
          userId,
          command.action,
          JSON.stringify(previousState),
          JSON.stringify(currentState),
          now,
        ],
      );

      const result: RepositoryManagementReceipt = {
        requestId: command.requestId,
        repositoryId: repository.id,
        action: command.action,
        name: repository.name,
        visibility: repository.visibility,
        archived: Boolean(repository.is_archived),
        version: Number(repository.version),
        at: now,
      };
      const receipt: Receipt = {
        receiptVersion: 1,
        family: "repository-management",
        action: command.action,
        result,
      };
      await sql.query(
        `INSERT INTO repository_commands(actor,request_id,fingerprint,result,at)
         VALUES($1,$2,$3,$4::jsonb,$5)`,
        [userId, command.requestId, commandFingerprint, JSON.stringify(receipt), now],
      );
      return result;
    });
  }
}
