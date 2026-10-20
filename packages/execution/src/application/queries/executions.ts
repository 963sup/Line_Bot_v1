import { ExecutionError } from "../../domain/error.js";

const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export function executionId(value: unknown) {
  if (typeof value !== "string" || !UUID.test(value))
    throw new ExecutionError(400, "Invalid Execution identifier.", "INVALID_INPUT");
  return value.toLowerCase();
}
export function repositoryId(value: unknown) {
  if (typeof value !== "string" || !value || value.length > 128)
    throw new ExecutionError(400, "Invalid Repository scope.", "INVALID_INPUT");
  return value;
}
export function historyCursor(value: unknown) {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > 2147483647)
    throw new ExecutionError(400, "Invalid Execution history cursor.", "INVALID_INPUT");
  return value;
}
