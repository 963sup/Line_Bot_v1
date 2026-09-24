import {
  readActiveUserQualification,
  readUserQualification,
} from "@line-work/account/adapters/postgres";
import { UserError } from "@line-work/account/domain/user";
import type { PermissionStore } from "@line-work/identity-access/application/permissions/ports";
import type {
  PermissionGrant,
  PermissionView,
} from "@line-work/identity-access/contracts/permissions";
import {
  type Permission,
  type PermissionCommand,
  PermissionError,
} from "@line-work/identity-access/domain/permission";
import { businessDatabase, type Database, type Sql } from "@line-work/platform/adapters/postgres";

async function permissionVersion(sql: Sql, userId: string, lock = false): Promise<number> {
  const row = (
    await sql.query(
      `SELECT version FROM permission_subject_versions WHERE user_id=$1${lock ? " FOR UPDATE" : ""}`,
      [userId],
    )
  ).rows[0] as { version: number } | undefined;
  return Number(row?.version ?? 0);
}

async function advancePermissionVersion(
  sql: Sql,
  userId: string,
  current: number,
): Promise<number> {
  const next = current + 1;
  await sql.query(
    `INSERT INTO permission_subject_versions(user_id,version) VALUES($1,$2)
     ON CONFLICT(user_id) DO UPDATE SET version=EXCLUDED.version`,
    [userId, next],
  );
  return next;
}

export async function hasPermission(
  sql: Sql,
  actor: string,
  permission: Permission,
  workplaceId: string | null = null,
) {
  const user = await readActiveUserQualification(sql, actor, "share");
  if (!user) return false;
  return Boolean(
    (
      await sql.query(
        `SELECT 1 FROM permission_grants
         WHERE user_id=$1 AND user_version=$2 AND permission=$3
           AND (workplace_id IS NULL OR workplace_id=$4::uuid)`,
        [actor, user.statusVersion, permission, workplaceId],
      )
    ).rows.length,
  );
}

export async function workplacePermissionScope(sql: Sql, actor: string) {
  const user = await readActiveUserQualification(sql, actor, "share");
  if (!user) return { global: false, workplaceIds: [] as string[] };
  const rows = (
    await sql.query(
      `SELECT workplace_id FROM permission_grants
       WHERE user_id=$1 AND user_version=$2 AND permission='workplaces.manage'
       ORDER BY workplace_id NULLS FIRST`,
      [actor, user.statusVersion],
    )
  ).rows as Array<{ workplace_id: string | null }>;
  return {
    global: rows.some((row) => row.workplace_id === null),
    workplaceIds: rows.flatMap((row) => (row.workplace_id ? [row.workplace_id] : [])),
  };
}

async function manager(sql: Sql, actor: string) {
  const assignment = (
    await sql.query("SELECT user_version FROM permission_administrators WHERE user_id=$1", [actor])
  ).rows[0] as { user_version: number } | undefined;
  if (!assignment) return false;
  const user = await readActiveUserQualification(sql, actor, "share");
  return Boolean(user && user.statusVersion === Number(assignment.user_version));
}

export async function protectPermissionAdministrator(sql: Sql, userId: string) {
  const assignment = (
    await sql.query("SELECT user_version FROM permission_administrators WHERE user_id=$1", [userId])
  ).rows[0] as { user_version: number } | undefined;
  if (!assignment) return;

  const current = await readActiveUserQualification(sql, userId, "share");
  if (!current || current.statusVersion !== Number(assignment.user_version)) return;

  const others = (
    await sql.query(
      "SELECT user_id,user_version FROM permission_administrators WHERE user_id<>$1 ORDER BY user_id",
      [userId],
    )
  ).rows as Array<{ user_id: string; user_version: number }>;
  for (const other of others) {
    const qualification = await readActiveUserQualification(sql, other.user_id, "share");
    if (qualification?.statusVersion === Number(other.user_version)) return;
  }
  throw new PermissionError(409, "不能停用最後一位有效權限管理員，請先指定另一位管理員。");
}

async function grants(sql: Sql, id: string): Promise<PermissionGrant[]> {
  const qualification = await readUserQualification(sql, id);
  const rows = (
    await sql.query(
      `SELECT g.permission,g.workplace_id AS "workplaceId",w.name AS "workplaceName",g.user_version
       FROM permission_grants g
       LEFT JOIN permission_workplace_targets w ON w.id=g.workplace_id
       WHERE g.user_id=$1
       ORDER BY g.permission,g.workplace_id NULLS FIRST`,
      [id],
    )
  ).rows as Array<{
    permission: string;
    workplaceId: string | null;
    workplaceName: string | null;
    user_version: number;
  }>;
  return rows.map((row) => ({
    permission: row.permission,
    workplaceId: row.workplaceId,
    workplaceName: row.workplaceName,
    effective:
      qualification?.status === "active" &&
      Number(row.user_version) === qualification.statusVersion,
  }));
}

export class PostgresPermissionStore implements PermissionStore {
  constructor(private db: Database = businessDatabase()) {}

