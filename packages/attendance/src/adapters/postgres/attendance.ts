import { createHash, randomUUID } from "node:crypto";
import { hasUserIdentity, readUserQualification } from "@line-work/account/adapters/postgres";
import { COIN_ASSET_CODE } from "@line-work/asset/domain";
import { recordLedgerCredit } from "@line-work/ledger/adapters/postgres";
import { businessDatabase, type Database, type Sql } from "@line-work/platform/adapters/postgres";
import type {
  AttendanceInput,
  AttendanceMenuJob,
  AttendanceNotificationJob,
  AttendanceResult,
  AttendanceSnapshot,
  AttendanceStore,
  NotificationOutcome,
} from "../../application/ports/clock.js";
import {
  ATTENDANCE_COIN_REWARD,
  type AttendanceAction,
  AttendanceError,
  type AttendanceSession,
  attendanceDistance,
  attendanceView,
  distanceMeters,
  parseLocation,
  planAttendance,
} from "../../domain.js";
import { workplaceSites } from "./workplaces.js";

const session = (r: Record<string, any>): AttendanceSession => ({
  id: r.id,
  day: r.day,
  startedAt: Number(r.started_at),
  endedAt: r.ended_at === null ? null : Number(r.ended_at),
  ruleVersion: r.rule_version,
});

export class PostgresAttendanceStore implements AttendanceStore {
  constructor(private db: Database = businessDatabase()) {}

  menuSubjects(provider: string, now: number): Promise<string[]> {
    return this.db.transaction(async (sql) =>
      (
        await sql.query(
          `SELECT i.subject FROM attendance_identity_bindings i
         WHERE i.provider=$1
           AND (i.auth_user_id IS NULL OR attendance_account_active(i.auth_user_id,$2::bigint))
         ORDER BY i.subject`,
          [provider, now],
        )
      ).rows.map((row) => row.subject as string),
    );
  }

  refreshMenu(provider: string, subject: string, now: number): Promise<void> {
    return this.db.transaction(async (sql) => {
      const member = (
        await sql.query(
          `SELECT i.user_id AS id,i.auth_user_id FROM attendance_identity_bindings i
           WHERE i.provider=$1 AND i.subject=$2`,
          [provider, subject],
        )
      ).rows[0];
      if (!member) throw new AttendanceError(403, "會員資格不可用。");
      if (member.auth_user_id) {
        const account = (
          await sql.query("SELECT attendance_account_active($1::uuid,$2::bigint) AS active", [
            member.auth_user_id,
            now,
          ])
        ).rows[0];
        if (!account?.active) throw new AttendanceError(403, "會員登入帳號不可用。");
      }
      await sql.query(
        `INSERT INTO attendance_menu_outbox(uid,state,revision,available_at)
         SELECT $1,
           CASE WHEN EXISTS(SELECT 1 FROM attendance_sessions WHERE uid=$1 AND ended_at IS NULL)
             THEN 'working' ELSE 'ready' END,
           GREATEST(COALESCE((SELECT version FROM attendance_state WHERE uid=$1),0),1),$2
         ON CONFLICT(uid) DO UPDATE SET
           state=EXCLUDED.state,
           revision=GREATEST(attendance_menu_outbox.revision+1,EXCLUDED.revision),
           available_at=EXCLUDED.available_at,
           attempts=0`,
        [member.id, now],
      );
    });
  }

  private async lock(sql: Sql, id: string, now: number) {
    const m = await readUserQualification(sql, id, "update");
    if (!m || m.status !== "active") {
      throw new AttendanceError(
        403,
        m?.status === "suspended" ? "會員已停權。" : "會員資格不可用。",
      );
    }
    if (m.authUserId) {
      const u = (
        await sql.query("SELECT attendance_account_active($1::uuid,$2::bigint) AS active", [
          m.authUserId,
          now,
        ])
      ).rows[0];
      if (!u?.active) throw new AttendanceError(403, "會員登入帳號不可用。");
    }
    await sql.query("INSERT INTO attendance_state(uid) VALUES($1) ON CONFLICT DO NOTHING", [id]);
    return Number(
      (await sql.query("SELECT version FROM attendance_state WHERE uid=$1", [id])).rows[0]!.version,
    );
  }

