import { readActiveUserQualification } from "@line_bot_v1/account/postgres";
import type { Sql } from "@line_bot_v1/platform/postgres";
import { booleanValue, stringValue } from "@line_bot_v1/platform/validation";
import { RepositoryError } from "../contracts/errors/repository-error.js";
import type { RepositorySelector } from "../contracts/selectors.js";
import { authorizedRepository } from "./access.js";
import { repositoryOwnerKind, repositoryVisibility } from "./decode.js";

/** Retains qualification/governance/repository locks in the caller's transaction. */
export async function repositoryContentScope(
  sql: Sql,
  userId: string,
  selector: RepositorySelector,
) {
  await sql.query("SELECT app_private.lock_governance('shared')");
  if (!(await readActiveUserQualification(sql, userId, "share")))
    throw new RepositoryError(403, "目前 User 資格不可用。");
  const repository = await authorizedRepository(sql, { userId }, selector);
  const row = (
    await sql.query(
      "SELECT is_archived,owner_account_id,owner_account_kind,visibility FROM repositories WHERE id=$1 FOR UPDATE",
      [repository.id],
      (r) => ({
        archived: booleanValue(r.is_archived),
        ownerAccountId: stringValue(r.owner_account_id),
        ownerKind: repositoryOwnerKind(r.owner_account_kind),
        visibility: repositoryVisibility(r.visibility),
      }),
    )
  ).rows[0];
  if (!row) throw new RepositoryError(404, "找不到 Repository。");
  // Re-read after the row lock: an access/visibility/lifecycle writer may have committed while waiting.
  const current = await authorizedRepository(sql, { userId }, { repositoryId: repository.id });
  return { repository: current, ...row };
}
