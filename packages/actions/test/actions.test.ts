import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createBaselineNotifications } from "@line_bot_v1/notifications/application/use-cases/baseline-delivery";
import { createPostgresBaselineDeliveryStore } from "@line_bot_v1/notifications/composition/bootstrap/baseline-delivery";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { createPostgresWbsBaselineEvents } from "@line_bot_v1/wbs/composition/bootstrap/baseline-events";
import { createActions } from "../src/application/use-cases/automation.js";
import { createActionsWorker } from "../src/application/use-cases/worker.js";
import { createPostgresActionStore } from "../src/composition/bootstrap/automation.js";
import { ActionsError, ruleDefinition } from "../src/domain/automation.js";
import { seedCapability } from "./fixture.js";

test("fixed definitions reject broad fan-out and preserve canonical explicit recipients", () => {
  assert.deepEqual(ruleDefinition("notify-wbs-baseline", ["b", "a", "b"]), ["a", "b"]);
  assert.throws(() => ruleDefinition("check-wbs-revision", ["a"]), ActionsError);
  assert.throws(() => ruleDefinition("notify-wbs-baseline", []), ActionsError);
});
test("event replay freezes all rule versions, commands replay exactly and worker preserves effects", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  const fixture = await seedCapability(db, (q, v) => pg.query(q, v));
  let now = 100,
    sends = 0,
    skipAck = true,
    failCheck = false;
  const events = createPostgresWbsBaselineEvents(db);
  const notificationStore = createPostgresBaselineDeliveryStore(db, "line:primary");
  const steps = {
    events: {
      cursor: (repositoryId: string) => events.cursor(repositoryId),
      claim: (at: number) => events.claim(at),
      acknowledge: (event: Parameters<typeof events.acknowledge>[0], at: number) =>
        skipAck ? Promise.resolve(false) : events.acknowledge(event, at),
    },
    notifications: createBaselineNotifications({
      store: notificationStore,
      send: async () => {
        sends++;
        return "accepted";
      },
      inboxUrl: "https://example.test/notifications",
      now: () => now,
    }),
    check: async () => {
      if (failCheck) throw new Error("temporary source failure");
      return { findings: [] };
    },
  };
  const store = createPostgresActionStore(db),
    actions = createActions({ store, steps, now: () => now }),
    worker = createActionsWorker({ store, steps, now: () => now });
  const definition = {
    action: "define",
    id: randomUUID(),
    repositoryId: "repo",
    requestId: randomUUID(),
    expectedVersion: 0,
    kind: "notify-wbs-baseline",
    recipients: ["viewer", "owner", "ignored", "outsider", "viewer"],
    enabled: true,
  };
  const saved = await actions.execute("owner", definition);
  assert.deepEqual(await actions.execute("owner", definition), saved);
  await assert.rejects(actions.execute("owner", { ...definition, enabled: false }), ActionsError);
  await assert.rejects(
    actions.execute("viewer", { ...definition, id: randomUUID(), requestId: randomUUID() }),
  );
  await assert.rejects(actions.execute("owner", { ...definition, role: "admin" }), ActionsError);
  const published = await fixture.publish();
  assert.ok(published.baselineId);
  const lateRule = {
    ...definition,
    id: randomUUID(),
    requestId: randomUUID(),
    recipients: ["viewer"],
  };
  await actions.execute("owner", lateRule);
  // Simulate a crash after durable acceptance but before source acknowledgment.
  const accepted = await worker.once(1);
  assert.equal(accepted.claimed, 0);
  assert.equal(accepted.events, 0);
  assert.equal((await pg.query("SELECT * FROM app_private.action_runs")).rows.length, 1);
  await actions.execute("owner", {
    ...definition,
    requestId: randomUUID(),
    expectedVersion: 1,
    recipients: ["viewer"],
  });
  now += 60001;
  skipAck = false;
  const row = (await pg.query<{ id: string }>("SELECT id FROM app_private.action_runs")).rows[0];
  assert.ok(row);
  const frozen = await actions.run("owner", "repo", row.id);
  assert.ok(frozen);
  assert.equal(frozen.rule.version, 1);
  assert.equal(frozen.rule.recipients.length, 4);
  await worker.once(10);
  const done = await actions.run("owner", "repo", row.id);
  assert.ok(done);
  assert.equal(done.status, "succeeded");
  assert.equal(done.results.length, 4);
  assert.equal(sends, 1);
  assert.equal((await pg.query("SELECT * FROM app_private.notifications")).rows.length, 2);
  await worker.once(10);
  assert.equal(sends, 1);
  await assert.rejects(actions.run("viewer", "repo", row.id));
  await assert.rejects(
    actions.run("owner", "other", row.id).then((v) => {
      if (v === null) throw new Error("scope");
    }),
  );
  // Manual fixed check, then disable/re-enable cannot revive an old accepted generation.
  const manual = {
    ...definition,
    id: randomUUID(),
    requestId: randomUUID(),
    kind: "check-wbs-revision",
    recipients: [],
  };
  await actions.execute("owner", manual);
  const receipt = await actions.execute("owner", {
    action: "execute",
    id: manual.id,
    repositoryId: "repo",
    requestId: randomUUID(),
    expectedVersion: 1,
    revisionId: fixture.revisionId,
  });
  assert.ok("run" in receipt);
  await actions.execute("owner", {
    ...manual,
    requestId: randomUUID(),
    expectedVersion: 1,
    enabled: false,
  });
  await worker.once(5);
  const blocked = await actions.run("owner", "repo", receipt.run.id);
  assert.equal(blocked?.status, "failed");
  await actions.execute("owner", {
    ...manual,
    requestId: randomUUID(),
    expectedVersion: 2,
    enabled: true,
  });
  failCheck = true;
  const fresh = await actions.execute("owner", {
    action: "execute",
    id: manual.id,
    repositoryId: "repo",
    requestId: randomUUID(),
    expectedVersion: 3,
    revisionId: fixture.revisionId,
  });
  assert.ok("run" in fresh);
  await worker.once(5);
  const failed = await actions.run("owner", "repo", fresh.run.id);
  assert.ok(failed);
  assert.equal(failed.status, "failed");
  failCheck = false;
  await actions.execute("owner", {
    action: "retry",
    id: failed.id,
    repositoryId: "repo",
    requestId: randomUUID(),
    expectedVersion: failed.version,
  });
  await worker.once(5);
  assert.equal((await actions.run("owner", "repo", failed.id))?.status, "succeeded");
  const qualified = await actions.execute("owner", {
    action: "execute",
    id: manual.id,
    repositoryId: "repo",
    requestId: randomUUID(),
    expectedVersion: 3,
    revisionId: fixture.revisionId,
  });
  assert.ok("run" in qualified);
  await pg.query("UPDATE app_private.users SET status='paused' WHERE id='owner'");
  await pg.query("UPDATE app_private.users SET status='active' WHERE id='owner'");
  await worker.once(5);
  assert.equal((await actions.run("owner", "repo", qualified.run.id))?.status, "failed");
  await pg.query(
    "UPDATE app_private.repository_access SET capability='maintain' WHERE principal_id='viewer'",
  );
  const delegated = { ...manual, id: randomUUID(), requestId: randomUUID() };
  await actions.execute("viewer", delegated);
  const revoked = await actions.execute("viewer", {
    action: "execute",
    id: delegated.id,
    repositoryId: "repo",
    requestId: randomUUID(),
    expectedVersion: 1,
    revisionId: fixture.revisionId,
  });
  assert.ok("run" in revoked);
  await pg.query("DELETE FROM app_private.repository_access WHERE principal_id='viewer'");
  await worker.once(5);
  assert.equal((await actions.run("owner", "repo", revoked.run.id))?.status, "failed");
  // Archived repositories fail closed even for an owner and historical management query.
  await pg.query("UPDATE app_private.repositories SET is_archived=true WHERE id='repo'");
  assert.ok((await actions.rules("owner", "repo")).length > 0);
  await assert.rejects(
    actions.execute("owner", { ...manual, requestId: randomUUID(), expectedVersion: 3 }),
  );
  now++;
});
