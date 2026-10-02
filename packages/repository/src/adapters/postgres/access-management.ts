import { createHash } from "node:crypto";
import { readActiveUserQualification } from "@line_bot_v1/account/postgres";
import { isOrganizationOwner } from "@line_bot_v1/identity-access/postgres";
import { readAccountLogin, resolveAccountLogin } from "@line_bot_v1/namespace/postgres";
import { businessDatabase, type Database, type Sql } from "@line_bot_v1/platform/postgres";
import type {
  RepositoryAccessCommand,
  RepositoryAccessReceipt,
  RepositoryAccessSnapshot,
  RepositoryAccessStore,
} from "../../application/ports/access.js";
import type { RepositorySelector } from "../../contracts/selectors.js";
import {
  hasRepositoryPermission,
  RepositoryError,
  type RepositoryPermission,
} from "../../domain.js";

type RepositoryRow = {
  id: string;
  owner_account_id: string;
  owner_account_kind: "USER" | "ORGANIZATION";
  name: string;
};

type Receipt = Readonly<{
  receiptVersion: 1;
  family: "repository-access";
  action: RepositoryAccessCommand["action"];
  result: RepositoryAccessReceipt;
}>;

const fingerprint = (command: RepositoryAccessCommand) =>
  createHash("sha256")
    .update(JSON.stringify({ family: "repository-access", command }))
    .digest("hex");

