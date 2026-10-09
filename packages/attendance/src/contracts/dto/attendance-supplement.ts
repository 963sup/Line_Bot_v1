import { AttendanceError } from "../../domain/error.js";
import type { AttendancePoint } from "../clock.js";
import type {
  AttendanceSupplement,
  AttendanceSupplementInbox,
  AttendanceSupplementReceipt,
} from "../supplements.js";

type ObjectValue = Record<string, unknown>;

function objectValue(value: unknown): ObjectValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AttendanceError(502, "補登回應格式不完整，請重新整理。");
  }
  return value as ObjectValue;
}

function integer(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function parseSite(value: unknown): AttendancePoint {
  const site = objectValue(value);
  if (
    typeof site.id !== "string" ||
    typeof site.repositoryId !== "string" ||
    typeof site.name !== "string" ||
    typeof site.address !== "string" ||
    typeof site.latitude !== "number" ||
    !Number.isFinite(site.latitude) ||
    typeof site.longitude !== "number" ||
    !Number.isFinite(site.longitude) ||
    typeof site.radius !== "number" ||
    !Number.isFinite(site.radius) ||
    site.radius <= 0 ||
    !integer(site.version)
  ) {
    throw new AttendanceError(502, "補登地點回應不完整，請重新整理。");
  }
  return {
    id: site.id,
    repositoryId: site.repositoryId,
    name: site.name,
    address: site.address,
    latitude: site.latitude,
    longitude: site.longitude,
    radius: site.radius,
    version: site.version,
  };
}

export function parseAttendanceSupplement(value: unknown): AttendanceSupplement {
  const row = objectValue(value);
  if (
    typeof row.id !== "string" ||
    typeof row.userId !== "string" ||
    typeof row.repositoryId !== "string" ||
    (row.kind !== "new-session" && row.kind !== "close-session") ||
    !(row.sessionId === null || typeof row.sessionId === "string") ||
    !(row.startedAt === null || integer(row.startedAt)) ||
    !integer(row.endedAt) ||
    !row.site ||
    typeof row.site !== "object" ||
    typeof row.reason !== "string" ||
    !integer(row.submittedAt) ||
    (row.status !== "PENDING" && row.status !== "APPROVED" && row.status !== "REJECTED") ||
    !integer(row.version) ||
    !(row.reviewerId === null || typeof row.reviewerId === "string") ||
    !(row.reviewedAt === null || integer(row.reviewedAt)) ||
    !(row.reviewReason === null || typeof row.reviewReason === "string")
  ) {
    throw new AttendanceError(502, "補登回應欄位不完整，請重新整理。");
  }
  const site = parseSite(row.site);
  return {
    id: row.id,
    userId: row.userId,
    repositoryId: row.repositoryId,
    kind: row.kind,
    sessionId: row.sessionId as string | null,
    startedAt: row.startedAt as number | null,
    endedAt: row.endedAt,
    site,
    reason: row.reason,
    submittedAt: row.submittedAt,
    status: row.status,
    version: row.version,
    reviewerId: row.reviewerId as string | null,
    reviewedAt: row.reviewedAt as number | null,
    reviewReason: row.reviewReason as string | null,
  };
}

export function parseAttendanceSupplementInbox(value: unknown): AttendanceSupplementInbox {
  const inbox = objectValue(value);
  if (!Array.isArray(inbox.mine) || !Array.isArray(inbox.review)) {
    throw new AttendanceError(502, "補登清單回應不完整，請重新整理。");
  }
  return {
    mine: inbox.mine.map(parseAttendanceSupplement),
    review: inbox.review.map(parseAttendanceSupplement),
  };
}

export function parseAttendanceSupplementReceipt(value: unknown): AttendanceSupplementReceipt {
  const receipt = objectValue(value);
  if (typeof receipt.replayed !== "boolean") {
    throw new AttendanceError(502, "補登操作回應不完整，請重新確認。");
  }
  return {
    supplement: parseAttendanceSupplement(receipt.supplement),
    replayed: receipt.replayed,
  };
}
