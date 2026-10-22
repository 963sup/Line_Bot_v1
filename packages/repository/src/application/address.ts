import { RepositoryError } from "../contracts/errors/repository-error.js";
import type {
  RepositoryAddressCommand,
  RepositoryAddressStore,
} from "../contracts/repositories/address.js";
import type { RepositorySelector } from "../contracts/selectors.js";
import { normalizeRepositoryName } from "../domain/repository/value-objects/repository-name.js";
import { accountLoginForRepositoryLocator } from "./owner-locator.js";

const requestIdPattern = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const identifierPattern = /^[\w-]{1,128}$/;

function repositorySelector(value: RepositorySelector): RepositorySelector {
  if ("repositoryId" in value) {
    if (!identifierPattern.test(value.repositoryId)) {
      throw new RepositoryError(400, "Repository 識別碼不正確。");
    }
    return value;
  }
  const ownerLogin = accountLoginForRepositoryLocator(value.ownerLogin);
  const repositoryName = normalizeRepositoryName(value.repositoryName);
  if (!ownerLogin || !repositoryName) {
    throw new RepositoryError(400, "Repository 路徑不正確。");
  }
  return { ownerLogin, repositoryName };
}

function finiteNumber(value: unknown, minimum: number, maximum: number): value is number {
  return (
    typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum
  );
}

function parseCommand(raw: unknown): RepositoryAddressCommand {
  if (!isRecord(raw)) {
    throw new RepositoryError(400, "Repository 地址操作格式不正確。");
  }
  const value = raw;
  if (value.action !== "set" && value.action !== "remove") {
    throw new RepositoryError(400, "Repository 地址動作不正確。");
  }
  const allowed =
    value.action === "set"
      ? ["action", "requestId", "repositoryId", "expectedVersion", "address"]
      : ["action", "requestId", "repositoryId", "expectedVersion"];
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new RepositoryError(400, "Repository 地址操作包含不支援的欄位。");
  }
  if (typeof value.requestId !== "string" || !requestIdPattern.test(value.requestId)) {
    throw new RepositoryError(400, "Repository 地址請求編號不正確。");
  }
  if (typeof value.repositoryId !== "string" || !identifierPattern.test(value.repositoryId)) {
    throw new RepositoryError(400, "Repository 識別碼不正確。");
  }
  if (
    typeof value.expectedVersion !== "number" ||
    !Number.isSafeInteger(value.expectedVersion) ||
    value.expectedVersion < 1
  ) {
    throw new RepositoryError(400, "Repository 版本不正確。");
  }
  const base = {
    requestId: value.requestId.toLowerCase(),
    repositoryId: value.repositoryId,
    expectedVersion: value.expectedVersion,
  } as const;
  if (value.action === "remove") return { ...base, action: "remove" };
  if (!isRecord(value.address)) {
    throw new RepositoryError(400, "Repository 地址不正確。");
  }
  const address = value.address;
  if (
    Object.keys(address).some(
      (key) => !["address", "latitude", "longitude", "radius"].includes(key),
    ) ||
    !(
      address.address === null ||
      (typeof address.address === "string" &&
        address.address === address.address.trim() &&
        address.address.length >= 1 &&
        address.address.length <= 500)
    ) ||
    !finiteNumber(address.latitude, -90, 90) ||
    !finiteNumber(address.longitude, -180, 180) ||
    !finiteNumber(address.radius, Number.MIN_VALUE, 10_000)
  ) {
    throw new RepositoryError(400, "Repository 地址不正確。");
  }
  return {
    ...base,
    action: "set",
    address: {
      address: address.address,
      latitude: address.latitude,
      longitude: address.longitude,
      radius: address.radius,
    },
  };
}

export function createRepositoryAddress(deps: {
  activeUser(subject: string): Promise<{ id: string }>;
  store(): RepositoryAddressStore;
  now(): number;
}) {
  return {
    async view(subject: string, selector: RepositorySelector) {
      const user = await deps.activeUser(subject);
      return deps.store().view(user.id, repositorySelector(selector));
    },
    async execute(subject: string, raw: unknown) {
      const command = parseCommand(raw);
      const user = await deps.activeUser(subject);
      return deps.store().execute(user.id, command, deps.now());
    },
  };
}

import { isRecord } from "@line_bot_v1/platform/validation";
