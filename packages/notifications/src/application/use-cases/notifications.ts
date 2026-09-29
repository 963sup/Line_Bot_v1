import type {
  NotificationDto,
  NotificationPage,
  NotificationResult,
} from "../../contracts/dto/notification.js";
import type { NotificationRuntime } from "../../contracts/output/notification-runtime.js";
import type { NotificationRepository } from "../../contracts/repositories/notification-repository.js";
import type { Notification } from "../../domain/aggregates/notification.js";
import { normalizeNotificationId } from "../../domain/value-objects/notification-id.js";
import type { MarkNotificationReadCommand } from "../commands/mark-notification-read.js";
import type { ReadNotificationsQuery } from "../queries/read-notifications.js";

function publishedNotification(notification: Notification): NotificationDto {
  return {
    id: notification.id,
    recipient: notification.recipient,
    sourceType: notification.sourceType,
    sourceId: notification.sourceId,
    sourceVersion: notification.sourceVersion,
    kind: notification.kind,
    title: notification.title,
    body: notification.body,
    createdAt: notification.createdAt,
    readAt: notification.readAt,
    version: notification.version,
  };
}

export function createNotifications(
  deps: NotificationRuntime & { repository(): NotificationRepository },
) {
  return {
    async read(
      subject: string,
      input: ReadNotificationsQuery = {},
    ): Promise<NotificationResult<NotificationPage>> {
      const id = input.id === undefined ? undefined : normalizeNotificationId(input.id);
      if (input.id !== undefined && id === null) {
        return {
          ok: false,
          error: { code: "invalid-notification-id", message: "通知識別碼不正確。" },
        };
      }
      const user = await deps.activeUser(subject);
      const page = await deps.repository().read(user.id, {
        id: id ?? undefined,
        unreadOnly: input.unreadOnly === true,
      });
      if (id && page.items.length === 0) {
        return {
          ok: false,
          error: { code: "notification-not-found", message: "通知不存在或不可閱讀。" },
        };
      }
      return { ok: true, value: { items: page.items.map(publishedNotification) } };
    },
    async markRead(
      subject: string,
      command: MarkNotificationReadCommand,
    ): Promise<NotificationResult<NotificationDto>> {
      const id = normalizeNotificationId(command.id);
      if (id === null) {
        return {
          ok: false,
          error: { code: "invalid-notification-id", message: "通知識別碼不正確。" },
        };
      }
      const user = await deps.activeUser(subject);
      const notification = await deps.repository().markRead(user.id, id, deps.now());
      if (notification === null) {
        return {
          ok: false,
          error: { code: "notification-not-found", message: "通知不存在或不可閱讀。" },
        };
      }
      return { ok: true, value: publishedNotification(notification) };
    },
  };
}
