export function normalizeIssueNumber(value: number | string): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(number) && number >= 1 ? number : null;
}
