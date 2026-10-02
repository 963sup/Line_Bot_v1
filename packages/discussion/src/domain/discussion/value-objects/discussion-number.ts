export function normalizeDiscussionNumber(value: unknown): number | null {
  const number = typeof value === "string" && value.trim() ? Number(value) : value;
  return Number.isSafeInteger(number) && Number(number) > 0 ? Number(number) : null;
}
