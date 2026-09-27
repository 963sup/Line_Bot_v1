export function normalizeRepositoryStarListDescription(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const description = value.trim();
  return description.length <= 500 ? description : null;
}
