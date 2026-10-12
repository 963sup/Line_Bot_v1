/** Neutral runtime value checks. Business contracts and error projection stay with the caller. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new TypeError("Expected an object");
  return value;
}

export function stringValue(value: unknown): string {
  if (typeof value !== "string") throw new TypeError("Expected a string");
  return value;
}

export function nullableString(value: unknown): string | null {
  return value === null ? null : stringValue(value);
}

export function booleanValue(value: unknown): boolean {
  if (typeof value !== "boolean") throw new TypeError("Expected a boolean");
  return value;
}

export function numberValue(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new TypeError("Expected a finite number");
  return value;
}

/** PostgreSQL numeric/int8 projections may be represented as a number or a decimal string. */
export function numericValue(value: unknown): number | string {
  if (
    (typeof value !== "number" && typeof value !== "string") ||
    (typeof value === "string" && !value.trim()) ||
    !Number.isFinite(Number(value))
  )
    throw new TypeError("Expected a numeric value");
  return value;
}

export function nullableNumericValue(value: unknown): number | string | null {
  return value === null ? null : numericValue(value);
}

export function literalValue<const T extends string | number | boolean>(
  value: unknown,
  allowed: readonly T[],
): T {
  const found = allowed.find((candidate) => candidate === value);
  if (found === undefined) throw new TypeError("Expected an allowed value");
  return found;
}

export function stringArray(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every((item: unknown) => typeof item === "string"))
    throw new TypeError("Expected a string array");
  return value;
}
