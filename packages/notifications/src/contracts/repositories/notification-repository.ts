import type { Notification } from "../../domain/aggregates/notification.js";

export type NotificationQuery = { id?: string; unreadOnly?: boolean };

export type NotificationRepository = {
  read(recipient: string, query: NotificationQuery): Promise<{ items: Notification[] }>;
  /**
   * Apply the Aggregate transition atomically within recipient scope.
   * A replay preserves the first read timestamp and version. Missing or foreign
   * notifications return null; infrastructure failures must not look like absence.
   */
  markRead(recipient: string, id: string, now: number): Promise<Notification | null>;
};
