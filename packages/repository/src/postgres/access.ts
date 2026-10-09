import {
  readAccountLogin,
  readAccountLogins,
  resolveAccountLogin,
} from "@line_bot_v1/namespace/postgres";
import type { Sql } from "@line_bot_v1/platform/postgres";
import type { RepositorySelector } from "../contracts/selectors.js";
import { RepositoryError, type RepositoryPermission, type RepositorySummary } from "../domain.js";

export type RepositoryIdentity = { userId: string };

type RepositoryAccessRow = {
  id: string;
  owner_account_id: string;
  owner_account_kind: "USER" | "ORGANIZATION";
  name: string;
  permissions: RepositoryPermission[];
};

async function repositorySummaries(
  sql: Sql,
  rows: RepositoryAccessRow[],
): Promise<RepositorySummary[]> {
  const owners = await readAccountLogins(
    sql,
    rows.map((row) => ({ id: row.owner_account_id, kind: row.owner_account_kind })),
  );
  const ownerLogins = new Map(owners.map((owner) => [`${owner.id}:\0:${owner.kind}`, owner.login]));
  return rows.flatMap((row) => {
    const ownerLogin = ownerLogins.get(`${row.owner_account_id}:\0:${row.owner_account_kind}`);
    return ownerLogin
      ? [
          {
            id: row.id,
            ownerLogin,
            name: row.name,
            permissions: row.permissions,
          },
        ]
      : [];
  });
}

export async function accessibleRepositories(
  sql: Sql,
  userId: string,
): Promise<RepositorySummary[]> {
  const rows = (
    await sql.query(
      `SELECT r.id,r.owner_account_id,r.owner_account_kind,r.name,a.permissions
       FROM repositories r
       JOIN repository_effective_access a ON a.repository_id=r.id
       WHERE a.user_id=$1
       ORDER BY lower(r.name),r.id`,
      [userId],
    )
  ).rows as RepositoryAccessRow[];
  return repositorySummaries(sql, rows);
}

/** Stable IDs for current effective Repository admins; no owner locator is needed for authorization. */
export async function repositoryAdministeredIds(sql: Sql, userId: string): Promise<string[]> {
  await sql.query("SELECT pg_advisory_xact_lock_shared(71020260912::bigint)");
  const rows = (
    await sql.query(
      `SELECT repository_id
       FROM repository_effective_access
       WHERE user_id=$1 AND 'admin'=ANY(permissions)
       ORDER BY repository_id`,
      [userId],
    )
  ).rows as Array<{ repository_id: string }>;
  return rows.map((row) => row.repository_id);
}

export async function readableRepositoriesByIds(
  sql: Sql,
  userId: string,
  repositoryIds: string[],
): Promise<RepositorySummary[]> {
  if (!repositoryIds.length) return [];
  const rows = (
    await sql.query(
      `SELECT
         r.id,
         r.owner_account_id,
         r.owner_account_kind,
         r.name,
         COALESCE(a.permissions,ARRAY[]::text[]) AS permissions
       FROM repositories r
       LEFT JOIN repository_effective_access a
         ON a.repository_id=r.id AND a.user_id=$1
       WHERE r.id=ANY($2::text[])
         AND EXISTS (
           SELECT 1
           FROM repository_visibility_access v
           WHERE v.repository_id=r.id
             AND (v.user_id=$1 OR v.user_id IS NULL)
         )
       ORDER BY r.id`,
      [userId, repositoryIds],
    )
  ).rows as RepositoryAccessRow[];
  return repositorySummaries(sql, rows);
}

export async function repositoryScope(
  sql: Sql,
  identity: RepositoryIdentity,
  repositoryId: string,
) {
  const access = await repositoryAccess(sql, identity, repositoryId);
  const participants = access.permissions.length
    ? ((
        await sql.query(
          `SELECT user_id
           FROM repository_effective_access
           WHERE repository_id=$1
           ORDER BY user_id`,
          [repositoryId],
        )
      ).rows as Array<{ user_id: string }>)
    : [];
  return {
    repository: access,
    participants: participants.map((row) => ({
      userId: row.user_id,
      name: row.user_id,
    })),
  };
}

