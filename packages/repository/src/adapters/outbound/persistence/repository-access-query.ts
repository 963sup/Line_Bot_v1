import { readActiveUserQualification } from "@line_bot_v1/account/postgres";
import { readAccountLogin, resolveAccountLogin } from "@line_bot_v1/namespace/postgres";
import type { Database, Sql, SqlRow } from "@line_bot_v1/platform/postgres";
import { booleanValue, numberValue, stringValue } from "@line_bot_v1/platform/validation";
import type { RepositoryAccessSnapshot } from "../../../contracts/input/repository-access.js";
import { RepositoryError } from "../../../contracts/repository.js";
import type { RepositorySelector } from "../../../contracts/selectors.js";
import {
  hasRepositoryPermission,
  type RepositoryPermission,
} from "../../../domain/repository/value-objects/repository-capability.js";
import {
  decodePermissionsRow,
  repositoryOwnerKind,
  repositoryPermission,
} from "../../../postgres/decode.js";

type RepositoryRow = {
  id: string;
  owner_account_id: string;
  owner_account_kind: "USER" | "ORGANIZATION";
  name: string;
};

function decodeRepositoryRow(row: SqlRow): RepositoryRow {
  return {
    id: stringValue(row.id),
    owner_account_id: stringValue(row.owner_account_id),
    owner_account_kind: repositoryOwnerKind(row.owner_account_kind),
    name: stringValue(row.name),
  };
}

async function repositoryRow(sql: Sql, selector: RepositorySelector): Promise<RepositoryRow> {
  if ("repositoryId" in selector) {
    const row = (
      await sql.query(
        "SELECT id,owner_account_id,owner_account_kind,name FROM repositories WHERE id=$1",
        [selector.repositoryId],
        decodeRepositoryRow,
      )
    ).rows[0];
    if (!row) throw new RepositoryError(404, "找不到 Repository。");
    return row;
  }
  const owner = await resolveAccountLogin(sql, selector.ownerLogin);
  if (!owner) throw new RepositoryError(404, "找不到 Repository。");
  const row = (
    await sql.query(
      `SELECT id,owner_account_id,owner_account_kind,name
       FROM repositories
       WHERE owner_account_id=$1 AND owner_account_kind=$2 AND lower(name)=lower($3)`,
      [owner.id, owner.kind, selector.repositoryName],
      decodeRepositoryRow,
    )
  ).rows[0];
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
      decodeRepositoryRow,
    )
  ).rows;
  if (historical.length !== 1) throw new RepositoryError(404, "找不到 Repository。");
  const repository = historical[0];
  if (!repository) throw new RepositoryError(404, "找不到 Repository。");
  return repository;
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
      decodePermissionsRow,
    )
  ).rows[0];
  return row?.permissions ?? null;
}

async function requireManagementAuthority(sql: Sql, repositoryId: string, userId: string) {
  const permissions = await actorPermissions(sql, repositoryId, userId);
  if (permissions && hasRepositoryPermission(permissions, "admin")) return;
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
      (row) => ({
        userId: stringValue(row.userId),
        capability: repositoryPermission(row.capability),
        version: numberValue(row.version),
        isOutsideCollaborator: booleanValue(row.isOutsideCollaborator),
      }),
    )
  ).rows;
  const teamGrants = (
    await sql.query(
      `SELECT team_id AS "teamId",capability,version
       FROM repository_team_access WHERE repository_id=$1 ORDER BY team_id`,
      [repository.id],
      (row) => ({
        teamId: stringValue(row.teamId),
        capability: repositoryPermission(row.capability),
        version: numberValue(row.version),
      }),
    )
  ).rows;
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

export class PostgresRepositoryAccessQuery {
  constructor(private readonly db: Database) {}

  view(userId: string, selector: RepositorySelector): Promise<RepositoryAccessSnapshot> {
    return this.db.transaction(async (sql) => {
      const actor = await readActiveUserQualification(sql, userId, "share");
      if (!actor) throw new RepositoryError(403, "目前 User 資格不能管理 Repository access。");
      const repository = await repositoryRow(sql, selector);
      await requireManagementAuthority(sql, repository.id, userId);
      return snapshot(sql, repository, userId);
    });
  }
}
