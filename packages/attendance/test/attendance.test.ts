import assert from "node:assert/strict";
import { test } from "node:test";
import { createClockAttendance } from "../src/application/clock.js";
import type { AttendanceDependencies } from "../src/contracts/clock.js";

test("only two commands use verified actor, provider and server time/site; inactive is rejected", async () => {
  const calls: unknown[][] = [];
  const deps: AttendanceDependencies = {
    activeUser: async (subject) => {
      assert.equal(subject, "verified");
      return { id: "member" };
    },
    provider: () => "line:p",
    now: () => 123,
    store: () => ({
      prepare: async (id, now) => {
        assert.equal(id, "member");
        assert.equal(now, 123);
        return { version: 0, working: false, sites: [] };
      },
      snapshot: async () => ({ attendance: null as never, version: 0, sites: [] }),
      execute: async (...args) => {
        calls.push(args);
        return { attendance: null as never, version: 1, credited: 0, replayed: false, sites: [] };
      },
    }),
  };
  const api = createClockAttendance(deps),
    input = { requestId: "request", expectedVersion: 0, location: {} };
  assert.deepEqual(Object.keys(api).sort(), ["clockIn", "clockOut", "get", "prepare"]);
  assert.deepEqual(await api.prepare("verified"), {
    memberId: "member",
    version: 0,
    working: false,
    sites: [],
  });
  for (const action of ["clockIn", "clockOut"] as const) {
    await api[action]("verified", input);
    assert.deepEqual(calls.at(-1), [
      "member",
      action,
      input,
      123,
      { provider: "line:p", subject: "verified" },
    ]);
  }
  deps.activeUser = async () => {
    throw Error("inactive");
  };
  for (const action of ["clockIn", "clockOut"] as const)
    await assert.rejects(api[action]("verified", input), /inactive/);
  await assert.rejects(api.get("verified"), /inactive/);
});
