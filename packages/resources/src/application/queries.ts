import { ObjectError } from "../domain/error.js";

const uuidPattern = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export function objectId(value: string) {
  if (!uuidPattern.test(value)) throw new ObjectError(400, "Object ID 不正確。", "INVALID_INPUT");
  return value.toLowerCase();
}
export function repositoryId(value: string) {
  if (!value || value !== value.trim() || value.length > 128)
    throw new ObjectError(400, "Repository ID 不正確。", "INVALID_INPUT");
  return value;
}
export function historyCursor(value: string): number;
export function historyCursor(value: undefined): undefined;
export function historyCursor(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 2_147_483_647)
    throw new ObjectError(400, "History cursor 不正確。", "INVALID_INPUT");
  return parsed;
}
export function optionalIdCursor(value: string): string;
export function optionalIdCursor(value: undefined): undefined;
export function optionalIdCursor(value: string | undefined): string | undefined {
  return value === undefined ? undefined : objectId(value);
}
