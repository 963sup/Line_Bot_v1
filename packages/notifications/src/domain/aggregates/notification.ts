import type { NotificationKind } from "../value-objects/notification-kind.js";

export type Notification = Readonly<{
  id: string;
  recipient: string;
  sourceType: string;
  sourceId: string;
  sourceVersion: string;
  kind: NotificationKind;
  title: string;
  body: string;
  createdAt: number;
  readAt: number | null;
  version: number;
}>;

/** The first read wins. Replays preserve both the timestamp and the version. */
export function markNotificationRead(notification: Notification, now: number): Notification {
  if (notification.readAt !== null) return notification;
  return { ...notification, readAt: now, version: notification.version + 1 };
}
