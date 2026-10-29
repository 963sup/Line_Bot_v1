import { isRecord } from "@line_bot_v1/platform/validation";

export function responseError(value: unknown, fallback: string) {
  if (isRecord(value) && typeof value.error === "string") return value.error;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
