import { isRecord } from "@line_bot_v1/platform/validation";
import type {
  RepositoryAddressCommand,
  RepositoryAddressReceipt,
  RepositoryAddressSnapshot,
} from "./repositories/address.js";

export function isAddress(
  value: unknown,
): value is NonNullable<RepositoryAddressReceipt["address"]> {
  return (
    isRecord(value) &&
    (value.address === null || typeof value.address === "string") &&
    typeof value.latitude === "number" &&
    Number.isFinite(value.latitude) &&
    typeof value.longitude === "number" &&
    Number.isFinite(value.longitude) &&
    typeof value.radius === "number" &&
    Number.isFinite(value.radius)
  );
}

export function isAddressCommand(value: unknown): value is RepositoryAddressCommand {
  return (
    isRecord(value) &&
    typeof value.requestId === "string" &&
    typeof value.repositoryId === "string" &&
    Number.isSafeInteger(value.expectedVersion) &&
    (value.action === "remove" || (value.action === "set" && isAddress(value.address)))
  );
}

export function isAddressSnapshot(value: unknown): value is RepositoryAddressSnapshot {
  return (
    isRecord(value) &&
    isRecord(value.repository) &&
    typeof value.repository.id === "string" &&
    typeof value.repository.actorUserId === "string" &&
    typeof value.repository.ownerLogin === "string" &&
    typeof value.repository.name === "string" &&
    Number.isSafeInteger(value.repository.version) &&
    typeof value.repository.actorIsOwner === "boolean" &&
    Array.isArray(value.repository.actorPermissions) &&
    value.repository.actorPermissions.every(
      (permission) =>
        permission === "read" ||
        permission === "triage" ||
        permission === "triage_plus" ||
        permission === "write" ||
        permission === "maintain" ||
        permission === "admin",
    ) &&
    (value.address === null || isAddress(value.address))
  );
}
