import { isRecord } from "@line_bot_v1/platform/validation";

export function errorMessage(value: unknown, fallback: string) {
  if (isRecord(value) && typeof value.error === "string") return value.error;
  if (typeof value === "string") return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}

export function errorStatus(value: unknown) {
  return isRecord(value) && typeof value.status === "number" && Number.isFinite(value.status)
    ? value.status
    : undefined;
}
