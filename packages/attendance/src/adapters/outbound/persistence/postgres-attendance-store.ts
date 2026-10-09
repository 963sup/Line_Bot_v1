import { createHash, randomUUID } from "node:crypto";
import { hasUserIdentity, readUserQualification } from "@line_bot_v1/account/postgres";
import { COIN_ASSET_CODE } from "@line_bot_v1/asset/domain/value-objects/asset-code";
import { recordLedgerCredit } from "@line_bot_v1/ledger/postgres";
import { businessDatabase, type Database, type Sql } from "@line_bot_v1/platform/postgres";
import { repositoryAdministeredIds } from "@line_bot_v1/repository/postgres/access";
import { repositoryAttendanceSites } from "@line_bot_v1/repository/postgres/address";
import type {
  AttendanceMenuJob,
  AttendanceNotificationJob,
  AttendancePoint,
  AttendanceResult,
  AttendanceSnapshot,
  AttendanceStore,
  NotificationOutcome,
} from "../../../contracts/clock.js";
import type { AttendanceInput } from "../../../contracts/input/attendance-command.js";
import type {
  AttendanceSupplementReview,
  AttendanceSupplementSubmission,
} from "../../../contracts/input/attendance-supplement.js";
import type {
  AttendanceSupplement,
  AttendanceSupplementInbox,
  AttendanceSupplementReceipt,
  AttendanceSupplementStore,
} from "../../../contracts/supplements.js";
import {
  ATTENDANCE_RULE_VERSION,
  type AttendanceSession,
} from "../../../domain/aggregates/attendance-session.js";
import { AttendanceError } from "../../../domain/error.js";
import { attendanceView } from "../../../domain/policies/attendance-view.js";
import {
  attendanceDistance,
  distanceMeters,
} from "../../../domain/policies/location-eligibility.js";
import { ATTENDANCE_COIN_REWARD } from "../../../domain/policies/reward.js";
import { planAttendance } from "../../../domain/policies/session-transition.js";
import type { AttendanceAction } from "../../../domain/value-objects/attendance-action.js";
import { parseLocation } from "../../../domain/value-objects/location.js";

type AttendanceSupplementRow = {
  id: string;
  uid: string;
  repository_id: string;
  kind: "new-session" | "close-session";
  session_id: string | null;
  started_at: number | string | null;
  ended_at: number | string;
  site_snapshot: AttendancePoint;
  reason: string;
  submitted_at: number | string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  version: number;
  reviewer_uid: string | null;
  reviewed_at: number | string | null;
  review_reason: string | null;
};

function attendanceSupplement(row: AttendanceSupplementRow): AttendanceSupplement {
  return {
    id: row.id,
    userId: row.uid,
    repositoryId: row.repository_id,
    kind: row.kind,
    sessionId: row.session_id,
    startedAt: row.started_at === null ? null : Number(row.started_at),
    endedAt: Number(row.ended_at),
    site: row.site_snapshot,
    reason: row.reason,
    submittedAt: Number(row.submitted_at),
    status: row.status,
    version: Number(row.version),
    reviewerId: row.reviewer_uid,
    reviewedAt: row.reviewed_at === null ? null : Number(row.reviewed_at),
    reviewReason: row.review_reason,
  };
}

const MAX_PENDING_SUPPLEMENT_REQUESTS_PER_REPOSITORY = 100;

function commandFingerprint(command: unknown) {
  return createHash("sha256").update(JSON.stringify(command)).digest("hex");
}

function replaySupplementReceipt(value: unknown): AttendanceSupplementReceipt {
  const receipt = value as AttendanceSupplementReceipt;
  return { ...receipt, replayed: true };
}

const session = (r: Record<string, any>): AttendanceSession => ({
  id: r.id,
  day: r.day,
  startedAt: Number(r.started_at),
  endedAt: r.ended_at === null ? null : Number(r.ended_at),
  ruleVersion: r.rule_version,
});

export class PostgresAttendanceStore implements AttendanceStore, AttendanceSupplementStore {
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
    // Acquire before the User row, matching membership/access and address writers.
    await sql.query("SELECT pg_advisory_xact_lock_shared(71020260912::bigint)");
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

