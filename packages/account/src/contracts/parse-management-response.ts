import { isRecord } from "@line_bot_v1/platform/validation";
import type { UserManagementView } from "./user-management.js";

function readManagedUser(value: unknown): UserManagementView["users"][number] {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    (value.status !== "active" && value.status !== "paused" && value.status !== "suspended") ||
    typeof value.createdAt !== "number" ||
    typeof value.version !== "number" ||
    typeof value.googleLinked !== "boolean" ||
    (value.restoreStatus !== "active" && value.restoreStatus !== "paused")
  )
    throw new Error("會員資料回應格式不完整。");
  return {
    id: value.id,
    status: value.status,
    createdAt: value.createdAt,
    version: value.version,
    googleLinked: value.googleLinked,
    restoreStatus: value.restoreStatus,
  };
}

export function readManagementView(value: unknown): UserManagementView {
  if (
    !isRecord(value) ||
    typeof value.actorId !== "string" ||
    typeof value.canSuspend !== "boolean" ||
    !Array.isArray(value.users) ||
    (value.next !== null && typeof value.next !== "string")
  )
    throw new Error("會員資料回應格式不完整。");
  let detail: UserManagementView["detail"] = null;
  if (value.detail !== null) {
    if (!isRecord(value.detail)) throw new Error("會員資料回應格式不完整。");
    const current = value.detail;
    if (
      !Array.isArray(current.events) ||
      !Array.isArray(current.operations) ||
      !Array.isArray(current.openAttendance) ||
      !current.openAttendance.every((item) => typeof item === "string") ||
      !Array.isArray(current.unfinishedIssues) ||
      !current.unfinishedIssues.every((item) => typeof item === "string") ||
      typeof current.unfinishedIssueCount !== "number" ||
      typeof current.moreEvents !== "boolean" ||
      typeof current.moreOperations !== "boolean"
    )
      throw new Error("會員資料回應格式不完整。");
    const events = current.events.map((event) => {
      if (!isRecord(event) || typeof event.type !== "string" || typeof event.at !== "number")
        throw new Error("會員資料回應格式不完整。");
      return { type: event.type, at: event.at };
    });
    const operations = current.operations.map((operation) => {
      if (
        !isRecord(operation) ||
        typeof operation.actor !== "string" ||
        typeof operation.action !== "string" ||
        typeof operation.reason !== "string" ||
        typeof operation.status !== "string" ||
        typeof operation.version !== "number" ||
        typeof operation.at !== "number"
      )
        throw new Error("會員資料回應格式不完整。");
      return {
        actor: operation.actor,
        action: operation.action,
        reason: operation.reason,
        status: operation.status,
        version: operation.version,
        at: operation.at,
      };
    });
    detail = {
      user: readManagedUser(current.user),
      events,
      moreEvents: current.moreEvents,
      operations,
      moreOperations: current.moreOperations,
      openAttendance: current.openAttendance,
      unfinishedIssues: current.unfinishedIssues,
      unfinishedIssueCount: current.unfinishedIssueCount,
    };
  }
  return {
    actorId: value.actorId,
    canSuspend: value.canSuspend,
    users: value.users.map(readManagedUser),
    next: value.next,
    detail,
  };
}
