import { ContractError } from "./error.js";

export function decimalParts(value: string): { coefficient: bigint; scale: number } {
  if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value))
    throw new ContractError(400, "Invalid exact decimal value.", "INVALID_INPUT");
  const negative = value.startsWith("-");
  const digits = value.replace(/^-/, "").split(".");
  const fraction = digits[1] ?? "";
  const coefficient = BigInt(`${digits[0]}${fraction}`) * (negative ? -1n : 1n);
  return { coefficient, scale: fraction.length };
}

export function addExactDecimals(values: readonly string[]): string {
  const parsed = values.map(decimalParts);
  const scale = parsed.reduce((current, item) => Math.max(current, item.scale), 0);
  const sum = parsed.reduce(
    (total, item) => total + item.coefficient * 10n ** BigInt(scale - item.scale),
    0n,
  );
  const negative = sum < 0n;
  const digits = (negative ? -sum : sum).toString().padStart(scale + 1, "0");
  if (!scale) return `${negative ? "-" : ""}${digits}`;
  const whole = digits.slice(0, -scale);
  const fraction = digits.slice(-scale).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

export function equalExactDecimals(left: string, right: string): boolean {
  const first = decimalParts(left);
  const second = decimalParts(right);
  const scale = Math.max(first.scale, second.scale);
  return (
    first.coefficient * 10n ** BigInt(scale - first.scale) ===
    second.coefficient * 10n ** BigInt(scale - second.scale)
  );
}

export function multiplyExactDecimals(left: string, right: string): string {
  const first = decimalParts(left);
  const second = decimalParts(right);
  const scale = first.scale + second.scale;
  const product = first.coefficient * second.coefficient;
  const negative = product < 0n;
  const digits = (negative ? -product : product).toString().padStart(scale + 1, "0");
  if (!scale) return `${negative ? "-" : ""}${digits}`;
  const whole = digits.slice(0, -scale);
  const fraction = digits.slice(-scale).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}
