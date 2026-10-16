import { readActiveUserQualification } from "@line_bot_v1/account/postgres";
import {
  readAccountLogin,
  resolveAccountLogin,
  resolveScopedName,
} from "@line_bot_v1/namespace/postgres";
import type { Database, Sql } from "@line_bot_v1/platform/postgres";
import { stringValue } from "@line_bot_v1/platform/validation";
import type { RepositoryManagementSnapshot } from "../../../contracts/input/repository-management.js";
import { RepositoryError } from "../../../contracts/repository.js";
import type { RepositorySelector } from "../../../contracts/selectors.js";
import type { RepositoryLifecycleState } from "../../../domain/repository/entities/repository.js";
import type { RepositoryPermission } from "../../../domain/repository/value-objects/repository-capability.js";
import { decodePermissionsRow } from "../../../postgres/decode.js";
import { decodeRepositoryLifecycle, repositoryLifecycleColumns } from "./repository-management.js";

async function repositoryBySelector(
  sql: Sql,
  selector: RepositorySelector,
): Promise<RepositoryLifecycleState> {
  if ("repositoryId" in selector) {
    const row = (
      await sql.query(
        `SELECT ${repositoryLifecycleColumns} FROM repositories WHERE id=$1`,
        [selector.repositoryId],
        decodeRepositoryLifecycle,
      )
    ).rows[0];
    if (!row) throw new RepositoryError(404, "找不到 Repository。");
    return row;
  }

  const owner = await resolveAccountLogin(sql, selector.ownerLogin);
  if (!owner) throw new RepositoryError(404, "找不到 Repository。");
  const binding = await resolveScopedName(
    sql,
    { family: "repository-name", scopeKind: "OWNER_ACCOUNT", scopeId: owner.id },
    selector.repositoryName,
  );
  if (!binding || (binding.alias && selector.followRenames === false)) {
    throw new RepositoryError(404, "找不到 Repository。");
  }
  const repository = (
    await sql.query(
      `SELECT ${repositoryLifecycleColumns}
       FROM repositories
       WHERE id=$1 AND owner_account_id=$2 AND owner_account_kind=$3`,
      [binding.targetId, owner.id, owner.kind],
      decodeRepositoryLifecycle,
    )
  ).rows[0];
  if (!repository) throw new RepositoryError(404, "找不到 Repository。");
  return repository;
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
      decodePermissionsRow,
    )
  ).rows[0];
  return row?.permissions ?? [];
}

async function internalEnterpriseId(
  sql: Sql,
  repository: RepositoryLifecycleState,
): Promise<string | null> {
  if (repository.ownerKind !== "ORGANIZATION") return null;
  const row = (
    await sql.query(
      `SELECT enterprise_account_id
       FROM repository_internal_scopes
       WHERE organization_account_id=$1
       LIMIT 1`,
      [repository.ownerAccountId],
      (value) => ({ enterpriseAccountId: stringValue(value.enterprise_account_id) }),
    )
  ).rows[0];
  return row?.enterpriseAccountId ?? null;
}

export class PostgresRepositoryManagementQuery {
  constructor(private readonly db: Database) {}

  view(userId: string, selector: RepositorySelector): Promise<RepositoryManagementSnapshot> {
    return this.db.transaction(async (sql) => {
      const actor = await readActiveUserQualification(sql, userId, "share");
      if (!actor) throw new RepositoryError(403, "目前 User 資格不能讀取 Repository 設定。");
      const repository = await repositoryBySelector(sql, selector);
      const permissions = await actorPermissions(sql, repository.id, userId);
      if (!permissions.length) {
        throw new RepositoryError(403, "目前不是此 Repository 的有效成員。");
      }
      const owner = await readAccountLogin(sql, repository.ownerAccountId, repository.ownerKind);
      if (!owner) throw new RepositoryError(409, "Repository owner locator 不可用。");
      return {
        repository: {
          id: repository.id,
          actorUserId: userId,
          ownerAccountId: repository.ownerAccountId,
          ownerKind: repository.ownerKind,
          ownerLogin: owner.login,
          name: repository.name,
          visibility: repository.visibility,
          archived: repository.archived,
          version: repository.version,
          actorPermissions: permissions,
          internalEnterpriseId: await internalEnterpriseId(sql, repository),
        },
      };
    });
  }
}
