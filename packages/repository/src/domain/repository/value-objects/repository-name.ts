export function normalizeRepositoryName(value: string): string | null {
  const name = value.trim();
  return name && name.length <= 100 ? name : null;
}
