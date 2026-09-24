import { createHash } from "node:crypto";
import { businessDatabase, type Database, type Sql } from "@line-work/platform/adapters/postgres";
import type { UserManagementRepository } from "../../application/ports/user-management.js";
import type {
  ManagedUser,
  UserManagementQuery,
  UserManagementView,
  UserStatusReceipt,
} from "../../contracts/user-management.js";
import type { UserStatusCommand } from "../../domain/user.js";
import { UserError } from "../../domain/user.js";
import { type UserManagementAuthorization, unavailableAccountAuthorization } from "./authority.js";

const projection = `m.id,m.status,m."createdAt",m.status_version AS version,
  COALESCE(m.suspended_from,'paused') AS "restoreStatus",
  EXISTS(SELECT 1 FROM user_identities i WHERE i.user_id=m.id AND i.provider='google') AS "googleLinked"`;
const present = (row: Record<string, any>): ManagedUser => ({
  id: row.id,
  status: row.status,
  createdAt: Number(row.createdAt),
  version: row.version,
  restoreStatus: row.restoreStatus,
  googleLinked: row.googleLinked,
});
const presentStoredReceipt = (stored: Record<string, unknown>): UserStatusReceipt => ({
  id: String(stored.id),
  requestId: String(stored.requestId),
  status: stored.status === "pending" ? "paused" : (stored.status as UserStatusReceipt["status"]),
  version: Number(stored.version),
  at: Number(stored.at),
});

export class PostgresUserManagement implements UserManagementRepository {
  constructor(
    private db: Database = businessDatabase(),
    private authorization: UserManagementAuthorization = unavailableAccountAuthorization,
  ) {}

  private async access(sql: Sql, actor: string, write = false) {
    const read = await this.authorization.hasPermission(sql, actor, "users.read");
    const canSuspend = await this.authorization.hasPermission(sql, actor, "users.suspend");
    if (!read || (write && !canSuspend)) {
      throw new UserError(403, "你沒有此操作的使用者管理權限。");
    }
    return canSuspend;
  }

  view(actor: string, query: UserManagementQuery): Promise<UserManagementView> {
    return this.db.transaction(async (sql) => {
      await sql.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
      const canSuspend = await this.access(sql, actor);
      const rows = (
        await sql.query(
          `SELECT ${projection} FROM users m
        WHERE ($1::text IS NULL OR m.id=$1) AND ($2::text IS NULL OR m.status=$2)
        AND ($3::text IS NULL OR m.id>$3) ORDER BY m.id LIMIT 21`,
          [query.id ?? null, query.status ?? null, query.after ?? null],
        )
      ).rows;
      const users = rows.slice(0, 20).map(present);
      let detail: UserManagementView["detail"] = null;
      if (query.id) {
        if (!users[0]) throw new UserError(404, "使用者不存在。");
        const events = (
          await sql.query(
            "SELECT type,at FROM user_events WHERE user_id=$1 ORDER BY at DESC,id DESC LIMIT 21",
            [query.id],
          )
        ).rows;
        const operations = (
          await sql.query(
            `SELECT actor,action,reason,status,version,at FROM user_management_commands
          WHERE target=$1 ORDER BY at DESC,request_id DESC LIMIT 21`,
            [query.id],
          )
        ).rows;
        const open = (
          await sql.query(
            `SELECT item_id AS id FROM user_management_activity
             WHERE user_id=$1 AND activity_kind='open-attendance'
             ORDER BY item_id`,
            [query.id],
          )
        ).rows;
        const issues = (
          await sql.query(
            `SELECT item_id AS id,count(*) OVER() AS total
             FROM user_management_activity
             WHERE user_id=$1 AND activity_kind='unfinished-issue'
             ORDER BY item_id LIMIT 20`,
            [query.id],
          )
        ).rows;
        detail = {
          user: users[0],
          events: events.slice(0, 20).map((e) => ({ type: e.type, at: Number(e.at) })),
          moreEvents: events.length > 20,
          operations: operations.slice(0, 20).map((e) => ({
            actor: e.actor,
            action: e.action,
            reason: e.reason,
            status: e.status,
            version: e.version,
            at: Number(e.at),
          })),
          moreOperations: operations.length > 20,
          openAttendance: open.map((r) => r.id),
          unfinishedIssues: issues.map((r) => r.id),
          unfinishedIssueCount: Number(issues[0]?.total ?? 0),
        };
      }
      return {
        actorId: actor,
        canSuspend,
        users,
        next: rows.length > 20 ? users[19]!.id : null,
        detail,
      };
    });
  }

  execute(actor: string, command: UserStatusCommand, now: number): Promise<UserStatusReceipt> {
    return this.db.transaction(async (sql) => {
      await sql.query("SELECT pg_advisory_xact_lock(71020260912::bigint)");
      await sql.query("SELECT id FROM users WHERE id=ANY($1::text[]) ORDER BY id FOR UPDATE", [
        [actor, command.target],
      ]);
      await this.access(sql, actor, true);
      if (actor === command.target) {
        throw new UserError(403, "不能從此頁停權或解除自己的帳號。");
      }
      const fingerprint = createHash("sha256").update(JSON.stringify(command)).digest("hex");
      const old = (
        await sql.query(
          "SELECT fingerprint,result FROM user_management_commands WHERE actor=$1 AND request_id=$2",
          [actor, command.requestId],
        )
      ).rows[0];
      if (old) {
        if (old.fingerprint !== fingerprint) throw new UserError(409, "操作編號已用於不同內容。");
        return presentStoredReceipt(old.result as Record<string, unknown>);
      }
      const target = (
        await sql.query("SELECT status,status_version,suspended_from FROM users WHERE id=$1", [
          command.target,
        ])
      ).rows[0];
      if (!target) throw new UserError(404, "使用者不存在。");
      if (target.status_version !== command.expectedVersion) {
        throw new UserError(409, "使用者狀態已更新，請重新讀取後確認。");
      }
      if ((command.action === "suspend") === (target.status === "suspended")) {
        throw new UserError(409, "使用者目前狀態不適用此操作。");
      }
      if (command.action === "suspend") {
        await this.authorization.protectPermissionAdministrator(sql, command.target);
      }
      const status =
        command.action === "suspend" ? "suspended" : (target.suspended_from ?? "paused");
      const changed = (
        await sql.query("UPDATE users SET status=$2 WHERE id=$1 RETURNING status_version", [
          command.target,
          status,
        ])
      ).rows[0]!;
      const result: UserStatusReceipt = {
        id: command.target,
        requestId: command.requestId,
        status,
        version: changed.status_version,
        at: now,
      };
      await this.access(sql, actor, true);
      await sql.query(
        `INSERT INTO user_management_commands(actor,request_id,target,fingerprint,action,reason,previous_status,status,version,at,result)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          actor,
          command.requestId,
          command.target,
          fingerprint,
          command.action,
          command.reason,
          target.status,
          status,
          result.version,
          now,
          JSON.stringify(result),
        ],
      );
      await sql.query("INSERT INTO user_events(user_id,type,at) VALUES($1,$2,$3)", [
        command.target,
        command.action === "suspend" ? "suspended" : "suspension_lifted",
        now,
      ]);
      return result;
    });
  }
}
