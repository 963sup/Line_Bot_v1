import assert from "node:assert/strict";
import { test } from "node:test";
import { createAttendanceMaintenance } from "../src/application/maintenance.js";
import type {
  AttendanceMenuJob,
  AttendanceNotificationJob,
} from "../src/application/ports/clock.js";

test("notification delivery remains independent of menu failure, with durable retry result", async () => {
  let index = 0,
    notices = 0;
  const completed: unknown[] = [];
  const jobs: AttendanceMenuJob[] = [
    { uid: "a", subject: "u1", state: "ready", revision: 1, token: "a" },
    { uid: "b", subject: "u2", state: "working", revision: 1, token: "b" },
  ];
  const notice: AttendanceNotificationJob = {
    id: "one",
    uid: "a",
    subject: "u1",
    token: "lease",
    payload: null as never,
  };
  const run = createAttendanceMaintenance({
    now: () => 100,
    provider: () => "line:p",
    store: () => ({
      claimMenu: async () => jobs[index++] ?? null,
      completeMenu: async (job, success) => {
        completed.push([job.uid, success]);
        return success;
      },
      claimNotification: async () => (notices++ === 0 ? notice : null),
      completeNotification: async (job, outcome) => {
        completed.push([job.id, outcome]);
        return outcome === "accepted";
      },
    }),
    link: async (subject) => {
      if (subject === "u1") throw Error("offline");
    },
    notify: async () => "accepted",
  });
  assert.deepEqual(await run(), { synced: 1, notified: 1, failed: 1 });
  assert.ok(completed.some((c) => JSON.stringify(c) === '["a",false]'));
});

test("menu-only maintenance does not claim or deliver notifications", async () => {
  let notificationClaims = 0;
  const run = createAttendanceMaintenance({
    now: () => 100,
    provider: () => "line:p",
    store: () => ({
      claimMenu: async () => ({ uid: "a", subject: "u1", state: "ready", revision: 1, token: "a" }),
      completeMenu: async () => true,
      claimNotification: async () => {
        notificationClaims++;
        return null;
      },
      completeNotification: async () => true,
    }),
    link: async () => {},
    notify: async () => "accepted",
  });
  assert.deepEqual(await run("u1", false), { synced: 1, notified: 0, failed: 0 });
  assert.equal(notificationClaims, 0);
});
