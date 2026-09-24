import { readUserQualification } from "@line-work/account/adapters/postgres";
import { workplacePermissionScope } from "@line-work/identity-access/adapters/postgres";
import { businessDatabase, type Database, type Sql } from "@line-work/platform/adapters/postgres";
import type { WorkplaceStore } from "../../application/ports/workplaces.js";
import { AttendanceError, type Workplace, type WorkplaceCommand } from "../../domain.js";

export async function workplaceSites(sql: Sql, memberId: string): Promise<Workplace[]> {
  await sql.query("SELECT pg_advisory_xact_lock_shared(71020260910::bigint)");
  return (
    await sql.query(
      "SELECT w.* FROM workplaces w JOIN workplace_members wm ON wm.workplace_id=w.id WHERE wm.member_id=$1 AND w.enabled ORDER BY w.id",
      [memberId],
    )
  ).rows as Workplace[];
}

export class PostgresWorkplaceStore implements WorkplaceStore {
  constructor(private db: Database = businessDatabase()) {}

  private async permissionScope(sql: Sql, actor: string) {
    const scope = await workplacePermissionScope(sql, actor);
    if (!scope.global && scope.workplaceIds.length === 0) {
      throw new AttendanceError(403, "沒有工作地點管理權限。");
    }
    return scope;
  }

  read(actor: string, id: string, after: string) {
    return this.db.transaction(async (sql) => {
      const scope = await this.permissionScope(sql, actor);
      if (id && !scope.global && !scope.workplaceIds.includes(id)) {
        throw new AttendanceError(403, "沒有工作地點管理權限。");
      }
      await sql.query("SELECT pg_advisory_xact_lock_shared(71020260910::bigint)");
      const rows = (
        await sql.query(
          `SELECT * FROM workplaces
           WHERE ($1::uuid IS NULL OR id=$1)
             AND ($2::uuid IS NULL OR id>$2)
             AND ($3::boolean OR id=ANY($4::uuid[]))
           ORDER BY id LIMIT 21`,
          [id || null, after || null, scope.global, scope.workplaceIds],
        )
      ).rows as Workplace[];
      if (id && !rows.length) throw new AttendanceError(404, "工作地點不存在。");

      const membershipRows = id
        ? ((
            await sql.query(
              "SELECT member_id FROM workplace_members WHERE workplace_id=$1 ORDER BY member_id",
              [id],
            )
          ).rows as Array<{ member_id: string }>)
        : [];
      const members: Array<{ id: string; status: string }> = [];
      for (const membership of membershipRows) {
        const user = await readUserQualification(sql, membership.member_id);
        if (user) members.push({ id: user.id, status: user.status });
      }
      return {
        canCreate: scope.global,
        sites: rows.slice(0, 20),
        next: rows.length > 20 ? rows[19]!.id : null,
        members,
      };
    });
  }

  change(actor: string, c: WorkplaceCommand, now: number) {
    return this.db.transaction(async (sql) => {
      const scope = await this.permissionScope(sql, actor);
      await sql.query("SELECT pg_advisory_xact_lock(71020260910::bigint)");
      const previous = (
        await sql.query(
          "SELECT actor,command=$2::jsonb AS matches,result FROM workplace_commands WHERE request_id=$1",
          [c.requestId, JSON.stringify(c)],
        )
      ).rows[0];
      if (previous) {
        if (previous.actor !== actor || !previous.matches) {
          throw new AttendanceError(409, "操作編號已用於其他內容。");
        }
        return previous.result as { id: string; version: number };
      }
      const old = (await sql.query("SELECT * FROM workplaces WHERE id=$1", [c.id])).rows[0] as
        | Workplace
        | undefined;
      if (!old && !scope.global) {
        throw new AttendanceError(403, "只有全部地點管理員能新增地點。");
      }
      if (old && !scope.global && !scope.workplaceIds.includes(c.id)) {
        throw new AttendanceError(403, "沒有工作地點管理權限。");
      }
      if ((old?.version ?? 0) !== c.expectedVersion) {
        throw new AttendanceError(409, "地點已更新，請重新載入。");
      }
      if (c.action === "member" && !old) throw new AttendanceError(404, "工作地點不存在。");
      const restrict =
        old &&
        (c.action === "member"
          ? !c.allowed
          : !c.enabled ||
            c.latitude !== old.latitude ||
            c.longitude !== old.longitude ||
            c.radius !== old.radius);
      if (
        restrict &&
        (
          await sql.query(
            "SELECT s.id FROM attendance_sessions s JOIN attendance_events e ON e.uid=s.uid AND e.command='clockIn' AND e.details->>'recordId'=s.id::text WHERE s.ended_at IS NULL AND e.details->'site'->>'id'=$1 AND ($2::text IS NULL OR s.uid=$2) LIMIT 1",
            [c.id, c.action === "member" ? c.memberId : null],
          )
        ).rows.length
      ) {
        throw new AttendanceError(409, "此地點仍有人尚未下班，請先完成下班再變更範圍或人員。");
      }
      const version = (old?.version ?? 0) + 1;
      if (c.action === "save") {
        await sql.query(
          "INSERT INTO workplaces(id,name,description,latitude,longitude,radius,enabled,version) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO UPDATE SET name=$2,description=$3,latitude=$4,longitude=$5,radius=$6,enabled=$7,version=$8",
          [
            c.id,
            c.name.trim(),
            c.description,
            c.latitude,
            c.longitude,
            c.radius,
            c.enabled,
            version,
          ],
        );
      } else {
        if (c.allowed) {
          const target = await readUserQualification(sql, c.memberId);
          if (!target || target.status !== "active") {
            throw new AttendanceError(400, "只能加入有效會員，請確認會員編號。");
          }
          await sql.query(
            "INSERT INTO workplace_members(workplace_id,member_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
            [c.id, c.memberId],
          );
        } else {
          await sql.query("DELETE FROM workplace_members WHERE workplace_id=$1 AND member_id=$2", [
            c.id,
            c.memberId,
          ]);
        }
        await sql.query("UPDATE workplaces SET version=$2 WHERE id=$1", [c.id, version]);
      }
      const result = { id: c.id, version };
      await sql.query(
        "INSERT INTO workplace_commands(request_id,actor,workplace_id,command,result,at) VALUES($1,$2,$3,$4,$5,$6)",
        [c.requestId, actor, c.id, JSON.stringify(c), JSON.stringify(result), now],
      );
      return result;
    });
  }
}
