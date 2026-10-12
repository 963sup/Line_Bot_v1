import type { Sql } from "@line_bot_v1/platform/postgres";
import {
  literalValue,
  nullableString,
  numberValue,
  numericValue,
  stringValue,
} from "@line_bot_v1/platform/validation";
import { requireActiveUser, type User, UserError } from "../domain/user.js";

export type UserQualification = Readonly<{
  id: string;
  status: User["status"];
  statusVersion: number;
  createdAt: number;
  authUserId: string | null;
}>;

function qualificationRow(row: Record<string, unknown>): UserQualification {
  return {
    id: stringValue(row.id),
    status: literalValue(row.status, ["paused", "active", "suspended"]),
    statusVersion: numberValue(row.status_version),
    createdAt: Number(numericValue(row.createdAt)),
    authUserId: nullableString(row.auth_user_id),
  };
}

export async function readUserQualification(
  sql: Sql,
  id: string,
  lock: "none" | "share" | "update" = "none",
): Promise<UserQualification | null> {
  const suffix = lock === "share" ? " FOR SHARE" : lock === "update" ? " FOR UPDATE" : "";
  const row = (
    await sql.query(
      `SELECT id,status,status_version,auth_user_id,"createdAt" FROM users WHERE id=$1${suffix}`,
      [id],
      qualificationRow,
    )
  ).rows[0];
  return row ?? null;
}

export async function readActiveUserQualification(
  sql: Sql,
  id: string,
  lock: "none" | "share" | "update" = "none",
): Promise<UserQualification | null> {
  const user = await readUserQualification(sql, id, lock);
  return user?.status === "active" ? user : null;
}

/** The caller's transaction retains the row lock until its full operation commits or rolls back. */
export async function qualifyActiveUser(
  sql: Sql,
  id: string,
  authId?: string,
): Promise<UserQualification> {
  const qualification = await readUserQualification(sql, id, "update");
  if (!qualification) throw new UserError(404, "會員不存在。");
  requireActiveUser({
    id: qualification.id,
    status: qualification.status,
    createdAt: qualification.createdAt,
  });
  if (authId && authId !== qualification.authUserId) {
    throw new UserError(403, "請重新確認會員綁定。");
  }
  return qualification;
}

export async function hasUserIdentity(
  sql: Sql,
  userId: string,
  provider: string,
  subject: string,
): Promise<boolean> {
  return Boolean(
    (
      await sql.query(
        "SELECT 1 FROM user_identities WHERE user_id=$1 AND provider=$2 AND subject=$3",
        [userId, provider, subject],
      )
    ).rows[0],
  );
}

export async function readUserByIdentity(
  sql: Sql,
  provider: string,
  subject: string,
  lock: "none" | "share" | "update" = "none",
): Promise<UserQualification | null> {
  const suffix =
    lock === "share" ? " FOR SHARE OF u,i" : lock === "update" ? " FOR UPDATE OF u" : "";
  const row = (
    await sql.query(
      `SELECT u.id,u.status,u.status_version,u.auth_user_id,u."createdAt"
       FROM user_identities i
       JOIN users u ON u.id=i.user_id
       WHERE i.provider=$1 AND i.subject=$2${suffix}`,
      [provider, subject],
      qualificationRow,
    )
  ).rows[0];
  return row ?? null;
}
