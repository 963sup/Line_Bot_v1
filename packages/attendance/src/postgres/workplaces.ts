import { businessDatabase, type Database, type Sql } from "@line_bot_v1/platform/postgres";
import { readEffectiveRepositoryAccess } from "@line_bot_v1/repository/postgres";
import type { WorkplaceStore } from "../application/ports/workplaces.js";
import { AttendanceError, type Workplace, type WorkplaceCommand } from "../domain.js";

export async function workplaceSites(sql: Sql, userId: string): Promise<Workplace[]> {
  await sql.query("SELECT pg_advisory_xact_lock_shared(71020260910::bigint)");
  const access = await readEffectiveRepositoryAccess(sql, userId);
  if (!access.length) return [];
  return (
    await sql.query(
      `SELECT id,name,description,latitude,longitude,radius,enabled,version
       FROM workplaces
       WHERE enabled
         AND id=ANY($1::text[])
       ORDER BY id`,
      [access.map((entry) => entry.repositoryId)],
    )
  ).rows as Workplace[];
}

async function administeredRepositories(sql: Sql, actor: string) {
  return (await readEffectiveRepositoryAccess(sql, actor))
    .filter((entry) => entry.capability === "admin")
    .map((entry) => entry.repositoryId);
}

export class PostgresWorkplaceStore implements WorkplaceStore {
  constructor(private db: Database = businessDatabase()) {}

  read(actor: string, id: string, after: string) {
    return this.db.transaction(async (sql) => {
      const repositoryIds = await administeredRepositories(sql, actor);
      if (id && !repositoryIds.includes(id)) {
        throw new AttendanceError(403, "需要此 Repository 的 admin 權限。");
      }
      if (!id && repositoryIds.length === 0) {
        throw new AttendanceError(403, "目前沒有可管理的 Repository。");
      }
      await sql.query("SELECT pg_advisory_xact_lock_shared(71020260910::bigint)");
      const rows = (
        await sql.query(
          `SELECT id,name,description,latitude,longitude,radius,enabled,version
           FROM workplaces
           WHERE ($1::text IS NULL OR id=$1)
             AND ($2::text IS NULL OR id>$2)
             AND id=ANY($3::text[])
           ORDER BY id
           LIMIT 21`,
          [id || null, after || null, repositoryIds],
        )
      ).rows as Workplace[];
      return {
        canCreate: true,
        sites: rows.slice(0, 20),
        next: !id && rows.length > 20 ? rows[19]!.id : null,
      };
    });
  }

  change(actor: string, command: WorkplaceCommand, now: number) {
    return this.db.transaction(async (sql) => {
      const repositoryIds = await administeredRepositories(sql, actor);
      if (!repositoryIds.includes(command.id)) {
        throw new AttendanceError(403, "需要此 Repository 的 admin 權限。");
      }

      await sql.query("SELECT pg_advisory_xact_lock(71020260910::bigint)");
      const previous = (
        await sql.query(
          "SELECT actor,command=$2::jsonb AS matches,result FROM workplace_commands WHERE request_id=$1",
          [command.requestId, JSON.stringify(command)],
        )
      ).rows[0] as
        | { actor: string; matches: boolean; result: { id: string; version: number } }
        | undefined;
      if (previous) {
        if (previous.actor !== actor || !previous.matches) {
          throw new AttendanceError(409, "操作編號已用於其他內容。");
        }
        return previous.result;
      }

      const old = (
        await sql.query(
          "SELECT id,name,description,latitude,longitude,radius,enabled,version FROM workplaces WHERE id=$1 FOR UPDATE",
          [command.id],
        )
      ).rows[0] as Workplace | undefined;
      if ((old?.version ?? 0) !== command.expectedVersion) {
        throw new AttendanceError(409, "地點已更新，請重新載入。");
      }

      const restrict =
        old &&
        (!command.enabled ||
          command.latitude !== old.latitude ||
          command.longitude !== old.longitude ||
          command.radius !== old.radius);
      if (
        restrict &&
        (
          await sql.query(
            `SELECT s.id
             FROM attendance_sessions s
             JOIN attendance_events e
               ON e.uid=s.uid
              AND e.command='clockIn'
              AND e.details->>'recordId'=s.id::text
             WHERE s.ended_at IS NULL
               AND e.details->'site'->>'id'=$1
             LIMIT 1`,
            [command.id],
          )
        ).rows.length
      ) {
        throw new AttendanceError(409, "此 Repository 仍有人尚未下班，請先完成下班再變更範圍。");
      }

      const version = (old?.version ?? 0) + 1;
      await sql.query(
        `INSERT INTO workplaces(id,name,description,latitude,longitude,radius,enabled,version)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT(id) DO UPDATE SET
           name=EXCLUDED.name,
           description=EXCLUDED.description,
           latitude=EXCLUDED.latitude,
           longitude=EXCLUDED.longitude,
           radius=EXCLUDED.radius,
           enabled=EXCLUDED.enabled,
           version=EXCLUDED.version`,
        [
          command.id,
          command.name.trim(),
          command.description,
          command.latitude,
          command.longitude,
          command.radius,
          command.enabled,
          version,
        ],
      );
      const result = { id: command.id, version };
      await sql.query(
        "INSERT INTO workplace_commands(request_id,actor,workplace_id,command,result,at) VALUES($1,$2,$3,$4,$5,$6)",
        [
          command.requestId,
          actor,
          command.id,
          JSON.stringify(command),
          JSON.stringify(result),
          now,
        ],
      );
      return result;
    });
  }
}
