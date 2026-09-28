import { createHash } from "node:crypto";
import { readActiveUserQualification } from "@line_bot_v1/account/postgres";
import { isOrganizationOwner } from "@line_bot_v1/identity-access/postgres";
import { readAccountLogin, resolveAccountLogin } from "@line_bot_v1/namespace/postgres";
import { activeOrganizationParticipantIds } from "@line_bot_v1/organization/postgres";
import { businessDatabase, type Database, type Sql } from "@line_bot_v1/platform/postgres";
import type {
  RepositoryAccessCommand,
  RepositoryAccessReceipt,
  RepositoryAccessSnapshot,
  RepositoryAccessStore,
} from "../../application/ports/access.js";
import type { RepositorySelector } from "../../application/ports/selectors.js";
import { type RepositoryCapability, RepositoryError } from "../../domain.js";

type RepositoryRow = {
  id: string;
  owner_account_id: string;
  owner_account_kind: "USER" | "ORGANIZATION";
  name: string;
};

const fingerprint = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

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
  if (!row) throw new RepositoryError(404, "找不到 Repository。");
  return row;
}

async function actorCapability(
  sql: Sql,
  repositoryId: string,
  userId: string,
): Promise<RepositoryCapability | null> {
  const row = (
    await sql.query(
      "SELECT capability FROM repository_effective_access WHERE repository_id=$1 AND user_id=$2",
      [repositoryId, userId],
    )
  ).rows[0] as { capability: RepositoryCapability } | undefined;
  return row?.capability ?? null;
}

async function requireManagementAuthority(sql: Sql, repository: RepositoryRow, userId: string) {
  const capability = await actorCapability(sql, repository.id, userId);
  if (capability === "admin") return capability;
  if (
    repository.owner_account_kind === "ORGANIZATION" &&
    (await isOrganizationOwner(sql, repository.owner_account_id, userId))
  ) {
    return capability;
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
      `SELECT principal_id AS "userId",capability,version
       FROM repository_access WHERE repository_id=$1 ORDER BY principal_id`,
      [repository.id],
    )
  ).rows as RepositoryAccessSnapshot["directUserGrants"];
  const teamGrants = (
    await sql.query(
      `SELECT team_id AS "teamId",capability,version
       FROM repository_team_access WHERE repository_id=$1 ORDER BY team_id`,
      [repository.id],
    )
  ).rows as RepositoryAccessSnapshot["teamGrants"];
  return {
    repository: {
      id: repository.id,
      ownerAccountId: repository.owner_account_id,
      ownerKind: repository.owner_account_kind,
      ownerLogin: owner.login,
      name: repository.name,
      actorCapability: await actorCapability(sql, repository.id, userId),
    },
    directUserGrants,
    teamGrants,
  };
}

async function existingUserGrant(sql: Sql, repositoryId: string, userId: string) {
  return (
    await sql.query(
      `SELECT capability,version FROM repository_access
       WHERE repository_id=$1 AND principal_id=$2 FOR UPDATE`,
      [repositoryId, userId],
    )
  ).rows[0] as { capability: RepositoryCapability; version: number } | undefined;
}

async function existingTeamGrant(sql: Sql, repositoryId: string, teamId: string) {
  return (
    await sql.query(
      `SELECT capability,version FROM repository_team_access
       WHERE repository_id=$1 AND team_id=$2 FOR UPDATE`,
      [repositoryId, teamId],
    )
  ).rows[0] as { capability: RepositoryCapability; version: number } | undefined;
}

function requireExpectedVersion(current: { version: number } | undefined, expectedVersion: number) {
  if ((current?.version ?? 0) !== expectedVersion) {
    throw new RepositoryError(409, "Repository access 已更新，請重新載入。");
  }
}

