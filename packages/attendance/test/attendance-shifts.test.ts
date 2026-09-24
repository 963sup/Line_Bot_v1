import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ATTENDANCE_RULE_VERSION,
  type AttendanceSession,
  attendanceView,
  planAttendance,
  summarizeAttendance,
  taipeiDay,
} from "../src/domain.js";

const at = (v: string) => Date.parse(v);
const session = (start: string, end: string | null): AttendanceSession => ({
  id: "one",
  day: taipeiDay(at(start)),
  startedAt: at(start),
  endedAt: end === null ? null : at(end),
  ruleVersion: ATTENDANCE_RULE_VERSION,
});
const hour = 3600000;
test("two commands accept all times, repeat sessions, and never auto-transition", () => {
  const r = session("2026-09-07T06:30:00+08:00", null);
  assert.equal(planAttendance([], "clockIn", r.startedAt).start?.startedAt, r.startedAt);
  for (const t of [
    "2026-09-07T08:00:00+08:00",
    "2026-09-07T17:00:00+08:00",
    "2026-09-08T01:00:00+08:00",
  ]) {
    const view = attendanceView([r], at(t));
    assert.equal(view.active?.startedAt, r.startedAt);
    assert.equal(view.records.length, 1);
    assert.equal(view.menuState, "working");
  }
  const end = at("2026-09-08T01:00:00+08:00");
  assert.equal(planAttendance([r], "clockOut", end).end?.endedAt, end);
  assert.ok(planAttendance([{ ...r, endedAt: end }], "clockIn", end).start);
});
test("daily partition covers exact boundaries, fractions and midnight without subtracting breaks", () => {
  const r = session("2026-09-07T06:30:00+08:00", "2026-09-08T01:00:00+08:00");
  const sum = summarizeAttendance(r, r.endedAt!);
  assert.equal(sum.elapsedMs, 18.5 * hour);
  assert.equal(sum.beforeMs, 2.5 * hour);
  assert.equal(sum.scheduledMs, 9 * hour);
  assert.equal(sum.afterMs, 7 * hour);
  assert.equal(sum.crossesMidnight, true);
  assert.equal(sum.days.length, 2);
  assert.equal(sum.beforeMs + sum.scheduledMs + sum.afterMs, sum.elapsedMs);
  for (const [start, end, expected] of [
    ["2026-09-07T08:00:00+08:00", "2026-09-07T17:00:00+08:00", 9 * hour],
    ["2026-09-07T07:59:59.500+08:00", "2026-09-07T08:00:00.500+08:00", 1000],
    ["2026-09-07T23:59:59.500+08:00", "2026-09-08T00:00:00.500+08:00", 1000],
    ["2026-09-07T08:00:00+08:00", "2026-09-07T08:00:00+08:00", 0],
  ] as const) {
    const s = summarizeAttendance(session(start, end), at(end));
    assert.equal(s.elapsedMs, expected);
    assert.equal(s.beforeMs + s.scheduledMs + s.afterMs, expected);
  }
});
test("long sessions split every day and preserve exact totals", () => {
  const r = session("2026-09-01T22:00:00+08:00", "2026-09-07T03:00:00+08:00");
  const s = summarizeAttendance(r, r.endedAt!);
  assert.equal(s.days.length, 7);
  assert.equal(
    s.days.reduce((n, d) => n + d.elapsedMs, 0),
    r.endedAt! - r.startedAt,
  );
  assert.equal(s.beforeMs + s.scheduledMs + s.afterMs, s.elapsedMs);
});
test("reject missing start, double start, overlap, reversed clock, invalid and unknown rule", () => {
  const r = session("2026-09-07T08:00:00+08:00", null);
  assert.throws(() => planAttendance([], "clockOut", r.startedAt), /尚未上班/);
  assert.throws(() => planAttendance([r], "clockIn", r.startedAt), /已經上班/);
  assert.throws(() => planAttendance([r], "clockOut", r.startedAt - 1), /早於/);
  assert.throws(() => attendanceView([r, { ...r, id: "two" }], r.startedAt), /重疊/);
  assert.throws(
    () => planAttendance([{ ...r, endedAt: r.startedAt + 100 }], "clockIn", r.startedAt + 50),
    /重疊/,
  );
  assert.throws(() => taipeiDay(NaN), /時間/);
  assert.throws(
    () => summarizeAttendance({ ...r, ruleVersion: "unknown" as never }, r.startedAt),
    /規則/,
  );
});
