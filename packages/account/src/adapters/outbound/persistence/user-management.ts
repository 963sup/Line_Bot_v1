import { createHash } from "node:crypto";
import { businessDatabase, type Database, type Sql } from "@line_bot_v1/platform/postgres";
import {
  booleanValue,
  literalValue,
  numberValue,
  numericValue,
  record,
  stringValue,
} from "@line_bot_v1/platform/validation";
import type {
  UserManagementPersistence,
  UserManagementTransaction,
} from "../../../contracts/output/user-management-transactions.js";
import type {
  ManagedUser,
  UserManagementQuery,
  UserManagementView,
  UserStatusReceipt,
} from "../../../contracts/user-management.js";
import type { UserStatusCommand } from "../../../domain/user.js";
import { requireUserManagementPermissions, UserError } from "../../../domain/user.js";
import {
  type UserManagementAuthorization,
  unavailableAccountAuthorization,
} from "../../../postgres/authority.js";

const projection = `m.id,m.status,m."createdAt",m.status_version AS version,
  COALESCE(m.suspended_from,'paused') AS "restoreStatus",
  EXISTS(SELECT 1 FROM user_identities i WHERE i.user_id=m.id AND i.provider='google') AS "googleLinked"`;
type ManagedUserRow = {
  id: string;
  status: ManagedUser["status"];
  createdAt: number | string;
  version: number;
  restoreStatus: ManagedUser["restoreStatus"];
  googleLinked: boolean;
};
const present = (row: ManagedUserRow): ManagedUser => ({
  id: row.id,
  status: row.status,
  createdAt: Number(row.createdAt),
  version: row.version,
  restoreStatus: row.restoreStatus,
  googleLinked: row.googleLinked,
});

function managedUserRow(row: Record<string, unknown>): ManagedUserRow {
  return {
    id: stringValue(row.id),
    status: literalValue(row.status, ["active", "paused", "suspended"]),
    createdAt: numericValue(row.createdAt),
    version: numberValue(row.version),
    restoreStatus: literalValue(row.restoreStatus, ["active", "paused"]),
    googleLinked: booleanValue(row.googleLinked),
  };
}

function presentStoredReceipt(value: unknown): UserStatusReceipt {
  const stored = record(value);
  return {
    id: stringValue(stored.id),
    requestId: stringValue(stored.requestId),
    status:
      stored.status === "pending"
        ? "paused"
        : literalValue(stored.status, ["active", "paused", "suspended"]),
    version: numberValue(stored.version),
    at: numberValue(stored.at),
  };
}

function eventRow(row: Record<string, unknown>) {
  return { type: stringValue(row.type), at: numericValue(row.at) };
}

function operationRow(row: Record<string, unknown>) {
  return {
    actor: stringValue(row.actor),
    action: stringValue(row.action),
    reason: stringValue(row.reason),
    status: stringValue(row.status),
    version: numberValue(row.version),
    at: numericValue(row.at),
  };
}

function itemRow(row: Record<string, unknown>) {
  return { id: stringValue(row.id) };
}

function issueRow(row: Record<string, unknown>) {
  return { id: stringValue(row.id), total: numericValue(row.total) };
}

function storedCommandRow(row: Record<string, unknown>) {
  return { fingerprint: stringValue(row.fingerprint), result: row.result };
}

function targetStatusRow(row: Record<string, unknown>) {
  return {
    status: literalValue(row.status, ["active", "paused", "suspended"]),
    status_version: numberValue(row.status_version),
    suspended_from:
      row.suspended_from === null ? null : literalValue(row.suspended_from, ["active", "paused"]),
  };
}

function statusVersionRow(row: Record<string, unknown>) {
  return { status_version: numberValue(row.status_version) };
}

export class PostgresUserManagementPersistence implements UserManagementPersistence {
  constructor(
    private db: Database = businessDatabase(),
    private authorization: UserManagementAuthorization = unavailableAccountAuthorization,
  ) {}

  private async permissions(sql: Sql, actor: string) {
    const canRead = await this.authorization.hasPermission(sql, actor, "users.read");
    const canSuspend = await this.authorization.hasPermission(sql, actor, "users.suspend");
    return { canRead, canSuspend };
  }

