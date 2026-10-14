import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createNotifications } from "@line_bot_v1/notifications/application/use-cases/notifications";
import { createPostgresNotificationRepository } from "@line_bot_v1/notifications/composition/bootstrap/postgres-notification-repository";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { seedCapability } from "../../packages/actions/test/fixture.ts";
import { actionRuntime } from "./composition.mjs";

test("host runtime recovers uncertain LINE acceptance and exposes one authorized Inbox item", async (t) => {
  // No environment loader or real provider request is allowed in this acceptance test.
  t.mock.property(process, "env", {
    APP_ORIGIN: "https://acceptance.example.test",
    LINE_CHANNEL_ACCESS_TOKEN: "synthetic-token",
  });
  let now = 100;
  t.mock.method(Date, "now", () => now);
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    assert.equal(url, "https://api.line.me/v2/bot/message/push");
    assert.equal(init.method, "POST");
    const headers = new Headers(init.headers);
    assert.equal(headers.get("authorization"), "Bearer synthetic-token");
    requests.push({ body: init.body, key: headers.get("x-line-retry-key") });
    if (requests.length === 1) throw new Error("provider accepted but response was lost");
    return new Response(null, {
      status: 409,
      headers: { "x-line-accepted-request-id": "synthetic-accepted-request" },
    });
  });
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  const fixture = await seedCapability(db, (text, values) => pg.query(text, values));
  const { actions, worker } = actionRuntime(db);
  await actions.execute("owner", {
    action: "define",
    id: randomUUID(),
    repositoryId: "repo",
    requestId: randomUUID(),
    expectedVersion: 0,
    kind: "notify-wbs-baseline",
    recipients: ["viewer", "viewer"],
    enabled: true,
  });
  const published = await fixture.publish();
  assert.ok(published.baselineId);
  // A budget of one accepts the event without executing a recipient step.
  assert.deepEqual(await worker.once(1), { events: 1, claimed: 0, finished: 0, stale: 0 });
  const row = (await pg.query("SELECT id FROM app_private.action_runs")).rows[0];
  assert.ok(row);
  await worker.once(1);
  const waiting = await actions.run("owner", "repo", row.id);
  assert.equal(waiting.status, "waiting");
  assert.equal(waiting.results[0].value.line, "unknown");
  assert.equal(requests.length, 1);

  const inbox = createNotifications({
    activeUser: async (subject) => ({ id: subject }),
    repository: () => createPostgresNotificationRepository(db),
    now: () => now,
  });
  const page = await inbox.read("viewer");
  assert.equal(page.ok, true);
  assert.equal(page.value.items.length, 1);
  const item = page.value.items[0];
  assert.equal(item.sourceType, "wbs-baseline");
  assert.equal(item.sourceId, published.baselineId);
  assert.equal(item.sourceVersion, fixture.revisionId);
  assert.equal(item.readAt, null);
  const marked = await inbox.markRead("viewer", { id: item.id });
  assert.equal(marked.ok, true);
  assert.equal(marked.value.readAt, now);

  // Reconstruct the real host runtime, as after a process restart.
  now = waiting.due;
  const restarted = actionRuntime(db);
  await restarted.worker.once(1);
  const done = await restarted.actions.run("owner", "repo", row.id);
  assert.equal(done.status, "succeeded");
  assert.equal(done.results[0].value.line, "accepted");
  assert.equal(done.attempt, 2);
  assert.deepEqual(requests[0], requests[1]);
  assert.match(requests[0].key, /^[0-9a-f-]{36}$/i);
  assert.deepEqual(JSON.parse(requests[0].body), {
    to: `U${"1".repeat(32)}`,
    messages: [
      {
        type: "text",
        text: "WBS 已發布新基準。請前往 Inbox 查看通知：https://acceptance.example.test/notifications",
      },
    ],
  });
  await restarted.worker.once(10);
  assert.equal(requests.length, 2);
  assert.equal((await inbox.read("viewer")).value.items.length, 1);
  assert.equal((await inbox.read("outsider")).value.items.length, 0);
  await pg.query(
    "DELETE FROM app_private.repository_access WHERE repository_id='repo' AND principal_id='viewer'",
  );
  assert.equal((await inbox.read("viewer")).value.items.length, 0);
  assert.equal((await inbox.markRead("viewer", { id: item.id })).ok, false);
});
