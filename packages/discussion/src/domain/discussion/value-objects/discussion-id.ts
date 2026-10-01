export function normalizeDiscussionId(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= 120 ? value : null;
}