async function repositoryRow(
  sql: Sql,
  selector: RepositorySelector,
  lock = false,
): Promise<RepositoryRow> {
  if ("repositoryId" in selector) {
    const row = (
      await sql.query(
        `SELECT id,owner_account_id,owner_account_kind,name
         FROM repositories WHERE id=$1 ${lock ? "FOR UPDATE" : ""}`,
        [selector.repositoryId],
      )
    ).rows[0] as RepositoryRow | undefined;
    if (!row) throw new RepositoryError(404, "找不到 Repository。");
    return row;
  }
  const owner = await resolveAccountLogin(sql, selector.ownerLogin);
  if (!owner) throw new RepositoryError(404, "找不到 Repository。");
  const row = (
    await sql.query(
      `SELECT id,owner_account_id,owner_account_kind,name
       FROM repositories
       WHERE owner_account_id=$1 AND owner_account_kind=$2 AND lower(name)=lower($3)
       ${lock ? "FOR UPDATE" : ""}`,
      [owner.id, owner.kind, selector.repositoryName],
    )
  ).rows[0] as RepositoryRow | undefined;
  if (row) return row;

  const historical = (
    await sql.query(
      `SELECT r.id,r.owner_account_id,r.owner_account_kind,r.name
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
  if (historical.length !== 1) throw new RepositoryError(404, "找不到 Repository。");
  return historical[0]!;
}

async function actorPermissions(
  sql: Sql,
  repositoryId: string,
  userId: string,
): Promise<RepositoryPermission[] | null> {
  const row = (
    await sql.query(
      "SELECT permissions FROM repository_effective_access WHERE repository_id=$1 AND user_id=$2",
      [repositoryId, userId],
    )
  ).rows[0] as { permissions: RepositoryPermission[] } | undefined;
  return row?.permissions ?? null;
}

async function requireManagementAuthority(sql: Sql, repository: RepositoryRow, userId: string) {
  const permissions = await actorPermissions(sql, repository.id, userId);
  if (permissions && hasRepositoryPermission(permissions, "admin")) return permissions;
  if (
    repository.owner_account_kind === "ORGANIZATION" &&
    (await isOrganizationOwner(sql, repository.owner_account_id, userId))
  ) {
    return permissions ?? [];
  }
  throw new RepositoryError(403, "沒有此 Repository 的 access 管理權限。");
}

async function snapshot(
  sql: Sql,
  repository: RepositoryRow,
  userId: string,
): Promise<RepositoryAccessSnapshot> {
  const owner = await readAccountLogin(
    sql,
    repository.owner_account_id,
    repository.owner_account_kind,
  );
  if (!owner) throw new RepositoryError(409, "Repository owner locator 不可用。");
  const directUserGrants = (
    await sql.query(
      `SELECT
         a.principal_id AS "userId",
         a.capability,
         a.version,
         CASE
           WHEN $2='ORGANIZATION' THEN COALESCE(c.is_outside, false)
           ELSE false
         END AS "isOutsideCollaborator"
       FROM repository_access a
       LEFT JOIN organization_repository_collaborators c
         ON $2='ORGANIZATION'
        AND c.repository_id=a.repository_id
        AND c.user_id=a.principal_id
       WHERE a.repository_id=$1
       ORDER BY a.principal_id`,
      [repository.id, repository.owner_account_kind],
    )
  ).rows.map((row) => ({
    userId: String(row.userId),
    capability: row.capability as RepositoryPermission,
    version: Number(row.version),
    isOutsideCollaborator: Boolean(row.isOutsideCollaborator),
  }));
  const teamGrants = (
    await sql.query(
      `SELECT team_id AS "teamId",capability,version
       FROM repository_team_access WHERE repository_id=$1 ORDER BY team_id`,
      [repository.id],
    )
  ).rows.map((row) => ({
    teamId: String(row.teamId),
    capability: row.capability as RepositoryPermission,
    version: Number(row.version),
  }));
  return {
    repository: {
      id: repository.id,
      ownerAccountId: repository.owner_account_id,
      ownerKind: repository.owner_account_kind,
      ownerLogin: owner.login,
      name: repository.name,
      actorPermissions: (await actorPermissions(sql, repository.id, userId)) ?? [],
    },
    directUserGrants,
    teamGrants,
  };
}

function readReceipt(
  previous: { fingerprint: string; result: unknown } | undefined,
  commandFingerprint: string,
): RepositoryAccessReceipt | null {
  if (!previous) return null;
  if (previous.fingerprint !== commandFingerprint) {
    throw new RepositoryError(409, "此請求編號已用於不同 Repository 操作。");
  }
  const receipt = previous.result as Partial<Receipt>;
  const result = receipt.result as Partial<RepositoryAccessReceipt> | undefined;
  if (
    receipt.receiptVersion !== 1 ||
    receipt.family !== "repository-access" ||
    (receipt.action !== "grant" && receipt.action !== "revoke") ||
    !result ||
    typeof result.requestId !== "string" ||
    typeof result.repositoryId !== "string" ||
    (result.subjectKind !== "USER" && result.subjectKind !== "TEAM") ||
    typeof result.subjectId !== "string" ||
    (result.capability !== null &&
      result.capability !== "read" &&
      result.capability !== "triage" &&
      result.capability !== "triage_plus" &&
      result.capability !== "write" &&
      result.capability !== "maintain" &&
      result.capability !== "admin") ||
    (result.version !== null && !Number.isSafeInteger(result.version)) ||
    !Number.isSafeInteger(result.at)
  ) {
    throw new RepositoryError(503, "Repository access 回執無法讀取。");
  }
  return result as RepositoryAccessReceipt;
}

function accessMutationError(error: unknown): never {
  const code = (error as { code?: string }).code;
  if (code === "22023") throw new RepositoryError(400, "Repository access 操作格式不正確。");
  if (code === "42501") throw new RepositoryError(403, "Repository access 資格不符。");
  if (code === "P0002") throw new RepositoryError(404, "找不到 Repository。");
  if (code === "40001" || code === "23503" || code === "23514") {
    throw new RepositoryError(409, "Repository access 狀態已變更，請重新載入。");
  }
  throw error;
}

export class PostgresRepositoryAccessStore implements RepositoryAccessStore {
  constructor(private readonly db: Database = businessDatabase()) {}

  view(userId: string, selector: RepositorySelector): Promise<RepositoryAccessSnapshot> {
    return this.db.transaction(async (sql) => {
      const actor = await readActiveUserQualification(sql, userId, "share");
      if (!actor) throw new RepositoryError(403, "目前 User 資格不能管理 Repository access。");
      const repository = await repositoryRow(sql, selector);
      await requireManagementAuthority(sql, repository, userId);
      return snapshot(sql, repository, userId);
    });
  }

  execute(
    userId: string,
    command: RepositoryAccessCommand,
    now: number,
  ): Promise<RepositoryAccessReceipt> {
    const commandFingerprint = fingerprint(command);
    return this.db.transaction(async (sql) => {
      await sql.query("SELECT pg_advisory_xact_lock(71020260912::bigint)");
      const actor = await readActiveUserQualification(sql, userId, "update");
      if (!actor) throw new RepositoryError(403, "目前 User 資格不能管理 Repository access。");

      const repository = await repositoryRow(sql, { repositoryId: command.repositoryId });
      await requireManagementAuthority(sql, repository, userId);

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

      let changed:
        | { result_capability: RepositoryPermission | null; result_version: number | null }
        | undefined;
      try {
        changed = (
          await sql.query(
            `SELECT result_capability,result_version
             FROM app_private.mutate_repository_access($1,$2,$3,$4,$5,$6)`,
            [
              userId,
              repository.id,
              command.subjectKind,
              command.subjectId,
              command.action === "grant" ? command.capability : null,
              command.expectedVersion,
            ],
          )
        ).rows[0] as
          | { result_capability: RepositoryPermission | null; result_version: number | null }
          | undefined;
      } catch (error) {
        accessMutationError(error);
      }
      if (!changed) throw new RepositoryError(503, "Repository access 更新結果不完整。");

      const result: RepositoryAccessReceipt = {
        requestId: command.requestId,
        repositoryId: repository.id,
        subjectKind: command.subjectKind,
        subjectId: command.subjectId,
        capability: changed.result_capability,
        version: changed.result_version,
        at: now,
      };
      const receipt: Receipt = {
        receiptVersion: 1,
        family: "repository-access",
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