  private async records(sql: Sql, id: string, now: number) {
    return (
      await sql.query(
        "SELECT * FROM attendance_sessions WHERE uid=$1 AND (ended_at >= $2 OR ended_at IS NULL) ORDER BY started_at,id",
        [id, now - 30 * 86400000],
      )
    ).rows.map(session);
  }

  private async view(sql: Sql, id: string, now: number): Promise<AttendanceSnapshot> {
    const attendance = attendanceView(await this.records(sql, id, now), now);
    const version = Number(
      (await sql.query("SELECT version FROM attendance_state WHERE uid=$1", [id])).rows[0]!.version,
    );
    await sql.query(
      `INSERT INTO attendance_menu_outbox(uid,state,revision,available_at) VALUES($1,$2,$3,$4)
       ON CONFLICT(uid) DO UPDATE SET state=EXCLUDED.state,revision=GREATEST(attendance_menu_outbox.revision+1,EXCLUDED.revision),available_at=EXCLUDED.available_at,attempts=0
       WHERE attendance_menu_outbox.state<>EXCLUDED.state`,
      [id, attendance.menuState, version, now],
    );
    return { attendance, version, sites: await workplaceSites(sql, id) };
  }

  snapshot(id: string, now: number) {
    return this.db.transaction(async (sql) => {
      await this.lock(sql, id, now);
      return this.view(sql, id, now);
    });
  }

  prepare(id: string, now: number) {
    return this.db.transaction(async (sql) => {
      const version = await this.lock(sql, id, now);
      const active = await sql.query(
        "SELECT id FROM attendance_sessions WHERE uid=$1 AND ended_at IS NULL",
        [id],
      );
      return { version, working: active.rows.length > 0, sites: await workplaceSites(sql, id) };
    });
  }