async function repositoryAccess(
  sql: Sql,
  identity: RepositoryIdentity,
  repositoryId: string,
): Promise<RepositorySummary> {
  const row = (
    await sql.query(
      `SELECT
         r.id,
         r.owner_account_id,
         r.owner_account_kind,
         r.name,
         COALESCE(a.permissions,ARRAY[]::text[]) AS permissions
       FROM repositories r
       LEFT JOIN repository_effective_access a
         ON a.repository_id=r.id AND a.user_id=$2
       WHERE r.id=$1
         AND EXISTS (
           SELECT 1
           FROM repository_visibility_access v
           WHERE v.repository_id=r.id
             AND (v.user_id=$2 OR v.user_id IS NULL)
         )`,
      [repositoryId, identity.userId],
    )
  ).rows[0] as RepositoryAccessRow | undefined;
  if (!row) throw new RepositoryError(403, "沒有此 Repository 的讀取權限。");
  const owner = await readAccountLogin(sql, row.owner_account_id, row.owner_account_kind);
  if (!owner) throw new RepositoryError(409, "Repository owner locator 不可用。");
  return {
    id: row.id,
    ownerLogin: owner.login,
    name: row.name,
    permissions: row.permissions,
  };
}

async function currentRepositoryId(
  sql: Sql,
  ownerId: string,
  ownerKind: "USER" | "ORGANIZATION",
  repositoryName: string,
  userId: string,
): Promise<string | null> {
  const row = (
    await sql.query(
      `SELECT r.id
       FROM repositories r
       WHERE r.owner_account_id=$1
         AND r.owner_account_kind=$2
         AND lower(r.name)=lower($3)
         AND EXISTS (
           SELECT 1
           FROM repository_visibility_access v
           WHERE v.repository_id=r.id
             AND (v.user_id=$4 OR v.user_id IS NULL)
         )`,
      [ownerId, ownerKind, repositoryName, userId],
    )
  ).rows[0] as { id: string } | undefined;
  return row?.id ?? null;
}

export async function resolveAuthorizedRepositoryId(
  sql: Sql,
  identity: RepositoryIdentity,
  selector: RepositorySelector,
): Promise<string> {
  if ("repositoryId" in selector) {
    return (await repositoryAccess(sql, identity, selector.repositoryId)).id;
  }
  const owner = await resolveAccountLogin(sql, selector.ownerLogin);
  if (!owner) throw new RepositoryError(404, "找不到可存取的 Repository。");

  const currentId = await currentRepositoryId(
    sql,
    owner.id,
    owner.kind,
    selector.repositoryName,
    identity.userId,
  );
  if (currentId) return currentId;
  if (selector.followRenames === false) {
    throw new RepositoryError(404, "找不到可存取的 Repository。");
  }

  const rows = (
    await sql.query(
      `SELECT r.id
       FROM repository_name_history h
       JOIN repositories r ON r.id=h.repository_id
       WHERE r.owner_account_id=$1
         AND r.owner_account_kind=$2
         AND lower(h.old_name)=lower($3)
         AND EXISTS (
           SELECT 1
           FROM repository_visibility_access v
           WHERE v.repository_id=r.id
             AND (v.user_id=$4 OR v.user_id IS NULL)
         )
       ORDER BY h.renamed_at DESC,r.id
       LIMIT 2`,
      [owner.id, owner.kind, selector.repositoryName, identity.userId],
    )
  ).rows as Array<{ id: string }>;
  if (!rows.length) throw new RepositoryError(404, "找不到可存取的 Repository。");
  if (rows.length > 1) {
    throw new RepositoryError(409, "Repository 舊名稱解析不唯一，請使用目前名稱。");
  }
  return rows[0]!.id;
}

export async function authorizedRepository(
  sql: Sql,
  identity: RepositoryIdentity,
  selector: RepositorySelector,
): Promise<RepositorySummary> {
  const repositoryId = await resolveAuthorizedRepositoryId(sql, identity, selector);
  return repositoryAccess(sql, identity, repositoryId);
}

export type RepositoryOwnerIdentity = Readonly<{
  id: string;
  kind: "USER" | "ORGANIZATION";
}>;

export async function repositoryOwnerIdentity(
  sql: Sql,
  identity: RepositoryIdentity,
  repositoryId: string,
): Promise<RepositoryOwnerIdentity> {
  await repositoryAccess(sql, identity, repositoryId);
  const row = (
    await sql.query("SELECT owner_account_id,owner_account_kind FROM repositories WHERE id=$1", [
      repositoryId,
    ])
  ).rows[0] as
    | { owner_account_id: string; owner_account_kind: "USER" | "ORGANIZATION" }
    | undefined;
  if (!row) throw new RepositoryError(404, "找不到 Repository。");
  return { id: row.owner_account_id, kind: row.owner_account_kind };
}

export async function repositoryArchived(sql: Sql, repositoryId: string): Promise<boolean> {
  const row = (await sql.query("SELECT is_archived FROM repositories WHERE id=$1", [repositoryId]))
    .rows[0] as { is_archived: boolean } | undefined;
  if (!row) throw new RepositoryError(404, "找不到 Repository。");
  return Boolean(row.is_archived);
}
