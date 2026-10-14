import type { Sql } from "@line_bot_v1/platform/postgres";
import { stringValue } from "@line_bot_v1/platform/validation";
import { readActiveUserQualification } from "./qualification.js";

/** Current binding only; provider syntax remains the integration owner's responsibility. */
export async function readUserDeliveryTarget(sql: Sql, userId: string, provider: string) {
  if (!(await readActiveUserQualification(sql, userId, "share"))) return null;
  const rows = (
    await sql.query(
      "SELECT subject FROM user_identities WHERE user_id=$1 AND provider=$2 FOR SHARE",
      [userId, provider],
      (r) => ({ subject: stringValue(r.subject) }),
    )
  ).rows;
  return rows.length === 1 ? (rows[0]?.subject ?? null) : null;
}
