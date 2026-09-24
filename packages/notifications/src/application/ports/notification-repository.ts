import type { Notification, NotificationQuery } from "../../domain.js";

export interface NotificationRepository {
  read(recipient: string, query: NotificationQuery): Promise<{ items: Notification[] }>;
  markRead(recipient: string, id: string, now: number): Promise<Notification>;
}
