import { NotificationError, notificationId } from "../domain.js";
import type { NotificationRepository } from "./ports/notification-repository.js";

export function createNotifications(deps: {
  activeUser(subject: string): Promise<{ id: string }>;
  repository(): NotificationRepository;
  now(): number;
}) {
  return {
    async read(subject: string, input: { id?: string; unreadOnly?: boolean } = {}) {
      if (input.id !== undefined && !notificationId(input.id)) {
        throw new NotificationError(400, "通知識別碼不正確。");
      }
      const user = await deps.activeUser(subject);
      return deps.repository().read(user.id, {
        id: input.id?.toLowerCase(),
        unreadOnly: input.unreadOnly === true,
      });
    },
    async markRead(subject: string, id: string) {
      if (!notificationId(id)) throw new NotificationError(400, "通知識別碼不正確。");
      const user = await deps.activeUser(subject);
      return deps.repository().markRead(user.id, id.toLowerCase(), deps.now());
    },
  };
}