async function requireEffectiveAdmin(sql: Sql, repositoryId: string) {
  const row = (
    await sql.query(
      `SELECT 1 FROM repository_effective_access
       WHERE repository_id=$1 AND capability='admin' LIMIT 1`,
      [repositoryId],
    )
  ).rows[0];
  if (!row) {
    throw new RepositoryError(409, "Repository 必須至少保留一個有效 admin access。");
  }
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
      const actor = await readActiveUserQualification(sql, userId, "update");
      if (!actor) throw new RepositoryError(403, "目前 User 資格不能管理 Repository access。");

      await sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `repository-command:${userId}:${command.requestId}`,
      ]);
      const previous = (
        await sql.query(
          "SELECT fingerprint,result FROM repository_commands WHERE actor=$1 AND request_id=$2",
          [userId, command.requestId],
        )
      ).rows[0] as { fingerprint: string; result: unknown } | undefined;
      if (previous) {
        if (previous.fingerprint !== commandFingerprint) {
          throw new RepositoryError(409, "此 Repository access 請求編號已用於不同內容。");
        }
        const receipt = previous.result as RepositoryAccessReceipt & { receiptVersion?: number };
        if (receipt.receiptVersion !== 1 || receipt.requestId !== command.requestId) {
          throw new RepositoryError(503, "Repository access 回執無法讀取。");
        }
        return receipt;
      }

      const repository = await repositoryRow(sql, { repositoryId: command.repositoryId }, true);
      await requireManagementAuthority(sql, repository, userId);

      let changedVersion: number | null = null;
      if (command.subjectKind === "USER") {
        if (
          repository.owner_account_kind === "USER" &&
          repository.owner_account_id === command.subjectId
        ) {
          throw new RepositoryError(
            409,
            "User-owned Repository owner 的 admin access 是固有權限。",
          );
        }
        const target = await readActiveUserQualification(sql, command.subjectId, "share");
        if (!target) throw new RepositoryError(400, "只能授權目前有效的 User。");
        if (repository.owner_account_kind === "ORGANIZATION") {
          const eligible = await activeOrganizationParticipantIds(
            sql,
            repository.owner_account_id,
            [command.subjectId],
          );
          if (!eligible.has(command.subjectId)) {
            throw new RepositoryError(403, "User 必須是此 Organization 的有效 member。");
          }
        }

        const current = await existingUserGrant(sql, repository.id, command.subjectId);
        requireExpectedVersion(current, command.expectedVersion);
        if (command.action === "grant") {
          if (current?.capability === command.capability) {
            throw new RepositoryError(409, "Repository User access 沒有變更。");
          }
          if (current) {
            const changed = (
              await sql.query(
                `UPDATE repository_access
                 SET capability=$3,version=version+1
                 WHERE repository_id=$1 AND principal_id=$2
                 RETURNING version`,
                [repository.id, command.subjectId, command.capability],
              )
            ).rows[0] as { version: number };
            changedVersion = Number(changed.version);
          } else {
            await sql.query(
              `INSERT INTO repository_access(repository_id,principal_id,capability,version)
               VALUES($1,$2,$3,1)`,
              [repository.id, command.subjectId, command.capability],
            );
            changedVersion = 1;
          }
        } else {
          if (!current) throw new RepositoryError(409, "Repository User access 已不存在。");
          await sql.query(
            "DELETE FROM repository_access WHERE repository_id=$1 AND principal_id=$2",
            [repository.id, command.subjectId],
          );
        }
      } else {
        if (repository.owner_account_kind !== "ORGANIZATION") {
          throw new RepositoryError(409, "只有 Organization-owned Repository 可授權 Team。");
        }
        const current = await existingTeamGrant(sql, repository.id, command.subjectId);
        requireExpectedVersion(current, command.expectedVersion);
        if (command.action === "grant") {
          if (current?.capability === command.capability) {
            throw new RepositoryError(409, "Repository Team access 沒有變更。");
          }
          try {
            if (current) {
              const changed = (
                await sql.query(
                  `UPDATE repository_team_access
                   SET capability=$3,version=version+1
                   WHERE repository_id=$1 AND team_id=$2
                   RETURNING version`,
                  [repository.id, command.subjectId, command.capability],
                )
              ).rows[0] as { version: number };
              changedVersion = Number(changed.version);
            } else {
              await sql.query(
                `INSERT INTO repository_team_access(
                   repository_id,organization_id,team_id,capability,version
                 ) VALUES($1,$2,$3,$4,1)`,
                [repository.id, repository.owner_account_id, command.subjectId, command.capability],
              );
              changedVersion = 1;
            }
          } catch (error) {
            if ((error as { code?: string }).code === "23503") {
              throw new RepositoryError(409, "Team 不屬於此 Repository 的 Organization scope。");
            }
            throw error;
          }
        } else {
          if (!current) throw new RepositoryError(409, "Repository Team access 已不存在。");
          await sql.query(
            "DELETE FROM repository_team_access WHERE repository_id=$1 AND team_id=$2",
            [repository.id, command.subjectId],
          );
        }
      }

      await requireEffectiveAdmin(sql, repository.id);
      const result = {
        receiptVersion: 1,
        requestId: command.requestId,
        repositoryId: repository.id,
        subjectKind: command.subjectKind,
        subjectId: command.subjectId,
        capability: command.action === "grant" ? command.capability : null,
        version: changedVersion,
        at: now,
      } as const;
      await sql.query(
        `INSERT INTO repository_commands(actor,request_id,fingerprint,result,at)
         VALUES($1,$2,$3,$4::jsonb,$5)`,
        [userId, command.requestId, commandFingerprint, JSON.stringify(result), now],
      );
      return result;
    });
  }
}