  execute(
    id: string,
    action: AttendanceAction,
    input: AttendanceInput,
    now: number,
    recipient: { provider: string; subject: string },
  ): Promise<AttendanceResult> {
    if (
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(input.requestId) ||
      !Number.isSafeInteger(input.expectedVersion) ||
      input.expectedVersion < 0
    ) {
      throw new AttendanceError(400, "請提供有效請求編號與出勤版本。");
    }
    const location = parseLocation(input.location);
    const fingerprint = createHash("sha256")
      .update(JSON.stringify({ action, version: input.expectedVersion, location }))
      .digest("hex");
    return this.db.transaction(async (sql) => {
      const version = await this.lock(sql, id, now);
      if (!(await hasUserIdentity(sql, id, recipient.provider, recipient.subject))) {
        throw new AttendanceError(403, "LINE 會員關聯已變更。");
      }
      const old = (
        await sql.query(
          "SELECT fingerprint,result FROM attendance_commands WHERE uid=$1 AND request_id=$2",
          [id, input.requestId],
        )
      ).rows[0];
      if (old) {
        if (old.fingerprint !== fingerprint)
          throw new AttendanceError(409, "請求編號已用於不同操作。");
        return { ...old.result, credited: 0, replayed: true } as AttendanceResult;
      }
      if (version !== input.expectedVersion)
        throw new AttendanceError(409, "出勤狀態已變更，請重新整理後確認。");
      const sites = await workplaceSites(sql, id);
      if (!sites.length)
        throw new AttendanceError(403, "尚未加入任何啟用的打卡地點，請聯絡管理者。");
      if (sites.every((s) => location.accuracy > s.radius)) {
        throw new AttendanceError(422, "定位精度不足，請移至訊號良好處再試。");
      }
      const site = sites
        .filter((s) => distanceMeters(location, s) + location.accuracy <= s.radius)
        .sort(
          (a, b) =>
            distanceMeters(location, a) - distanceMeters(location, b) || a.id.localeCompare(b.id),
        )[0];
      if (!site) throw new AttendanceError(422, "目前位置或定位誤差超出獲准地點的打卡範圍。");
      const distance = attendanceDistance(location, site);
      const plan = planAttendance(await this.records(sql, id, now), action, now);
      let recordId: string;
      let day: string;
      if (plan.start) {
        recordId = randomUUID();
        day = plan.start.day;
        await sql.query(
          "INSERT INTO attendance_sessions(id,uid,day,started_at,rule_version) VALUES($1,$2,$3,$4,$5)",
          [recordId, id, day, now, plan.start.ruleVersion],
        );
      } else {
        recordId = plan.end.id;
        day = plan.end.day;
        await sql.query(
          "UPDATE attendance_sessions SET ended_at=$3 WHERE uid=$1 AND id=$2 AND ended_at IS NULL",
          [id, recordId, now],
        );
      }
      const credited = await recordLedgerCredit(sql, {
        holderAccountId: id,
        asset: COIN_ASSET_CODE,
        source: { context: "attendance", type: action },
        sourceRef: day,
        businessDay: day,
        amount: ATTENDANCE_COIN_REWARD,
        at: now,
      });
      await sql.query("UPDATE attendance_state SET version=version+1 WHERE uid=$1", [id]);
      await sql.query(
        "INSERT INTO attendance_events(uid,command,at,recorded_at,details) VALUES($1,$2,$3,$3,$4)",
        [
          id,
          action,
          now,
          JSON.stringify({ recordId, requestId: input.requestId, location, site, distance }),
        ],
      );
      const result = { ...(await this.view(sql, id, now)), credited, replayed: false };
      const record = result.attendance.records.find((r) => r.id === recordId)!;
      await sql.query(
        "INSERT INTO attendance_notification_outbox(id,uid,provider,subject,revision,payload,created_at,available_at) VALUES($1,$2,$3,$4,$5,$6,$7,$7)",
        [
          randomUUID(),
          id,
          recipient.provider,
          recipient.subject,
          result.version,
          JSON.stringify({ action, record }),
          now,
        ],
      );
      await sql.query(
        "INSERT INTO attendance_commands(uid,request_id,fingerprint,result,at) VALUES($1,$2,$3,$4,$5)",
        [id, input.requestId, fingerprint, JSON.stringify(result), now],
      );
      return result;
    });
  }

  async claimMenu(
    now: number,
    provider: string,
    subject?: string,
  ): Promise<AttendanceMenuJob | null> {
    return this.db.transaction(async (sql) => {
      const r = (
        await sql.query(
          `SELECT o.*,i.subject FROM attendance_menu_outbox o
    JOIN attendance_identity_bindings i ON i.user_id=o.uid AND i.provider=$2
    WHERE o.revision>o.synced_revision AND o.available_at<=$1
      AND (o.lease_until IS NULL OR o.lease_until<$1)
      AND (i.auth_user_id IS NULL OR attendance_account_active(i.auth_user_id,$1::bigint))
      AND ($3::text IS NULL OR i.subject=$3) ORDER BY o.available_at LIMIT 1 FOR UPDATE OF o SKIP LOCKED`,
          [now, provider, subject ?? null],
        )
      ).rows[0];
      if (!r) return null;
      const token = randomUUID();
      await sql.query(
        "UPDATE attendance_menu_outbox SET lease_token=$2,lease_until=$3 WHERE uid=$1",
        [r.uid, token, now + 90000],
      );
      return {
        uid: r.uid,
        subject: r.subject,
        state: r.state,
        revision: Number(r.revision),
        token,
      };
    });
  }

