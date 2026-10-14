import { readActiveUserQualification } from "@line_bot_v1/account/postgres";
import type { Sql } from "@line_bot_v1/platform/postgres";
import { stringValue } from "@line_bot_v1/platform/validation";
import { RepositoryError } from "../domain.js";
import { authorizedRepository } from "./access.js";

/** Explicit recipients may be UNSUBSCRIBED; IGNORED and current access always win. */
export async function explicitRepositoryRecipient(sql: Sql, userId: string, repositoryId: string) {
  if (!(await readActiveUserQualification(sql, userId, "share"))) return false;
  try {
    await authorizedRepository(sql, { userId }, { repositoryId });
  } catch (error) {
    if (error instanceof RepositoryError && [403, 404].includes(error.status)) return false;
    throw error;
  }
  const row = (
    await sql.query(
      "SELECT state FROM repository_subscriptions WHERE repository_id=$1 AND user_id=$2 FOR SHARE",
      [repositoryId, userId],
      (r) => ({ state: stringValue(r.state) }),
    )
  ).rows[0];
  return row?.state !== "IGNORED";
}
