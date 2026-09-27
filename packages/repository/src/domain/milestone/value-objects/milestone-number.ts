export function normalizeRepositoryMilestoneNumber(value: number | string): number | null {
  if (typeof value === "string" && !/^[1-9]\d*$/.test(value)) return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(number) && number >= 1 ? number : null;
}
