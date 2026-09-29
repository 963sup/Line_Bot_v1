import { businessDatabase, type Database } from "@line_bot_v1/platform/postgres";
import type {
  NotificationQuery,
  NotificationRepository,
} from "../../../contracts/repositories/notification-repository.js";
import {
  markNotificationRead,
  type Notification,
} from "../../../domain/aggregates/notification.js";
import type { NotificationKind } from "../../../domain/value-objects/notification-kind.js";

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
      if (!current) return null;
      const original = notification(current);
      const next = markNotificationRead(original, now);
      if (next === original) return original;
      const updated = (
        await sql.query(
          `UPDATE notifications
           SET read_at=$3,version=version+1
           WHERE id=$1::uuid AND recipient=$2
           RETURNING id,recipient,source_type,source_id,source_version,kind,title,body,created_at,read_at,version`,
          [id, recipient, next.readAt],
        )
      ).rows[0] as NotificationRow;
      return notification(updated);
    });
  }
}
