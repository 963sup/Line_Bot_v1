import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createPostgresBaselineDeliveryStore } from "@line_bot_v1/notifications/composition/bootstrap/baseline-delivery";
import { postgresSessions } from "@line_bot_v1/platform/testing/postgres-sessions";
import { createPostgresWbsBaselineEvents } from "@line_bot_v1/wbs/composition/bootstrap/baseline-events";
import { createActions } from "../src/application/use-cases/automation.js";
import { createPostgresActionStore } from "../src/composition/bootstrap/automation.js";
import { seedCapability } from "./fixture.js";

const url = process.env.CAPABILITY_TEST_DATABASE_URL;
test("independent PostgreSQL workers claim once, fence expired saves and preserve cancellation", {
  skip: !url && !process.env.CI,
}, async (t) => {
  assert.ok(url, "CI requires disposable PostgreSQL");
  const { pool, db, close } = await postgresSessions(url);
  t.after(close);
  const fixture = await seedCapability(db, (q, v) => pool.query(q, v));
  let now = 100;
  const store = createPostgresActionStore(db);
  const notifications = {
    deliver: async () => ({
      inbox: "skipped" as const,
      notificationId: null,
      line: "unavailable" as const,
      nextAt: null,
    }),
    cancel: async () => {},
  };
  const actions = createActions({
    store,
    steps: {
      events: createPostgresWbsBaselineEvents(db),
      notifications,
      check: async () => ({ findings: [] }),
    },
    now: () => now,
  });
  const definition = {
    action: "define",
    repositoryId: "repo",
    id: randomUUID(),
    requestId: randomUUID(),
    expectedVersion: 0,
    kind: "check-wbs-revision",
    recipients: [],
    enabled: true,
  };
  const [one, two] = await Promise.all([
    actions.execute("owner", definition),
    actions.execute("owner", definition),
  ]);
  assert.deepEqual(one, two);
  const request = {
    action: "execute",
    repositoryId: "repo",
    id: definition.id,
    requestId: randomUUID(),
    expectedVersion: 1,
    revisionId: fixture.revisionId,
  };
  const created = await actions.execute("owner", request);
  assert.ok("run" in created);
  const claims = await Promise.all([store.claim(now), store.claim(now)]);
  assert.equal(claims.filter(Boolean).length, 1);
  const first = claims.find((c) => c !== null);
  assert.ok(first);
  now += 90001;
  const next = await store.claim(now);
  assert.ok(next);
  assert.equal(next.run.id, first.run.id);
  assert.equal(
    await store.finish(first, now, (r) => ({ ...r, status: "succeeded", version: r.version + 1 })),
    false,
  );
  const cancel = {
    action: "cancel",
    repositoryId: "repo",
    id: next.run.id,
    requestId: randomUUID(),
    expectedVersion: next.run.version,
  };
  await actions.execute("owner", cancel);
  assert.equal(
    await store.finish(next, now, (r) => ({ ...r, status: "succeeded", version: r.version + 1 })),
    false,
  );
  assert.equal((await actions.run("owner", "repo", next.run.id))?.status, "cancelled");
  assert.equal(await store.claim(now), null);
  assert.deepEqual(await actions.execute("owner", cancel), await actions.execute("owner", cancel));
  assert.equal((await pool.query("SELECT * FROM app_private.action_attempts")).rowCount, 2);
  assert.equal(
    (await pool.query("SELECT * FROM app_private.action_attempts WHERE finished_at IS NULL"))
      .rowCount,
    0,
  );
  assert.equal(
    (await pool.query("SELECT * FROM app_private.action_runs WHERE lease_token IS NOT NULL"))
      .rowCount,
    0,
  );
  const published = await fixture.publish();
  assert.ok(published.baselineId);
  const events = createPostgresWbsBaselineEvents(db);
  const sourceClaims = await Promise.all([events.claim(now), events.claim(now)]);
  assert.equal(sourceClaims.filter(Boolean).length, 1);
  const source = sourceClaims.find((e) => e !== null);
  assert.ok(source);
  now += 60001;
  assert.equal(await events.acknowledge(source, now), false);
  const redelivery = await events.claim(now);
  assert.ok(redelivery);
  assert.equal(redelivery.id, source.id);
  assert.equal(redelivery.revisionId, source.revisionId);
  assert.equal(await events.acknowledge(redelivery, now), true);
  const delivery = createPostgresBaselineDeliveryStore(db, "line:primary");
  const input = {
    key: "concurrent",
    repositoryId: "repo",
    baselineId: published.baselineId,
    revisionId: fixture.revisionId,
    recipient: "viewer",
  };
  await Promise.all([
    delivery.create(input, "payload", now),
    delivery.create(input, "payload", now),
  ]);
  assert.equal((await pool.query("SELECT * FROM app_private.notifications")).rowCount, 1);
  const deliveryClaims = await Promise.all([
    delivery.claim(input.key, now),
    delivery.claim(input.key, now),
  ]);
  assert.equal(deliveryClaims.filter((v) => v.claim !== null).length, 1);
  const providerAttempt = deliveryClaims.find((v) => v.claim !== null)?.claim;
  assert.ok(providerAttempt);
  now += 60001;
  assert.equal((await delivery.complete(providerAttempt, "accepted", now)).line, "stale");
  const recovered = await delivery.claim(input.key, now);
  assert.ok(recovered.claim);
  assert.equal(recovered.claim.retryKey, providerAttempt.retryKey);
  await delivery.cancel(input.key, now);
  assert.equal((await delivery.complete(recovered.claim, "accepted", now)).line, "stale");
  assert.equal((await delivery.claim(input.key, now)).result.line, "unknown");
});
