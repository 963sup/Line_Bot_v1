import { isRecord } from "@line_bot_v1/platform/validation";

export function errorMessage(value: unknown, fallback: string) {
  return isRecord(value) && typeof value.error === "string" ? value.error : fallback;
}

export function errorStatus(value: unknown) {
  return isRecord(value) && typeof value.status === "number" && Number.isFinite(value.status)
    ? value.status
    : undefined;
}