  view(actor: string, query: UserManagementQuery): Promise<UserManagementView> {
    return this.db.transaction(async (sql) => {
      await sql.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
      const canSuspend = requireUserManagementPermissions(await this.permissions(sql, actor));
      const rows = (
        await sql.query(
          `SELECT ${projection} FROM users m
        WHERE ($1::text IS NULL OR m.id=$1) AND ($2::text IS NULL OR m.status=$2)
        AND ($3::text IS NULL OR m.id>$3) ORDER BY m.id LIMIT 21`,
          [query.id ?? null, query.status ?? null, query.after ?? null],
          managedUserRow,
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
            eventRow,
          )
        ).rows;
        const operations = (
          await sql.query(
            `SELECT actor,action,reason,status,version,at FROM user_management_commands
          WHERE target=$1 ORDER BY at DESC,request_id DESC LIMIT 21`,
            [query.id],
            operationRow,
          )
        ).rows;
        const open = (
          await sql.query(
            `SELECT item_id AS id FROM user_management_activity
             WHERE user_id=$1 AND activity_kind='open-attendance'
             ORDER BY item_id`,
            [query.id],
            itemRow,
          )
        ).rows;
        const issues = (
          await sql.query(
            `SELECT item_id AS id,count(*) OVER() AS total
             FROM user_management_activity
             WHERE user_id=$1 AND activity_kind='unfinished-issue'
             ORDER BY item_id LIMIT 20`,
            [query.id],
            issueRow,
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
      const nextUser = rows.length > 20 ? users[19] : undefined;
      if (rows.length > 20 && !nextUser) {
        throw new UserError(500, "使用者分頁結果不完整。");
      }
      return {
        actorId: actor,
        canSuspend,
        users,
        next: nextUser?.id ?? null,
        detail,
      };
    });
  }

  transact<T>(
    actor: string,
    command: UserStatusCommand,
    work: (transaction: UserManagementTransaction) => Promise<T>,
  ): Promise<T> {
    return this.db.transaction(async (sql) => {
      await sql.query("SELECT app_private.lock_governance('exclusive')");
      await sql.query("SELECT id FROM users WHERE id=ANY($1::text[]) ORDER BY id FOR UPDATE", [
        [actor, command.target],
      ]);
      let fingerprint: string | undefined;
      return work({
        permissions: () => this.permissions(sql, actor),
        replay: async () => {
          fingerprint = createHash("sha256").update(JSON.stringify(command)).digest("hex");
          const old = (
            await sql.query(
              "SELECT fingerprint,result FROM user_management_commands WHERE actor=$1 AND request_id=$2",
              [actor, command.requestId],
              storedCommandRow,
            )
          ).rows[0];
          if (!old) return null;
          return old.fingerprint === fingerprint
            ? { matches: true, result: presentStoredReceipt(old.result) }
            : { matches: false };
        },
        target: async () => {
          const target = (
            await sql.query(
              "SELECT status,status_version,suspended_from FROM users WHERE id=$1",
              [command.target],
              targetStatusRow,
            )
          ).rows[0];
          return target
            ? {
                status: target.status,
                version: target.status_version,
                restoreStatus: target.suspended_from ?? "paused",
              }
            : null;
        },
        protectAdministrator: () =>
          this.authorization.protectPermissionAdministrator(sql, command.target),
        writeStatus: async (status) => {
          const changed = (
            await sql.query(
              "UPDATE users SET status=$2 WHERE id=$1 RETURNING status_version",
              [command.target, status],
              statusVersionRow,
            )
          ).rows[0];
          if (!changed) throw new UserError(409, "使用者狀態已更新，請重新讀取後確認。");
          return changed.status_version;
        },
        record: async (result, previousStatus, event) => {
          if (fingerprint === undefined) throw new Error("User management replay was not checked");
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
              previousStatus,
              result.status,
              result.version,
              result.at,
              JSON.stringify(result),
            ],
          );
          await sql.query("INSERT INTO user_events(user_id,type,at) VALUES($1,$2,$3)", [
            command.target,
            event,
            result.at,
          ]);
        },
      });
    });
  }
}
