import { readActiveUserQualification } from "@line_bot_v1/account/postgres";
import type { Sql } from "@line_bot_v1/platform/postgres";
import { booleanValue } from "@line_bot_v1/platform/validation";
import { RepositoryError } from "../contracts/repository.js";
import type { RepositorySelector } from "../contracts/selectors.js";
import { authorizedRepository } from "./access.js";

/** Retains qualification/governance/repository locks in the caller's transaction. */
export async function repositoryContentScope(
  sql: Sql,
  userId: string,
  selector: RepositorySelector,
) {
  if (!(await readActiveUserQualification(sql, userId, "share")))
    throw new RepositoryError(403, "目前 User 資格不可用。");
  await sql.query("SELECT app_private.lock_governance('shared')");
  const repository = await authorizedRepository(sql, { userId }, selector);
  const row = (
    await sql.query(
      "SELECT is_archived FROM repositories WHERE id=$1 FOR UPDATE",
      [repository.id],
      (r) => ({ archived: booleanValue(r.is_archived) }),
    )
  ).rows[0];
  if (!row) throw new RepositoryError(404, "找不到 Repository。");
  // Re-read after the row lock: an access/visibility/lifecycle writer may have committed while waiting.
  const current = await authorizedRepository(sql, { userId }, { repositoryId: repository.id });
  return { repository: current, archived: row.archived };
}