  async completeMenu(job: AttendanceMenuJob, success: boolean, now: number) {
    return this.db.transaction(async (sql) => {
      const r = (
        await sql.query(
          "SELECT * FROM attendance_menu_outbox WHERE uid=$1 AND lease_token=$2 FOR UPDATE",
          [job.uid, job.token],
        )
      ).rows[0];
      if (!r || Number(r.lease_until) <= now) {
        await sql.query(
          "UPDATE attendance_menu_outbox SET revision=revision+1,available_at=$2 WHERE uid=$1",
          [job.uid, now],
        );
        return false;
      }
      const current = Number(r.revision) === job.revision;
      const delay = Math.min(3600000, 1000 * 2 ** Math.min(Number(r.attempts), 12));
      await sql.query(
        `UPDATE attendance_menu_outbox SET synced_revision=$3,lease_token=NULL,lease_until=NULL,
    attempts=$4,available_at=$5 WHERE uid=$1 AND lease_token=$2`,
        [
          job.uid,
          job.token,
          success && current ? job.revision : r.synced_revision,
          success ? 0 : Number(r.attempts) + 1,
          success || !current ? now : now + delay,
        ],
      );
      return success && current;
    });
  }

  async claimNotification(
    now: number,
    provider: string,
    subject?: string,
  ): Promise<AttendanceNotificationJob | null> {
    return this.db.transaction(async (sql) => {
      await sql.query(
        "UPDATE attendance_notification_outbox SET status='expired',lease_token=NULL,lease_until=NULL WHERE status='pending' AND first_attempt_at<=$1 AND (lease_until IS NULL OR lease_until<$2)",
        [now - 23 * 3600000, now],
      );
      const r = (
        await sql.query(
          `SELECT o.* FROM attendance_notification_outbox o
        JOIN attendance_identity_bindings i
          ON i.user_id=o.uid AND i.provider=o.provider AND i.subject=o.subject
        WHERE o.status='pending' AND o.provider=$2 AND ($3::text IS NULL OR o.subject=$3) AND o.available_at<=$1
        AND (o.lease_until IS NULL OR o.lease_until<$1)
        AND (i.auth_user_id IS NULL OR attendance_account_active(i.auth_user_id,$1::bigint))
        AND NOT EXISTS(SELECT 1 FROM attendance_notification_outbox earlier WHERE earlier.uid=o.uid AND earlier.revision<o.revision AND earlier.status='pending')
        ORDER BY o.available_at,o.uid,o.revision LIMIT 1 FOR UPDATE OF o SKIP LOCKED`,
          [now, provider, subject ?? null],
        )
      ).rows[0];
      if (!r) return null;
      const token = randomUUID();
      await sql.query(
        "UPDATE attendance_notification_outbox SET lease_token=$2,lease_until=$3,first_attempt_at=COALESCE(first_attempt_at,$4),attempts=attempts+1 WHERE id=$1",
        [r.id, token, now + 90000, now],
      );
      return { id: r.id, uid: r.uid, subject: r.subject, payload: r.payload, token };
    });
  }

  async completeNotification(
    job: AttendanceNotificationJob,
    outcome: NotificationOutcome,
    now: number,
  ) {
    return this.db.transaction(async (sql) => {
      const r = (
        await sql.query(
          "SELECT * FROM attendance_notification_outbox WHERE id=$1 AND lease_token=$2 AND lease_until>$3 AND status='pending' FOR UPDATE",
          [job.id, job.token, now],
        )
      ).rows[0];
      if (!r) return false;
      const status =
        outcome === "retry"
          ? now - Number(r.first_attempt_at) >= 23 * 3600000
            ? "expired"
            : "pending"
          : outcome;
      const delay = Math.min(3600000, 1000 * 2 ** Math.min(Number(r.attempts), 12));
      await sql.query(
        "UPDATE attendance_notification_outbox SET status=$3,available_at=$4,lease_token=NULL,lease_until=NULL WHERE id=$1 AND lease_token=$2",
        [job.id, job.token, status, now + delay],
      );
      return status === "accepted";
    });
  }
}
