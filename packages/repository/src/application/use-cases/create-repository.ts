import { isRecord } from "@line_bot_v1/platform/validation";
import { RepositoryError } from "../../contracts/errors/repository-error.js";
import type {
  RepositoryCreateCommand,
  RepositoryCreationResult,
} from "../../contracts/input/repository-creation.js";
import type { RepositoryCreationPersistence } from "../../contracts/output/repository-creation.js";
import {
  assertRepositoryCreationOwner,
  assertRepositoryCreationVisibility,
  initializeRepository,
  RepositoryCreationError,
} from "../../domain/repository/entities/repository.js";

function presentOwnerError(error: unknown): never {
  if (!(error instanceof RepositoryCreationError)) throw error;
  if (error.code === "user-owner-forbidden") {
    throw new RepositoryError(403, "只能在自己的 User 帳號下建立 Repository。");
  }
  throw new RepositoryError(
    409,
    "INTERNAL Repository 需要 active Enterprise scope 的 Organization owner。",
  );
}

function readReceipt(value: unknown): string {
  if (!isRecord(value) || value.receiptVersion !== 1 || typeof value.repositoryId !== "string") {
    throw new RepositoryError(503, "Repository 建立回執無法讀取。");
  }
  return value.repositoryId;
}

export class CreateRepositoryUseCase {
  constructor(private readonly persistence: RepositoryCreationPersistence) {}

  create(
    userId: string,
    input: RepositoryCreateCommand,
    now: number,
  ): Promise<RepositoryCreationResult> {
    const command: RepositoryCreateCommand = { ...input };
    const payload = JSON.stringify(command);
    const legacyPayload =
      command.visibility === "private"
        ? JSON.stringify({
            requestId: command.requestId,
            ownerAccountId: command.ownerAccountId,
            ownerKind: command.ownerKind,
            name: command.name,
          })
        : null;

    return this.persistence.transact(async (transaction) => {
      if (!(await transaction.hasCurrentUpdateQualification(userId))) {
        throw new RepositoryError(403, "目前 User 資格不能建立 Repository。");
      }

      let ownerLogin: string | null;
      let internalEligible = false;
      if (command.ownerKind === "USER") {
        try {
          assertRepositoryCreationOwner(userId, command);
        } catch (error) {
          presentOwnerError(error);
        }
        ownerLogin = await transaction.ownerLogin(command.ownerAccountId, command.ownerKind);
        if (!ownerLogin) throw new RepositoryError(409, "目前 User login 不可用。");
      } else {
        if (
          !(await transaction.organizationCanCreate(
            userId,
            command.ownerAccountId,
            command.visibility,
          ))
        ) {
          throw new RepositoryError(403, "目前 Organization capability 不允許建立 Repository。");
        }
        ownerLogin = await transaction.ownerLogin(command.ownerAccountId, command.ownerKind);
        if (!ownerLogin) throw new RepositoryError(409, "Organization login 不可用。");
        internalEligible = await transaction.internalEligible(command.ownerAccountId);
      }

      await transaction.lockRequest(userId, command.requestId);
      const previous = await transaction.evidence(
        userId,
        command.requestId,
        payload,
        legacyPayload,
      );
      if (previous) {
        if (!previous.matches) {
          throw new RepositoryError(409, "此 Repository 建立請求編號已用於不同內容。");
        }
        const result = await transaction.result(readReceipt(previous.value), ownerLogin);
        if (!result) throw new RepositoryError(503, "Repository 建立回執無法讀取。");
        return result;
      }

      try {
        assertRepositoryCreationVisibility(command, internalEligible);
      } catch (error) {
        presentOwnerError(error);
      }
      const repository = initializeRepository(transaction.allocateId(), command, internalEligible);
      const provisioned = await transaction.provision(userId, repository);
      if (provisioned === "duplicate-name") {
        throw new RepositoryError(409, "此 owner 已有相同或保留的 Repository 名稱。");
      }
      if (provisioned === "internal-scope-changed") {
        throw new RepositoryError(409, "INTERNAL Repository 的 Enterprise scope 已變更。");
      }
      if (provisioned === "owner-qualification-changed") {
        throw new RepositoryError(403, "目前 owner 資格不能建立 Repository。");
      }

      await transaction.record({
        actorUserId: userId,
        requestId: command.requestId,
        payload,
        evidence: { receiptVersion: 1, repositoryId: repository.id },
        at: now,
      });
      const result = await transaction.result(repository.id, ownerLogin);
      if (!result) throw new RepositoryError(503, "Repository 建立回執無法讀取。");
      return result;
    });
  }
}
