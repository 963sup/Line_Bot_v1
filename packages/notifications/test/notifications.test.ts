import assert from "node:assert/strict";
import { test } from "node:test";
import { createNotifications } from "../src/application/use-cases/notifications.js";
import {
  parseNotificationDto,
  parseNotificationPage,
} from "../src/contracts/dto/notification.js";
import type { NotificationRepository } from "../src/contracts/repositories/notification-repository.js";
import { markNotificationRead, type Notification } from "../src/domain/aggregates/notification.js";
import { normalizeNotificationId } from "../src/domain/value-objects/notification-id.js";

const id = "11111111-1111-4111-8111-111111111111";
const item: Notification = Object.freeze({
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
});

type RepositoryOverrides = {
  read?: NotificationRepository["read"];
  markRead?: NotificationRepository["markRead"];
};

function fixture(overrides: RepositoryOverrides = {}) {
  const calls: string[] = [];
  const repository: NotificationRepository = {
    async read(recipient, query) {
      if (overrides.read) return overrides.read(recipient, query);
      calls.push(`read:${recipient}:${query.id ?? ""}:${query.unreadOnly === true}`);
      return { items: [item] };
    },
    async markRead(recipient, notificationId, now) {
      if (overrides.markRead) return overrides.markRead(recipient, notificationId, now);
      calls.push(`mark:${recipient}:${notificationId}:${now}`);
      return markNotificationRead(item, now);
    },
  };
  const deps = {
    async activeUser(subject: string) {
      calls.push(`qualify:${subject}`);
      return { id: "user-1" };
    },
    repository: () => repository,
    now: () => 10,
  };
  return { calls, notifications: createNotifications(deps) };
}

test("Notification Aggregate owns the first-read transition without changing source truth", () => {
  const read = markNotificationRead(item, 10);
  assert.deepEqual(read, { ...item, readAt: 10, version: 2 });
  assert.equal(item.readAt, null);
  assert.equal(item.version, 1);
  assert.equal(markNotificationRead(read, 20), read);
  const atEpoch = markNotificationRead(item, 0);
  assert.equal(markNotificationRead(atEpoch, 20), atEpoch);
});

test("use cases scope both operations to the qualified user", async () => {
  const { notifications, calls } = fixture();
  assert.deepEqual(await notifications.read("verified-subject", { id, unreadOnly: true }), {
    ok: true,
    value: { items: [item] },
  });
  assert.deepEqual(await notifications.markRead("verified-subject", { id }), {
    ok: true,
    value: { ...item, readAt: 10, version: 2 },
  });
  assert.deepEqual(calls, [
    "qualify:verified-subject",
    `read:user-1:${id}:true`,
    "qualify:verified-subject",
    `mark:user-1:${id}:10`,
  ]);
});

test("Notification owner canonicalizes both query and command locators", async () => {
  const mixedCaseId = "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA";
  const normalizedId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  assert.equal(normalizeNotificationId(mixedCaseId), normalizedId);
  assert.equal(normalizeNotificationId("not-a-notification"), null);
  const { notifications, calls } = fixture();
  await notifications.read("subject", { id: mixedCaseId });
  await notifications.markRead("subject", { id: mixedCaseId });
  assert.deepEqual(calls, [
    "qualify:subject",
    `read:user-1:${normalizedId}:false`,
    "qualify:subject",
    `mark:user-1:${normalizedId}:10`,
  ]);
});

test("invalid locators are structured business failures without persistence effects", async () => {
  const { notifications, calls } = fixture();
  const expected = {
    ok: false,
    error: { code: "invalid-notification-id", message: "通知識別碼不正確。" },
  };
  assert.deepEqual(await notifications.read("subject", { id: "bad" }), expected);
  assert.deepEqual(await notifications.markRead("subject", { id: "bad" }), expected);
  assert.deepEqual(calls, []);
});

test("an empty inbox differs from an unavailable notification", async () => {
  const { notifications } = fixture({
    read: async () => ({ items: [] }),
    markRead: async () => null,
  });
  assert.deepEqual(await notifications.read("subject"), { ok: true, value: { items: [] } });
  const unavailable = {
    ok: false,
    error: { code: "notification-not-found", message: "通知不存在或不可閱讀。" },
  };
  assert.deepEqual(await notifications.read("subject", { id }), unavailable);
  assert.deepEqual(await notifications.markRead("subject", { id }), unavailable);
});

test("qualification failure cannot reach a repository or the clock", async () => {
  const rejected = new Error("qualification unavailable");
  const notifications = createNotifications({
    activeUser: async () => {
      throw rejected;
    },
    repository: () => assert.fail("must not resolve persistence"),
    now: () => assert.fail("must not obtain a mutation timestamp"),
  });
  await assert.rejects(notifications.read("subject"), (error) => error === rejected);
  await assert.rejects(notifications.markRead("subject", { id }), (error) => error === rejected);
});

test("storage failures propagate instead of becoming empty data or not-found results", async () => {
  const unavailable = new Error("database unavailable");
  const { notifications } = fixture({
    read: async () => {
      throw unavailable;
    },
    markRead: async () => {
      throw unavailable;
    },
  });
  await assert.rejects(notifications.read("subject"), (error) => error === unavailable);
  await assert.rejects(notifications.markRead("subject", { id }), (error) => error === unavailable);
});

test("published DTOs whitelist fields and do not expose Aggregate object identity", async () => {
  const internal = { ...item, internalDeliveryState: "not a published field" };
  const { notifications } = fixture({
    read: async () => ({ items: [internal] }),
    markRead: async () => internal,
  });
  const read = await notifications.read("subject");
  const marked = await notifications.markRead("subject", { id });
  assert.equal(read.ok, true);
  assert.equal(marked.ok, true);
  if (!read.ok || !marked.ok) assert.fail("expected successful projections");
  assert.deepEqual(read.value.items, [item]);
  assert.deepEqual(marked.value, item);
  assert.notEqual(read.value.items[0], internal);
  assert.notEqual(marked.value, internal);
});

test("published DTO parsers narrow untrusted wire values without casts", () => {
  assert.deepEqual(parseNotificationPage({ items: [item] }), { items: [item] });
  assert.deepEqual(parseNotificationDto({ ...item, ignored: "not published" }), item);
  assert.equal(parseNotificationPage({ items: [{ ...item, version: "1" }] }), null);
  assert.equal(parseNotificationDto({ ...item, kind: "unknown" }), null);
  assert.equal(parseNotificationDto({ ...item, readAt: "10" }), null);
});
