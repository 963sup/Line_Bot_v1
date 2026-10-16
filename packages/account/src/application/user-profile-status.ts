import type { UserProfileStatusChange } from "../contracts/dto/user-profile-status.js";
import type { UserProfileStatusPersistence } from "../contracts/output/user-profile-status.js";
import type { UserProfileStatusStore } from "../contracts/repositories/user-profile-status.js";
import { UserError } from "../domain/user.js";
import {
  nextUserProfileStatusVersion,
  requireUserProfileStatusWriter,
  userProfileStatusFields,
} from "../domain/user-profile-status.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parseUserProfileStatusChange(input: unknown): UserProfileStatusChange {
  if (!isRecord(input)) throw new UserError(400, "狀態格式不正確。");
  const allowed = new Set([
    "requestId",
    "message",
    "emoji",
    "limitedAvailability",
    "expiresAt",
    "expectedVersion",
  ]);
  if (Object.keys(input).some((key) => !allowed.has(key))) {
    throw new UserError(400, "狀態包含不支援的欄位。");
  }
  if (
    typeof input.requestId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      input.requestId,
    ) ||
    !Number.isSafeInteger(input.expectedVersion) ||
    Number(input.expectedVersion) < 0
  ) {
    throw new UserError(400, "狀態操作編號或版本不正確。");
  }
  return {
    requestId: input.requestId.toLowerCase(),
    ...userProfileStatusFields(input),
    expectedVersion: Number(input.expectedVersion),
  };
}

export function createUserProfileStatuses(deps: {
  activeUser(subject: string): Promise<{ id: string }>;
  store(): UserProfileStatusStore;
  persistence(): UserProfileStatusPersistence;
  now(): number;
}) {
  return {
    get: async (subject: string) => deps.store().read((await deps.activeUser(subject)).id),
    publicByUserId: async (userId: string) => {
      const status = await deps.store().readPublic(userId, deps.now());
      return status
        ? {
            message: status.message,
            emoji: status.emoji,
            limitedAvailability: status.limitedAvailability,
            expiresAt: status.expiresAt,
          }
        : null;
    },
    change: async (subject: string, input: unknown) => {
      const command = parseUserProfileStatusChange(input);
      const userId = (await deps.activeUser(subject)).id;
      const payload = JSON.stringify(command);
      const at = deps.now();
      return deps.persistence().transact(userId, command.requestId, async (transaction) => {
        requireUserProfileStatusWriter(await transaction.active());
        const replay = await transaction.replay(payload);
        if (replay) {
          if (!replay.matches) throw new UserError(409, "狀態操作編號已用於不同內容。");
          return replay.result;
        }
        const current = await transaction.current();
        const version = nextUserProfileStatusVersion(
          current?.version ?? null,
          command.expectedVersion,
        );
        const saved = await transaction.save(
          {
            message: command.message,
            emoji: command.emoji,
            limitedAvailability: command.limitedAvailability,
            expiresAt: command.expiresAt,
          },
          command.expectedVersion,
          version,
          at,
        );
        const result = { ...saved, requestId: command.requestId };
        await transaction.record(payload, result, at);
        return result;
      });
    },
  };
}
