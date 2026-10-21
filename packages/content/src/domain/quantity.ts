import { ContentError } from "./error.js";

export type QuantityUnit = "m" | "pcs";

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
  const units = quantityUnits(value);
  if (unit === "pcs" && value.includes("."))
    throw new ContentError(400, "pcs planned quantity must be an integer.", "INVALID_INPUT");
  return quantityValue(units);
}
