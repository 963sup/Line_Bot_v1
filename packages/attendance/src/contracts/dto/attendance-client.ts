import {
  ATTENDANCE_RULE_VERSION,
  type AttendanceSession,
} from "../../domain/aggregates/attendance-session.js";
import { AttendanceError } from "../../domain/error.js";
import type {
  AttendanceRecordView,
  AttendanceView,
  MenuState,
} from "../../domain/policies/attendance-view.js";
import {
  type AttendanceAction,
  type AttendanceOperation,
  attendanceActionForWorking,
  attendanceOperation,
} from "../../domain/value-objects/attendance-action.js";
import type {
  AttendanceDay,
  AttendanceSummary,
} from "../../domain/value-objects/attendance-summary.js";
import type { AttendancePoint, AttendanceResult, AttendanceSnapshot } from "../clock.js";

type ObjectValue = Record<string, unknown>;

function objectValue(value: unknown): ObjectValue {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new AttendanceError(502, "出勤回應不完整，請重新整理。");
  return value as ObjectValue;
}

function finite(value: unknown) {
  return typeof value === "number" && Number.isFinite(value);
}

function nonNegative(value: unknown) {
  return finite(value) && (value as number) >= 0;
}

function safeVersion(value: unknown) {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function parsePoint(value: unknown): AttendancePoint {
  const point = objectValue(value);
  if (
    typeof point.id !== "string" ||
    !(point.repositoryId === null || typeof point.repositoryId === "string") ||
    typeof point.name !== "string" ||
    typeof point.address !== "string" ||
    !finite(point.latitude) ||
    !finite(point.longitude) ||
    !nonNegative(point.radius) ||
    (point.radius as number) <= 0 ||
    !safeVersion(point.version)
  )
    throw new AttendanceError(502, "出勤地點回應不完整，請重新整理。");
  return {
    id: point.id,
    repositoryId: point.repositoryId as string | null,
    name: point.name,
    address: point.address,
    latitude: point.latitude as number,
    longitude: point.longitude as number,
    radius: point.radius as number,
    version: point.version as number,
  };
}

function parseDay(value: unknown): AttendanceDay {
  const day = objectValue(value);
  if (
    typeof day.day !== "string" ||
    !nonNegative(day.beforeMs) ||
    !nonNegative(day.scheduledMs) ||
    !nonNegative(day.afterMs) ||
    !nonNegative(day.elapsedMs)
  )
    throw new AttendanceError(502, "出勤每日明細不完整，請重新整理。");
  return {
    day: day.day,
    beforeMs: day.beforeMs as number,
    scheduledMs: day.scheduledMs as number,
    afterMs: day.afterMs as number,
    elapsedMs: day.elapsedMs as number,
  };
}

function parseSummary(value: unknown): AttendanceSummary {
  const summary = objectValue(value);
  if (
    !nonNegative(summary.elapsedMs) ||
    !nonNegative(summary.beforeMs) ||
    !nonNegative(summary.scheduledMs) ||
    !nonNegative(summary.afterMs) ||
    typeof summary.crossesMidnight !== "boolean" ||
    typeof summary.provisional !== "boolean" ||
    !Array.isArray(summary.days)
  )
    throw new AttendanceError(502, "出勤分類回應不完整，請重新整理。");
  return {
    elapsedMs: summary.elapsedMs as number,
    beforeMs: summary.beforeMs as number,
    scheduledMs: summary.scheduledMs as number,
    afterMs: summary.afterMs as number,
    crossesMidnight: summary.crossesMidnight,
    provisional: summary.provisional,
    days: summary.days.map(parseDay),
  };
}

function parseSession(value: unknown): AttendanceSession {
  const session = objectValue(value);
  if (
    typeof session.id !== "string" ||
    typeof session.day !== "string" ||
    !finite(session.startedAt) ||
    !(session.endedAt === null || finite(session.endedAt)) ||
    session.ruleVersion !== ATTENDANCE_RULE_VERSION
  )
    throw new AttendanceError(502, "出勤紀錄回應不完整，請重新整理。");
  return {
    id: session.id,
    day: session.day,
    startedAt: session.startedAt as number,
    endedAt: session.endedAt as number | null,
    ruleVersion: ATTENDANCE_RULE_VERSION,
  };
}

function parseRecord(value: unknown): AttendanceRecordView {
  const record = objectValue(value);
  return { ...parseSession(record), summary: parseSummary(record.summary) };
}

function parseView(value: unknown): AttendanceView {
  const view = objectValue(value);
  if (
    !Array.isArray(view.records) ||
    !(view.active === null || (view.active && typeof view.active === "object")) ||
    (view.menuState !== "ready" && view.menuState !== "working") ||
    !finite(view.computedAt)
  )
    throw new AttendanceError(502, "出勤狀態回應不完整，請重新整理。");
  const records = view.records.map(parseRecord);
  const active = view.active === null ? null : parseSession(view.active);
  if (
    (active === null && view.menuState !== "ready") ||
    (active !== null && view.menuState !== "working") ||
    (active !== null &&
      !records.some((record) => record.id === active.id && record.endedAt === null))
  )
    throw new AttendanceError(502, "出勤狀態與紀錄不一致，請重新整理。");
  return {
    records,
    active,
    menuState: view.menuState as MenuState,
    computedAt: view.computedAt as number,
  };
}

export function parseAttendanceSnapshot(value: unknown): AttendanceSnapshot {
  const snapshot = objectValue(value);
  if (!safeVersion(snapshot.version) || !Array.isArray(snapshot.sites))
    throw new AttendanceError(502, "出勤快照回應不完整，請重新整理。");
  return {
    attendance: parseView(snapshot.attendance),
    version: snapshot.version as number,
    sites: snapshot.sites.map(parsePoint),
  };
}

export function parseAttendanceResult(value: unknown): AttendanceResult {
  const result = objectValue(value);
  const snapshot = parseAttendanceSnapshot(result);
  if (!finite(result.credited) || typeof result.replayed !== "boolean")
    throw new AttendanceError(502, "出勤操作回應不完整，請重新整理。");
  return {
    ...snapshot,
    credited: result.credited as number,
    replayed: result.replayed,
  };
}

export type AttendanceClockPreparation = {
  memberId: string;
  working: boolean;
  action: AttendanceAction;
  operation: AttendanceOperation;
  version: number;
  sites: AttendancePoint[];
};

export function parseAttendanceClockPreparation(value: unknown): AttendanceClockPreparation {
  const preparation = objectValue(value);
  if (
    typeof preparation.memberId !== "string" ||
    !preparation.memberId ||
    typeof preparation.working !== "boolean" ||
    !safeVersion(preparation.version) ||
    !Array.isArray(preparation.sites)
  )
    throw new AttendanceError(502, "出勤準備回應不完整，請重試。");
  const action = attendanceActionForWorking(preparation.working);
  return {
    memberId: preparation.memberId,
    working: preparation.working,
    action,
    operation: attendanceOperation(action),
    version: preparation.version as number,
    sites: preparation.sites.map(parsePoint),
  };
}

export type AttendanceClockReceipt = {
  version: number;
  at: number;
  credited: number;
  replayed: boolean;
};

export function attendanceClockReceipt(result: AttendanceResult): AttendanceClockReceipt {
  const record = result.attendance.active ?? result.attendance.records.at(-1);
  const at = record?.endedAt ?? record?.startedAt;
  if (!finite(at)) throw new AttendanceError(500, "出勤回執不完整，請重新讀取出勤狀態。");
  return {
    version: result.version,
    at: at as number,
    credited: result.credited,
    replayed: result.replayed,
  };
}

export function parseAttendanceClockReceipt(value: unknown): AttendanceClockReceipt {
  const receipt = objectValue(value);
  if (
    !safeVersion(receipt.version) ||
    !finite(receipt.at) ||
    !finite(receipt.credited) ||
    typeof receipt.replayed !== "boolean"
  )
    throw new AttendanceError(502, "出勤回執不完整，請重試同一筆。");
  return {
    version: receipt.version as number,
    at: receipt.at as number,
    credited: receipt.credited as number,
    replayed: receipt.replayed,
  };
}
