import { attendanceActionLabel } from "../../domain/value-objects/attendance-action.js";
import type { AttendanceNotification } from "../clock.js";

export function attendanceTime(value: number) {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(value);
}

export function attendanceDuration(ms: number) {
  const minutes = Math.floor(ms / 60000);
  return `${Math.floor(minutes / 60)} 小時 ${minutes % 60} 分`;
}

/** Stable Attendance receipt projection used by retryable delivery adapters. */
export function attendanceNotificationText({ action, record }: AttendanceNotification) {
  const label = attendanceActionLabel(action);
  if (action === "clockIn")
    return `${label}已記錄\n${attendanceTime(record.startedAt)}\n結束工作時按「下班」，其餘時段自動計算。`;
  const summary = record.summary;
  return [
    `${label}已記錄`,
    `上班：${attendanceTime(record.startedAt)}`,
    `下班：${attendanceTime(record.endedAt!)}`,
    `記錄經過：${attendanceDuration(summary.elapsedMs)}${summary.crossesMidnight ? "（跨日）" : ""}`,
    `08:00 前：${attendanceDuration(summary.beforeMs)}`,
    `08:00–17:00：${attendanceDuration(summary.scheduledMs)}`,
    `17:00 後：${attendanceDuration(summary.afterMs)}`,
    "未自動扣除休息；時段分類不等於法定加班或薪資工時。",
  ].join("\n");
}
