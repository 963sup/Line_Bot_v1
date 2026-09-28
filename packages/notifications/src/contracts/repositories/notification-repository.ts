import type { Notification } from "../../domain/entities/notification.js";

export type NotificationQuery = { id?: string; unreadOnly?: boolean };

export interface NotificationRepository {
  read(recipient: string, query: NotificationQuery): Promise<{ items: Notification[] }>;
  markRead(recipient: string, id: string, now: number): Promise<Notification>;
}