  private async lockForSupplementReview(
    sql: Sql,
    reviewerId: string,
    requesterId: string,
    now: number,
  ) {
    await sql.query("SELECT pg_advisory_xact_lock_shared(71020260912::bigint)");
    const ids = [...new Set([reviewerId, requesterId])].sort();
    let reviewer: Awaited<ReturnType<typeof readUserQualification>> = null;
    for (const id of ids) {
      const qualification = await readUserQualification(sql, id, "update");
      if (!qualification) throw new AttendanceError(404, "找不到補登申請人。");
      if (id === reviewerId) reviewer = qualification;
    }
    if (!reviewer || reviewer.status !== "active") {
      throw new AttendanceError(403, "目前 User 資格不能審核補登。");
    }
    if (reviewer.authUserId) {
      const account = (
        await sql.query("SELECT attendance_account_active($1::uuid,$2::bigint) AS active", [
          reviewer.authUserId,
          now,
        ])
      ).rows[0];
      if (!account?.active) throw new AttendanceError(403, "目前登入帳號不能審核補登。");
    }
    await sql.query("INSERT INTO attendance_state(uid) VALUES($1) ON CONFLICT DO NOTHING", [
      requesterId,
    ]);
  }

  private async records(sql: Sql, id: string, now: number) {
    return (
      await sql.query(
        "SELECT * FROM attendance_sessions WHERE uid=$1 AND (ended_at >= $2 OR ended_at IS NULL) ORDER BY started_at,id",
        [id, now - 30 * 86400000],
      )
    ).rows.map(session);
  }

