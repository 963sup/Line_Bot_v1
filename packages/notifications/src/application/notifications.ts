import { NotificationError, normalizeNotificationId } from "../domain.js";
import type { NotificationRepository } from "./ports/notification-repository.js";

export function createNotifications(deps: {
  activeUser(subject: string): Promise<{ id: string }>;
  repository(): NotificationRepository;
  now(): number;
}) {
  return {
    async read(subject: string, input: { id?: string; unreadOnly?: boolean } = {}) {
      const id = input.id === undefined ? undefined : normalizeNotificationId(input.id);
      if (input.id !== undefined && id === null) {
        throw new NotificationError(400, "通知識別碼不正確。");
      }
      const user = await deps.activeUser(subject);
      return deps.repository().read(user.id, {
        id: id ?? undefined,
        unreadOnly: input.unreadOnly === true,
      });
    },
    async markRead(subject: string, id: string) {
      const normalizedId = normalizeNotificationId(id);
      if (normalizedId === null) throw new NotificationError(400, "通知識別碼不正確。");
      const user = await deps.activeUser(subject);
      return deps.repository().markRead(user.id, normalizedId, deps.now());
    },
  };
}
