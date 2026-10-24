import { ContentError } from "./error.js";

export type QuantityUnit = string;

/** User-defined Content measure labels have no implicit conversion or inferred dimension. */
export function isQuantityUnit(value: unknown): value is QuantityUnit {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 32 &&
    value === value.trim() &&
    !/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(value)
  );
}

export function normalizeQuantityUnit(value: unknown): QuantityUnit {
  const unit = typeof value === "string" ? value.trim() : value;
  if (!isQuantityUnit(unit))
    throw new ContentError(400, "Invalid Content measure unit.", "INVALID_INPUT");
  return unit;
}

export function quantityUnits(value: string): bigint {
  if (!/^(0|[1-9][0-9]{0,14})(\.[0-9]{1,3})?$/.test(value))
    throw new ContentError(400, "Invalid planned quantity.", "INVALID_INPUT");
  const [whole = "0", fraction = ""] = value.split(".");
  return BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, "0"));
}

function quantityValue(units: bigint): string {
  const fraction = (units % 1000n).toString().padStart(3, "0").replace(/0+$/, "");
  return `${units / 1000n}${fraction ? `.${fraction}` : ""}`;
}

export function normalizeQuantity(value: string, unit: QuantityUnit): string {
  const measureUnit = normalizeQuantityUnit(unit);
  const units = quantityUnits(value);
  if (measureUnit === "pcs" && value.includes("."))
    throw new ContentError(400, "pcs planned quantity must be an integer.", "INVALID_INPUT");
  return quantityValue(units);
}
