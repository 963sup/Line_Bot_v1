import assert from "node:assert/strict";
import { test } from "node:test";
import { createNotifications } from "../src/application/notifications.js";
import type { NotificationRepository } from "../src/application/ports/notification-repository.js";
import { type Notification, normalizeNotificationId } from "../src/domain.js";

const id = "11111111-1111-4111-8111-111111111111";
const item: Notification = {
  id,
  recipient: "user-1",
  sourceType: "issue",
  sourceId: "issue-1",
  sourceVersion: "3",
  kind: "issue",
  title: "Issue updated",
  body: "A referenced issue changed.",
  createdAt: 1,
  readAt: null,
  version: 1,
};

test("notification application scopes reads and read state to the active user", async () => {
  const calls: string[] = [];
  const repository: NotificationRepository = {
    async read(recipient, query) {
      calls.push(`read:${recipient}:${query.id ?? ""}:${query.unreadOnly === true}`);
      return { items: [item] };
    },
    async markRead(recipient, notificationId, now) {
      calls.push(`read-state:${recipient}:${notificationId}:${now}`);
      return { ...item, readAt: now, version: 2 };
    },
  };
  const notifications = createNotifications({
    activeUser: async () => ({ id: "user-1" }),
    repository: () => repository,
    now: () => 10,
  });

  assert.deepEqual(await notifications.read("line-user", { id, unreadOnly: true }), {
    items: [item],
  });
  assert.equal((await notifications.markRead("line-user", id)).readAt, 10);
  assert.deepEqual(calls, [`read:user-1:${id}:true`, `read-state:user-1:${id}:10`]);
});

test("Notification owner canonicalizes locator identity before persistence", async () => {
  const mixedCaseId = "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA";
  assert.equal(normalizeNotificationId(mixedCaseId), "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  assert.equal(normalizeNotificationId("not-a-notification"), null);

  const calls: string[] = [];
  const notifications = createNotifications({
    activeUser: async () => ({ id: "user-1" }),
    repository: () => ({
      async read(recipient, query) {
        calls.push(`${recipient}:${query.id ?? ""}`);
        return { items: [] };
      },
      async markRead() {
        throw new Error("not used");
      },
    }),
    now: () => 10,
  });

  await notifications.read("line-user", { id: mixedCaseId });
  assert.deepEqual(calls, ["user-1:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"]);
});
