import { AttendanceError } from "../../domain/error.js";

const requestIdPattern = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

function objectValue(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new AttendanceError(400, "補登資料格式不正確。");
  }
  return raw as Record<string, unknown>;
}

function timestamp(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new AttendanceError(400, `${label}時間不正確。`);
  }
  return value as number;
}

function requestId(value: unknown) {
  if (typeof value !== "string" || !requestIdPattern.test(value)) {
    throw new AttendanceError(400, "補登請求編號不正確。");
  }
  return value;
}

function reason(value: unknown) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 500) {
    throw new AttendanceError(400, "請填寫 1 至 500 字的補登原因。");
  }
  return value.trim();
}

export type AttendanceSupplementSubmission =
  | Readonly<{
      requestId: string;
      kind: "new-session";
      repositoryId: string;
      startedAt: number;
      endedAt: number;
      reason: string;
    }>
  | Readonly<{
      requestId: string;
      kind: "close-session";
      sessionId: string;
      endedAt: number;
      reason: string;
    }>;

export function parseAttendanceSupplementSubmission(raw: unknown): AttendanceSupplementSubmission {
  const value = objectValue(raw);
  if (value.kind === "new-session") {
    if (
      Object.keys(value).some(
        (key) =>
          !["requestId", "kind", "repositoryId", "startedAt", "endedAt", "reason"].includes(key),
      ) ||
      typeof value.repositoryId !== "string" ||
      !value.repositoryId
    ) {
      throw new AttendanceError(400, "補登資料格式不正確。");
    }
    const startedAt = timestamp(value.startedAt, "上班");
    const endedAt = timestamp(value.endedAt, "下班");
    if (startedAt >= endedAt) throw new AttendanceError(400, "下班時間必須晚於上班時間。");
    return {
      requestId: requestId(value.requestId),
      kind: "new-session",
      repositoryId: value.repositoryId,
      startedAt,
      endedAt,
      reason: reason(value.reason),
    };
  }

  if (
    value.kind === "close-session" &&
    Object.keys(value).every((key) =>
      ["requestId", "kind", "sessionId", "endedAt", "reason"].includes(key),
    ) &&
    typeof value.sessionId === "string" &&
    requestIdPattern.test(value.sessionId)
  ) {
    return {
      requestId: requestId(value.requestId),
      kind: "close-session",
      sessionId: value.sessionId,
      endedAt: timestamp(value.endedAt, "下班"),
      reason: reason(value.reason),
    };
  }

  throw new AttendanceError(400, "補登類型不正確。");
}

export type AttendanceSupplementReview = Readonly<{
  commandId: string;
  supplementId: string;
  expectedVersion: number;
  decision: "approve" | "reject";
  reason?: string;
}>;

export function parseAttendanceSupplementReview(raw: unknown): AttendanceSupplementReview {
  const value = objectValue(raw);
  if (
    Object.keys(value).some(
      (key) =>
        !["commandId", "supplementId", "expectedVersion", "decision", "reason"].includes(key),
    ) ||
    typeof value.supplementId !== "string" ||
    !requestIdPattern.test(value.supplementId) ||
    typeof value.expectedVersion !== "number" ||
    !Number.isSafeInteger(value.expectedVersion) ||
    (value.expectedVersion as number) < 0 ||
    (value.decision !== "approve" && value.decision !== "reject")
  ) {
    throw new AttendanceError(400, "審核資料格式不正確。");
  }
  const reviewReason = value.reason === undefined ? undefined : reason(value.reason);
  if (value.decision === "reject" && !reviewReason) {
    throw new AttendanceError(400, "拒絕補登時請填寫原因。");
  }
  return {
    commandId: requestId(value.commandId),
    supplementId: value.supplementId,
    expectedVersion: value.expectedVersion as number,
    decision: value.decision,
    ...(reviewReason ? { reason: reviewReason } : {}),
  };
}