  private async sites(sql: Sql, id: string): Promise<AttendancePoint[]> {
    const active = (
      await sql.query(
        `SELECT s.id,s.point_snapshot,e.details->'site' AS historical_point
       FROM attendance_sessions s
       LEFT JOIN LATERAL (
         SELECT details FROM attendance_events
         WHERE uid=s.uid AND command='clockIn' AND details->>'recordId'=s.id::text
         ORDER BY at,id LIMIT 1
       ) e ON true
       WHERE s.uid=$1 AND s.ended_at IS NULL`,
        [id],
      )
    ).rows[0];
    if (active) {
      if (active.point_snapshot) return [active.point_snapshot as AttendancePoint];
      // Pre-cutover sessions already own their original location in their clock-in event.
      // Read that evidence, never infer a Repository or current membership from old names.
      const point = active.historical_point;
      if (!point) throw new AttendanceError(409, "此筆出勤缺少原始打卡點紀錄，請聯絡服務維護者。");
      return [
        { ...point, repositoryId: null, address: point.description ?? "" } as AttendancePoint,
      ];
    }
    return (await repositoryAttendanceSites(sql, id)).map((point) => ({
      ...point,
      repositoryId: point.id,
    }));
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
    return { attendance, version, sites: await this.sites(sql, id) };
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
      return { version, working: active.rows.length > 0, sites: await this.sites(sql, id) };
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
        return {
          ...old.result,
          sites: old.result.sites.map((point: AttendancePoint & { description?: string }) => ({
            ...point,
            repositoryId: point.repositoryId ?? null,
            address: point.address ?? point.description ?? "",
          })),
          credited: 0,
          replayed: true,
        } as AttendanceResult;
      }
      if (version !== input.expectedVersion)
        throw new AttendanceError(409, "出勤狀態已變更，請重新整理後確認。");
      const plan = planAttendance(await this.records(sql, id, now), action, now);
      const sites = await this.sites(sql, id);
      if (!sites.length)
        throw new AttendanceError(403, "尚未加入已設定地址的儲存庫，請聯絡儲存庫管理者。");
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
      let recordId: string;
      let day: string;
      if (plan.start) {
        recordId = randomUUID();
        day = plan.start.day;
        await sql.query(
          "INSERT INTO attendance_sessions(id,uid,day,started_at,rule_version,repository_id,point_snapshot) VALUES($1,$2,$3,$4,$5,$6,$7)",
          [recordId, id, day, now, plan.start.ruleVersion, site.repositoryId, JSON.stringify(site)],
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

  list(
    id: string,
    now: number,
    recipient: { provider: string; subject: string },
  ): Promise<AttendanceSupplementInbox> {
    return this.db.transaction(async (sql) => {
      await this.lock(sql, id, now);
      if (!(await hasUserIdentity(sql, id, recipient.provider, recipient.subject))) {
        throw new AttendanceError(403, "LINE 會員關聯已變更。");
      }
      const reviewRepositoryIds = await repositoryAdministeredIds(sql, id);
      const mine = await sql.query(
        `SELECT * FROM attendance_supplement_requests
         WHERE uid=$1 ORDER BY submitted_at DESC,id DESC LIMIT 100`,
        [id],
      );
      const review = reviewRepositoryIds.length
        ? await sql.query(
            `SELECT * FROM attendance_supplement_requests
             WHERE repository_id=ANY($1::text[]) AND status='PENDING' AND uid<>$2
             ORDER BY submitted_at,id`,
            [reviewRepositoryIds, id],
          )
        : { rows: [] };
      return {
        mine: (mine.rows as AttendanceSupplementRow[]).map(attendanceSupplement),
        review: (review.rows as AttendanceSupplementRow[]).map(attendanceSupplement),
      };
    });
  }

  submit(
    id: string,
    command: AttendanceSupplementSubmission,
    now: number,
    recipient: { provider: string; subject: string },
  ): Promise<AttendanceSupplementReceipt> {
    const fingerprint = commandFingerprint(
      command.kind === "new-session"
        ? {
            kind: command.kind,
            repositoryId: command.repositoryId,
            startedAt: command.startedAt,
            endedAt: command.endedAt,
            reason: command.reason,
          }
        : {
            kind: command.kind,
            sessionId: command.sessionId,
            endedAt: command.endedAt,
            reason: command.reason,
          },
    );

    return this.db.transaction(async (sql) => {
      await this.lock(sql, id, now);
      if (!(await hasUserIdentity(sql, id, recipient.provider, recipient.subject))) {
        throw new AttendanceError(403, "LINE 會員關聯已變更。");
      }
      const previous = (
        await sql.query(
          "SELECT fingerprint,result FROM attendance_commands WHERE uid=$1 AND request_id=$2",
          [id, command.requestId],
        )
      ).rows[0] as { fingerprint: string; result: unknown } | undefined;
      if (previous) {
        if (previous.fingerprint !== fingerprint) {
          throw new AttendanceError(409, "補登請求編號已用於不同操作。");
        }
        return replaySupplementReceipt(previous.result);
      }

      let repositoryId: string;
      let startedAt: number | null = null;
      let endedAt = command.endedAt;
      let sessionId: string | null = null;
      let site: AttendancePoint | null = null;

      if (!Number.isSafeInteger(command.endedAt) || command.endedAt < 0 || command.endedAt > now) {
        throw new AttendanceError(400, "補登時間必須是有效且不晚於現在的時間。");
      }
      if (command.kind === "new-session") {
        if (
          !Number.isSafeInteger(command.startedAt) ||
          command.startedAt < 0 ||
          command.startedAt >= command.endedAt
        ) {
          throw new AttendanceError(400, "補登下班時間必須晚於上班時間。");
        }
        repositoryId = command.repositoryId;
        startedAt = command.startedAt;
        const currentSite = (await repositoryAttendanceSites(sql, id)).find(
          (point) => point.id === repositoryId,
        );
        if (!currentSite) {
          throw new AttendanceError(403, "只能向目前可打卡地址所屬的 Repository 提出補登。");
        }
        site = { ...currentSite, repositoryId: currentSite.id };
      } else {
        const open = (
          await sql.query(
            `SELECT id,uid,repository_id,started_at,ended_at,point_snapshot
             FROM attendance_sessions WHERE id=$1 AND uid=$2 FOR UPDATE`,
            [command.sessionId, id],
          )
        ).rows[0] as
          | {
              id: string;
              uid: string;
              repository_id: string | null;
              started_at: number | string;
              ended_at: number | string | null;
              point_snapshot: AttendancePoint | null;
            }
          | undefined;
        if (!open || open.ended_at !== null || !open.repository_id) {
          throw new AttendanceError(409, "這筆出勤已結束或無法補登下班時間。");
        }
        if (command.endedAt < Number(open.started_at)) {
          throw new AttendanceError(400, "補登下班時間不能早於原上班時間。");
        }
        if (!open.point_snapshot) {
          throw new AttendanceError(409, "原出勤紀錄缺少打卡地點快照，無法提出補登。");
        }
        repositoryId = open.repository_id;
        sessionId = open.id;
        site = open.point_snapshot;
      }

      await sql.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 71020260913::bigint))", [
        repositoryId,
      ]);
      const duplicate = (
        await sql.query(
          `SELECT 1 FROM attendance_supplement_requests
           WHERE uid=$1 AND repository_id=$2 AND status='PENDING' AND
             (($3='new-session' AND kind='new-session' AND started_at=$4 AND ended_at=$5)
              OR ($3='close-session' AND kind='close-session' AND session_id=$6))
           LIMIT 1`,
          [id, repositoryId, command.kind, startedAt, endedAt, sessionId],
        )
      ).rows[0];
      if (duplicate) throw new AttendanceError(409, "相同補登申請仍在等待審核。");
      const pendingCount = Number(
        (
          await sql.query(
            "SELECT count(*) AS count FROM attendance_supplement_requests WHERE repository_id=$1 AND status='PENDING'",
            [repositoryId],
          )
        ).rows[0]!.count,
      );
      if (pendingCount >= MAX_PENDING_SUPPLEMENT_REQUESTS_PER_REPOSITORY) {
        throw new AttendanceError(409, "該 Repository 待審補登已達上限，請先處理待審申請。");
      }

      await sql.query(
        `INSERT INTO attendance_supplement_requests(
           id,uid,repository_id,kind,session_id,started_at,ended_at,site_snapshot,reason,submitted_at
         ) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)`,
        [
          command.requestId,
          id,
          repositoryId,
          command.kind,
          sessionId,
          startedAt,
          endedAt,
          JSON.stringify(site),
          command.reason,
          now,
        ],
      );
      await sql.query(
        `INSERT INTO attendance_events(uid,command,at,recorded_at,details)
         VALUES($1,'supplement-requested',$2,$2,$3::jsonb)`,
        [
          id,
          now,
          JSON.stringify({
            supplementId: command.requestId,
            repositoryId,
            kind: command.kind,
            sessionId,
            startedAt,
            endedAt,
            reason: command.reason,
          }),
        ],
      );

      const request = (
        await sql.query("SELECT * FROM attendance_supplement_requests WHERE id=$1", [
          command.requestId,
        ])
      ).rows[0] as AttendanceSupplementRow;
      const receipt = { supplement: attendanceSupplement(request), replayed: false };
      await sql.query(
        "INSERT INTO attendance_commands(uid,request_id,fingerprint,result,at) VALUES($1,$2,$3,$4::jsonb,$5)",
        [id, command.requestId, fingerprint, JSON.stringify(receipt), now],
      );
      return receipt;
    });
  }

  review(
    reviewerId: string,
    command: AttendanceSupplementReview,
    now: number,
    recipient: { provider: string; subject: string },
  ): Promise<AttendanceSupplementReceipt> {
    const fingerprint = commandFingerprint({
      supplementId: command.supplementId,
      expectedVersion: command.expectedVersion,
      decision: command.decision,
      reason: command.reason ?? null,
    });

    return this.db.transaction(async (sql) => {
      await sql.query("SELECT pg_advisory_xact_lock_shared(71020260912::bigint)");
      const pending = (
        await sql.query("SELECT * FROM attendance_supplement_requests WHERE id=$1 FOR UPDATE", [
          command.supplementId,
        ])
      ).rows[0] as AttendanceSupplementRow | undefined;
      if (!pending) throw new AttendanceError(404, "找不到補登申請。");
      await this.lockForSupplementReview(sql, reviewerId, pending.uid, now);
      await this.lock(sql, reviewerId, now);
      if (!(await hasUserIdentity(sql, reviewerId, recipient.provider, recipient.subject))) {
        throw new AttendanceError(403, "LINE 會員關聯已變更。");
      }
      if (pending.uid === reviewerId) {
        throw new AttendanceError(403, "申請人不能審核自己的補登。");
      }

      const previous = (
        await sql.query(
          "SELECT fingerprint,result FROM attendance_commands WHERE uid=$1 AND request_id=$2",
          [reviewerId, command.commandId],
        )
      ).rows[0] as { fingerprint: string; result: unknown } | undefined;
      if (previous) {
        if (previous.fingerprint !== fingerprint) {
          throw new AttendanceError(409, "審核請求編號已用於不同操作。");
        }
        return replaySupplementReceipt(previous.result);
      }
      const reviewRepositoryIds = await repositoryAdministeredIds(sql, reviewerId);
      if (!reviewRepositoryIds.includes(pending.repository_id)) {
        throw new AttendanceError(403, "需要該 Repository 當下有效的 ADMIN 權限才能審核。");
      }
      if (pending.status !== "PENDING" || Number(pending.version) !== command.expectedVersion) {
        throw new AttendanceError(409, "補登申請已變更，請重新整理後確認。");
      }

      let recordId: string | null = null;
      let startedAt = pending.started_at === null ? null : Number(pending.started_at);
      let site = pending.site_snapshot;
      if (command.decision === "approve") {
        if (pending.kind === "new-session") {
          const overlaps = (
            await sql.query(
              `SELECT id FROM attendance_sessions
               WHERE uid=$1 AND (ended_at IS NULL OR ended_at>$2)
                 AND started_at<$3 LIMIT 1`,
              [pending.uid, startedAt, Number(pending.ended_at)],
            )
          ).rows[0];
          if (overlaps) throw new AttendanceError(409, "申請時段與既有出勤紀錄重疊，無法核准。");
          recordId = randomUUID();
          const day = (
            await sql.query(
              "SELECT to_char(to_timestamp($1::bigint/1000.0) AT TIME ZONE 'Asia/Taipei','YYYY-MM-DD') AS day",
              [startedAt],
            )
          ).rows[0]!.day as string;
          await sql.query(
            `INSERT INTO attendance_sessions(
               id,uid,day,started_at,ended_at,rule_version,repository_id,point_snapshot
             ) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
            [
              recordId,
              pending.uid,
              day,
              startedAt,
              Number(pending.ended_at),
              ATTENDANCE_RULE_VERSION,
              pending.repository_id,
              JSON.stringify(site),
            ],
          );
        } else {
          const open = (
            await sql.query(
              `SELECT id,started_at,point_snapshot FROM attendance_sessions
               WHERE id=$1 AND uid=$2 AND repository_id=$3 AND ended_at IS NULL FOR UPDATE`,
              [pending.session_id, pending.uid, pending.repository_id],
            )
          ).rows[0] as
            | { id: string; started_at: number | string; point_snapshot: AttendancePoint | null }
            | undefined;
          if (!open || !open.point_snapshot || Number(pending.ended_at) < Number(open.started_at)) {
            throw new AttendanceError(409, "原出勤紀錄已變更，無法核准補登下班時間。");
          }
          const closed = await sql.query(
            `UPDATE attendance_sessions SET ended_at=$2
             WHERE id=$1 AND uid=$3 AND ended_at IS NULL RETURNING id`,
            [open.id, Number(pending.ended_at), pending.uid],
          );
          if (!closed.rows.length) throw new AttendanceError(409, "原出勤紀錄已變更，請重新整理。");
          recordId = open.id;
          startedAt = Number(open.started_at);
          site = open.point_snapshot;
        }
        await sql.query("UPDATE attendance_state SET version=version+1 WHERE uid=$1", [
          pending.uid,
        ]);
        await sql.query(
          "INSERT INTO attendance_events(uid,command,at,recorded_at,details) VALUES($1,'supplement-approved',$2,$2,$3::jsonb)",
          [
            pending.uid,
            now,
            JSON.stringify({
              supplementId: pending.id,
              recordId,
              reviewerId,
              repositoryId: pending.repository_id,
              kind: pending.kind,
              startedAt,
              endedAt: Number(pending.ended_at),
              site,
              requestReason: pending.reason,
              reviewReason: command.reason ?? null,
            }),
          ],
        );
      } else {
        await sql.query(
          "INSERT INTO attendance_events(uid,command,at,recorded_at,details) VALUES($1,'supplement-rejected',$2,$2,$3::jsonb)",
          [
            pending.uid,
            now,
            JSON.stringify({
              supplementId: pending.id,
              reviewerId,
              repositoryId: pending.repository_id,
              requestReason: pending.reason,
              reviewReason: command.reason,
            }),
          ],
        );
      }

      const updated = (
        await sql.query(
          `UPDATE attendance_supplement_requests
           SET status=$2,version=version+1,reviewer_uid=$3,reviewed_at=$4,review_reason=$5
           WHERE id=$1 AND status='PENDING' AND version=$6 RETURNING *`,
          [
            pending.id,
            command.decision === "approve" ? "APPROVED" : "REJECTED",
            reviewerId,
            now,
            command.reason ?? null,
            command.expectedVersion,
          ],
        )
      ).rows[0] as AttendanceSupplementRow | undefined;
      if (!updated) throw new AttendanceError(409, "補登申請已由其他管理者處理。");
      if (command.decision === "approve") await this.view(sql, pending.uid, now);

      const receipt = { supplement: attendanceSupplement(updated), replayed: false };
      await sql.query(
        "INSERT INTO attendance_commands(uid,request_id,fingerprint,result,at) VALUES($1,$2,$3,$4::jsonb,$5)",
        [reviewerId, command.commandId, fingerprint, JSON.stringify(receipt), now],
      );
      return receipt;
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
    WHERE o.available_at<=$1
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
      const verificationInterval = 5 * 60 * 1000;
      await sql.query(
        `UPDATE attendance_menu_outbox SET synced_revision=$3,lease_token=NULL,lease_until=NULL,
    attempts=$4,available_at=$5 WHERE uid=$1 AND lease_token=$2`,
        [
          job.uid,
          job.token,
          success && current ? job.revision : r.synced_revision,
          success ? 0 : Number(r.attempts) + 1,
          success && current ? now + verificationInterval : !current ? now : now + delay,
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
