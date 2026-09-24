import { businessDatabase, type Database } from "@line-work/platform/adapters/postgres";
import type { NotificationRepository } from "../application/ports/notification-repository.js";
import {
  type Notification,
  NotificationError,
  type NotificationKind,
  type NotificationQuery,
} from "../domain.js";

type NotificationRow = {
  id: string;
  recipient: string;
  source_type: string;
  source_id: string;
  source_version: string;
  kind: NotificationKind;
  title: string;
  body: string;
  created_at: number | string;
  read_at: number | string | null;
  version: number;
};

function notification(row: NotificationRow): Notification {
  return {
    id: row.id,
    recipient: row.recipient,
    sourceType: row.source_type,
    sourceId: row.source_id,
    sourceVersion: row.source_version,
    kind: row.kind,
    title: row.title,
    body: row.body,
    createdAt: Number(row.created_at),
    readAt: row.read_at === null ? null : Number(row.read_at),
    version: row.version,
  };
}

export class PostgresNotificationRepository implements NotificationRepository {
  constructor(private db: Database = businessDatabase()) {}

  read(recipient: string, query: NotificationQuery) {
    return this.db.transaction(async (sql) => {
      const rows = (
        await sql.query(
          `SELECT id,recipient,source_type,source_id,source_version,kind,title,body,created_at,read_at,version
           FROM notifications
           WHERE recipient=$1
             AND ($2::uuid IS NULL OR id=$2::uuid)
             AND ($3::boolean IS FALSE OR read_at IS NULL)
           ORDER BY created_at DESC,id
           LIMIT 100`,
          [recipient, query.id ?? null, query.unreadOnly === true],
        )
      ).rows as NotificationRow[];
      if (query.id && !rows.length) throw new NotificationError(404, "通知不存在或不可閱讀。");
      return { items: rows.map(notification) };
    });
  }

  markRead(recipient: string, id: string, now: number) {
    return this.db.transaction(async (sql) => {
      const current = (
        await sql.query(
          `SELECT id,recipient,source_type,source_id,source_version,kind,title,body,created_at,read_at,version
           FROM notifications
           WHERE id=$1::uuid AND recipient=$2
           FOR UPDATE`,
          [id, recipient],
        )
      ).rows[0] as NotificationRow | undefined;
      if (!current) throw new NotificationError(404, "通知不存在或不可閱讀。");
      if (current.read_at !== null) return notification(current);
      const updated = (
        await sql.query(
          `UPDATE notifications
           SET read_at=$3,version=version+1
           WHERE id=$1::uuid AND recipient=$2
           RETURNING id,recipient,source_type,source_id,source_version,kind,title,body,created_at,read_at,version`,
          [id, recipient, now],
        )
      ).rows[0] as NotificationRow;
      return notification(updated);
    });
  }
}
