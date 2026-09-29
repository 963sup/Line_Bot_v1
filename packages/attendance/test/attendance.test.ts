import assert from "node:assert/strict";
import { test } from "node:test";
import { createClockAttendance } from "../src/application/clock.js";
import type { AttendanceDependencies } from "../src/contracts/clock.js";
import {
  attendanceActionForWorking,
  attendanceActionFromOperation,
  attendanceActionLabel,
  attendanceOperation,
} from "../src/domain/value-objects/attendance-action.js";

test("Attendance owns the canonical action, operation and label vocabulary", () => {
  assert.equal(attendanceActionFromOperation("clock-in"), "clockIn");
  assert.equal(attendanceActionFromOperation("clock-out"), "clockOut");
  assert.equal(attendanceActionFromOperation("delete"), null);
  assert.equal(attendanceOperation("clockIn"), "clock-in");
  assert.equal(attendanceOperation("clockOut"), "clock-out");
  assert.equal(attendanceActionLabel("clockIn"), "上班");
  assert.equal(attendanceActionLabel("clockOut"), "下班");
  assert.equal(attendanceActionForWorking(false), "clockIn");
  assert.equal(attendanceActionForWorking(true), "clockOut");
});

test("only canonical commands use verified actor, provider and server time/site; inactive is rejected", async () => {
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
  const api = createClockAttendance(deps);
  const input = {
    requestId: "00000000-0000-4000-8000-000000000001",
    expectedVersion: 0,
    location: { latitude: 25, longitude: 121, accuracy: 5 },
  };
  assert.deepEqual(Object.keys(api).sort(), ["execute", "get", "prepare"]);
  assert.deepEqual(await api.prepare("verified"), {
    memberId: "member",
    version: 0,
    working: false,
    sites: [],
  });
  for (const action of ["clockIn", "clockOut"] as const) {
    await api.execute("verified", action, input);
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
    await assert.rejects(api.execute("verified", action, input), /inactive/);
  await assert.rejects(api.get("verified"), /inactive/);
});
