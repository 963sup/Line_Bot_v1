import { businessDatabase, type Database } from "@line_bot_v1/platform/postgres";
import type {
  NotificationQuery,
  NotificationRepository,
} from "../../../contracts/repositories/notification-repository.js";
import {
  markNotificationRead,
  type Notification,
} from "../../../domain/aggregates/notification.js";
import { notificationKind } from "../../../domain/value-objects/notification-kind.js";

function invalidRow() {
  return new Error("Notification persistence returned invalid data.");
}

function rowObject(value: unknown): object {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw invalidRow();
  return value;
}

function rowField(row: object, key: string): unknown {
  const value: unknown = Reflect.get(row, key);
  return value;
}

function stringField(row: object, key: string): string {
  const value = rowField(row, key);
  if (typeof value !== "string") throw invalidRow();
  return value;
}

function integerValue(value: unknown): number {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed)) return parsed;
  }
  throw invalidRow();
}

function integerField(row: object, key: string): number {
  return integerValue(rowField(row, key));
}

function nullableIntegerField(row: object, key: string): number | null {
  const value = rowField(row, key);
  return value === null ? null : integerValue(value);
}

function notification(value: unknown): Notification {
  const row = rowObject(value);
  const kind = notificationKind(rowField(row, "kind"));
  if (kind === null) throw invalidRow();

  const version = integerField(row, "version");
  if (version < 1) throw invalidRow();

  return {
    id: stringField(row, "id"),
    recipient: stringField(row, "recipient"),
    sourceType: stringField(row, "source_type"),
    sourceId: stringField(row, "source_id"),
    sourceVersion: stringField(row, "source_version"),
    kind,
    title: stringField(row, "title"),
    body: stringField(row, "body"),
    createdAt: integerField(row, "created_at"),
    readAt: nullableIntegerField(row, "read_at"),
    version,
  };
}

export class PostgresNotificationRepository implements NotificationRepository {
  constructor(private db: Database = businessDatabase()) {}

  read(recipient: string, query: NotificationQuery) {
    return this.db.transaction(async (sql) => {
      const result = await sql.query(
        `SELECT id,recipient,source_type,source_id,source_version,kind,title,body,created_at,read_at,version
         FROM notifications
         WHERE recipient=$1
           AND ($2::uuid IS NULL OR id=$2::uuid)
           AND ($3::boolean IS FALSE OR read_at IS NULL)
           AND (
             source_type NOT IN ('issue','discussion')
             OR EXISTS (
               SELECT 1
               FROM notification_repository_source_access access
               WHERE access.source_type=notifications.source_type
                 AND access.source_id=notifications.source_id
                 AND (access.user_id=$1 OR access.user_id IS NULL)
             )
           )
         ORDER BY created_at DESC,id
         LIMIT 100`,
        [recipient, query.id ?? null, query.unreadOnly === true],
      );
      const rows: unknown[] = result.rows;
      return { items: rows.map(notification) };
    });
  }

  markRead(recipient: string, id: string, now: number) {
    return this.db.transaction(async (sql) => {
      const currentResult = await sql.query(
        `SELECT id,recipient,source_type,source_id,source_version,kind,title,body,created_at,read_at,version
         FROM notifications
         WHERE id=$1::uuid AND recipient=$2
           AND (
             source_type NOT IN ('issue','discussion')
             OR EXISTS (
               SELECT 1
               FROM notification_repository_source_access access
               WHERE access.source_type=notifications.source_type
                 AND access.source_id=notifications.source_id
                 AND (access.user_id=$2 OR access.user_id IS NULL)
             )
           )
         FOR UPDATE`,
        [id, recipient],
      );
      const currentRows: unknown[] = currentResult.rows;
      const current = currentRows[0];
      if (current === undefined) return null;

      const original = notification(current);
      const next = markNotificationRead(original, now);
      if (next === original) return original;

      const updatedResult = await sql.query(
        `UPDATE notifications
         SET read_at=$3,version=version+1
         WHERE id=$1::uuid AND recipient=$2
           AND (
             source_type NOT IN ('issue','discussion')
             OR EXISTS (
               SELECT 1
               FROM notification_repository_source_access access
               WHERE access.source_type=notifications.source_type
                 AND access.source_id=notifications.source_id
                 AND (access.user_id=$2 OR access.user_id IS NULL)
             )
           )
         RETURNING id,recipient,source_type,source_id,source_version,kind,title,body,created_at,read_at,version`,
        [id, recipient, next.readAt],
      );
      const updatedRows: unknown[] = updatedResult.rows;
      const updated = updatedRows[0];
      if (updated === undefined) return null;
      return notification(updated);
    });
  }
}
