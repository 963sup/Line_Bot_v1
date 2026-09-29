export type NotificationKind = "issue" | "discussion" | "system";

export function notificationKind(value: unknown): NotificationKind | null {
  if (value === "issue" || value === "discussion" || value === "system") return value;
  return null;
}