  read(actor: string, target: string): Promise<PermissionView> {
    return this.db.transaction(async (sql) => {
      await sql.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
      if (!(await readActiveUserQualification(sql, actor, "share"))) {
        throw new UserError(403, "需要有效使用者。");
      }
      const canManage = await manager(sql, actor);
      if (target && !canManage) throw new PermissionError(403, "沒有權限管理資格。");
      const own = await grants(sql, actor);
      if (!target) {
        return {
          userId: actor,
          canManage,
          own,
          target: null,
          history: [],
          moreHistory: false,
        };
      }

      const user = await readUserQualification(sql, target);
      if (!user) throw new UserError(404, "使用者不存在。");
      const version = await permissionVersion(sql, target);
      const rows = (
        await sql.query(
          `SELECT request_id AS "requestId",actor,command->>'permission' AS permission,
                  command->>'workplaceId' AS "workplaceId",
                  (command->>'enabled')::boolean AS enabled,
                  command->>'reason' AS reason,at
           FROM permission_commands
           WHERE target=$1
           ORDER BY at DESC,request_id DESC
           LIMIT 21`,
          [target],
        )
      ).rows;
      return {
        userId: actor,
        canManage,
        own,
        target: {
          id: user.id,
          status: user.status,
          version,
          grants: await grants(sql, target),
        },
        history: rows.slice(0, 20).map((row) => ({
          ...row,
          permission: row.permission,
          at: Number(row.at),
        })) as PermissionView["history"],
        moreHistory: rows.length > 20,
      };
    });
  }

  change(actor: string, c: PermissionCommand, now: number) {
    return this.db.transaction(async (sql) => {
      await sql.query("SELECT pg_advisory_xact_lock(71020260912::bigint)");

      const qualifications = new Map<string, Awaited<ReturnType<typeof readUserQualification>>>();
      for (const userId of [...new Set([actor, c.target])].sort()) {
        qualifications.set(userId, await readUserQualification(sql, userId, "update"));
      }

      if (!(await manager(sql, actor))) throw new PermissionError(403, "沒有權限管理資格。");
      if (actor === c.target) {
        throw new PermissionError(403, "不能修改自己的業務權限，請由另一位權限管理員處理。");
      }
      const previous = (
        await sql.query(
          "SELECT command=$3::jsonb AS matches,result FROM permission_commands WHERE actor=$1 AND request_id=$2",
          [actor, c.requestId, JSON.stringify(c)],
        )
      ).rows[0];
      if (previous) {
        if (!previous.matches) throw new PermissionError(409, "操作編號已用於不同內容。");
        return previous.result as { requestId: string; version: number };
      }

      const target = qualifications.get(c.target);
      if (!target) throw new UserError(404, "使用者不存在。");
      const currentVersion = await permissionVersion(sql, c.target, true);
      if (currentVersion !== c.expectedVersion) {
        throw new PermissionError(409, "權限已更新，請重新讀取後確認。");
      }
      if (c.enabled && target.status !== "active") {
        throw new PermissionError(409, "只能授權有效使用者。");
      }

      if (c.workplaceId) {
        const workplace = (
          await sql.query("SELECT 1 FROM permission_workplace_targets WHERE id=$1", [c.workplaceId])
        ).rows[0];
        if (!workplace) throw new PermissionError(400, "指定地點不存在。");
      }

      if (
        c.enabled &&
        c.permission === "users.suspend" &&
        !(await hasPermission(sql, c.target, "users.read"))
      ) {
        throw new PermissionError(409, "請先授予使用者查詢權限。");
      }
      if (
        !c.enabled &&
        c.permission === "users.read" &&
        (
          await sql.query(
            "SELECT 1 FROM permission_grants WHERE user_id=$1 AND permission='users.suspend'",
            [c.target],
          )
        ).rows.length
      ) {
        throw new PermissionError(409, "請先撤銷使用者停權權限。");
      }

      const before = (
        await sql.query(
          "SELECT * FROM permission_grants WHERE user_id=$1 ORDER BY permission,workplace_id NULLS FIRST",
          [c.target],
        )
      ).rows;
      await sql.query(
        "DELETE FROM permission_grants WHERE user_id=$1 AND permission=$2 AND workplace_id IS NOT DISTINCT FROM $3::uuid",
        [c.target, c.permission, c.workplaceId],
      );
      if (c.enabled) {
        await sql.query(
          `INSERT INTO permission_grants(
             user_id,permission,workplace_id,user_version,granted_by,granted_at
           ) VALUES($1,$2,$3,$4,$5,$6)`,
          [c.target, c.permission, c.workplaceId, target.statusVersion, actor, now],
        );
      }
      const version = await advancePermissionVersion(sql, c.target, currentVersion);
      const result = { requestId: c.requestId, version };
      await sql.query(
        "INSERT INTO permission_commands(actor,request_id,target,command,before_grants,after_grants,result,at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          actor,
          c.requestId,
          c.target,
          JSON.stringify(c),
          JSON.stringify(before),
          JSON.stringify(
            (
              await sql.query(
                "SELECT * FROM permission_grants WHERE user_id=$1 ORDER BY permission,workplace_id NULLS FIRST",
                [c.target],
              )
            ).rows,
          ),
          JSON.stringify(result),
          now,
        ],
      );
      return result;
    });
  }
}
