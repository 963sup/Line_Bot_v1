import { readAccountLogin, resolveAccountLogin } from "@line-work/account/adapters/postgres";
import type { Sql } from "@line-work/platform/adapters/postgres";
import type { RepositorySelector } from "../../application/ports/selectors.js";
import { IssueError, type RepositoryCapability, type RepositorySummary } from "../../domain.js";

export type RepositoryIdentity = { userId: string };

export async function accessibleRepositories(
  sql: Sql,
  userId: string,
): Promise<RepositorySummary[]> {
  const rows = (
    await sql.query(
      `SELECT r.id,r.owner_account_id,r.owner_account_kind,r.name,a.capability
       FROM repositories r
       JOIN repository_effective_access a ON a.repository_id=r.id
       WHERE a.user_id=$1
       ORDER BY lower(r.name),r.id`,
      [userId],
    )
  ).rows as Array<{
    id: string;
    owner_account_id: string;
    owner_account_kind: "USER" | "ORGANIZATION";
    name: string;
    capability: RepositoryCapability;
  }>;
  const result: RepositorySummary[] = [];
  for (const row of rows) {
    const owner = await readAccountLogin(sql, row.owner_account_id, row.owner_account_kind);
    if (owner) {
      result.push({
        id: row.id,
        ownerLogin: owner.login,
        name: row.name,
        capability: row.capability,
      });
    }
  }
  return result;
}

export async function repositoryScope(
  sql: Sql,
  identity: RepositoryIdentity,
  repositoryId: string,
) {
  const access = await repositoryAccess(sql, identity, repositoryId);
  const participants = (
    await sql.query(
      `SELECT user_id
       FROM repository_effective_access
       WHERE repository_id=$1
       ORDER BY user_id`,
      [repositoryId],
    )
  ).rows as Array<{ user_id: string }>;
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
      `SELECT r.id,r.owner_account_id,r.owner_account_kind,r.name,a.capability
       FROM repositories r
       JOIN repository_effective_access a ON a.repository_id=r.id
       WHERE r.id=$1 AND a.user_id=$2`,
      [repositoryId, identity.userId],
    )
  ).rows[0] as
    | {
        id: string;
        owner_account_id: string;
        owner_account_kind: "USER" | "ORGANIZATION";
        name: string;
        capability: RepositoryCapability;
      }
    | undefined;
  if (!row) throw new IssueError(403, "沒有此 Repository 的存取權限。");
  const owner = await readAccountLogin(sql, row.owner_account_id, row.owner_account_kind);
  if (!owner) throw new IssueError(409, "Repository owner locator 不可用。");
  const access: RepositorySummary = {
    id: row.id,
    ownerLogin: owner.login,
    name: row.name,
    capability: row.capability,
  };
  return access;
}

export async function resolveAuthorizedRepositoryId(
  sql: Sql,
  identity: RepositoryIdentity,
  selector: RepositorySelector,
): Promise<string> {
  if ("repositoryId" in selector) return selector.repositoryId;
  const owner = await resolveAccountLogin(sql, selector.ownerLogin);
  if (!owner) throw new IssueError(404, "找不到可存取的 Repository。");
  const row = (
    await sql.query(
      `SELECT r.id
       FROM repositories r
       JOIN repository_effective_access a ON a.repository_id=r.id
       WHERE r.owner_account_id=$1
         AND r.owner_account_kind=$2
         AND lower(r.name)=lower($3)
         AND a.user_id=$4`,
      [owner.id, owner.kind, selector.repositoryName, identity.userId],
    )
  ).rows[0] as { id: string } | undefined;
  if (!row) throw new IssueError(404, "找不到可存取的 Repository。");
  return row.id;
}

export async function authorizedRepository(
  sql: Sql,
  identity: RepositoryIdentity,
  selector: RepositorySelector,
): Promise<RepositorySummary> {
  const repositoryId = await resolveAuthorizedRepositoryId(sql, identity, selector);
  return repositoryAccess(sql, identity, repositoryId);
}
