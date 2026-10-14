import assert from "node:assert/strict";
import { test } from "node:test";
import { createBaselineNotifications } from "@line_bot_v1/notifications/application/use-cases/baseline-delivery";
import { createPostgresBaselineDeliveryStore } from "@line_bot_v1/notifications/composition/bootstrap/baseline-delivery";
import { createPostgresNotificationRepository } from "@line_bot_v1/notifications/composition/bootstrap/postgres-notification-repository";
import { createSql, type Database } from "@line_bot_v1/platform/postgres";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { seedCapability } from "./fixture.js";

test("durable LINE intent preserves payload/key, current binding and unknown outcomes", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  const fixture = await seedCapability(db, (q, v) => pg.query(q, v)),
    published = await fixture.publish();
  assert.ok(published.baselineId);
  const input = {
    key: "recovery",
    repositoryId: "repo",
    baselineId: published.baselineId,
    revisionId: fixture.revisionId,
    recipient: "viewer",
  };
  let now = 100,
    calls = 0;
  const requests: unknown[] = [];
  const store = createPostgresBaselineDeliveryStore(db, "line:primary");
  const failing: Database = {
    transaction: (work) =>
      db.transaction((sql) =>
        work(
          createSql(async (text, values) => {
            if (text.startsWith("INSERT INTO notification_receipts"))
              throw new Error("receipt failure");
            return sql.query(text, values);
          }),
        ),
      ),
  };
  await assert.rejects(
    createPostgresBaselineDeliveryStore(failing, "line:primary").create(input, "payload", now),
    /receipt failure/,
  );
  assert.equal((await pg.query("SELECT * FROM app_private.notifications")).rows.length, 0);
  assert.equal(
    (await pg.query("SELECT * FROM app_private.notification_deliveries")).rows.length,
    0,
  );
  const notifications = createBaselineNotifications({
    store,
    send: async (target, payload, key) => {
      requests.push({ target, payload, key });
      if (calls++ === 0) throw new Error("timeout");
      return "accepted";
    },
    inboxUrl: "https://example.test/notifications",
    now: () => now,
  });
  const first = await notifications.deliver(input, async () => true);
  assert.equal(first.inbox, "created");
  assert.equal(first.line, "unknown");
  assert.ok(first.nextAt);
  now = first.nextAt;
  const second = await notifications.deliver(input, async () => true);
  assert.equal(second.line, "accepted");
  assert.deepEqual(requests[0], requests[1]);
  await notifications.deliver(input, async () => true);
  assert.equal(calls, 2);
  const inbox = createPostgresNotificationRepository(db);
  assert.equal((await inbox.read("viewer", {})).items.length, 1);
  await assert.rejects(
    store.create(
      { ...input, revisionId: "00000000-0000-4000-8000-000000000000" },
      "different",
      now,
    ),
  );
  await pg.query(
    "DELETE FROM app_private.repository_access WHERE repository_id='repo' AND principal_id='viewer'",
  );
  assert.equal((await inbox.read("viewer", {})).items.length, 0);
  assert.equal(await inbox.markRead("viewer", first.notificationId ?? "", now), null);
  assert.equal(
    (await notifications.deliver({ ...input, key: "revoked" }, async () => true)).inbox,
    "skipped",
  );
  await pg.query(
    "INSERT INTO app_private.repository_access(repository_id,principal_id,capability,version) VALUES('repo','viewer','read',1)",
  );
  const uncertain = createBaselineNotifications({
    store,
    send: async () => {
      throw new Error("timeout");
    },
    inboxUrl: "https://example.test/notifications",
    now: () => now,
  });
  const pending = await uncertain.deliver({ ...input, key: "window" }, async () => true);
  assert.equal(pending.line, "unknown");
  now += 23 * 3600000;
  const expired = await uncertain.deliver({ ...input, key: "window" }, async () => true);
  assert.equal(expired.line, "unknown");
  assert.equal(expired.nextAt, null);
  const revokedUnknown = await uncertain.deliver(
    { ...input, key: "revoked-unknown" },
    async () => true,
  );
  assert.ok(revokedUnknown.nextAt);
  await pg.query("UPDATE app_private.user_identities SET subject=$1 WHERE user_id='viewer'", [
    `U${"3".repeat(32)}`,
  ]);
  now = revokedUnknown.nextAt;
  const unknownAfterRebind = await uncertain.deliver(
    { ...input, key: "revoked-unknown" },
    async () => true,
  );
  assert.equal(unknownAfterRebind.line, "unknown");
  assert.equal(unknownAfterRebind.nextAt, null);
  // Binding changes cannot redirect a persisted delivery to a different person.
  now += 1;
  const retrying = createBaselineNotifications({
    store,
    send: async () => "retry",
    inboxUrl: "https://example.test/notifications",
    now: () => now,
  });
  const retry = await retrying.deliver({ ...input, key: "binding" }, async () => true);
  assert.ok(retry.nextAt);
  await pg.query("UPDATE app_private.user_identities SET subject=$1 WHERE user_id='viewer'", [
    `U${"2".repeat(32)}`,
  ]);
  now = retry.nextAt;
  assert.equal(
    (await retrying.deliver({ ...input, key: "binding" }, async () => true)).line,
    "unavailable",
  );
  // A tombstone blocks delayed stale creation after cancellation.
  await store.cancel("cancelled", now);
  assert.equal(
    (await notifications.deliver({ ...input, key: "cancelled" }, async () => true)).inbox,
    "skipped",
  );
  await store.create({ ...input, key: "stale" }, "payload", now);
  const old = await store.claim("stale", now);
  assert.ok(old.claim);
  now += 60001;
  const replacement = await store.claim("stale", now);
  assert.ok(replacement.claim);
  assert.equal((await store.complete(old.claim, "accepted", now)).line, "stale");
  assert.equal((await store.complete(replacement.claim, "accepted", now)).line, "accepted");
});
