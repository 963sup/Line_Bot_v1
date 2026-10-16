import { isRecord } from "@line_bot_v1/platform/validation";
import type {
  RepositorySubscriptionCommand,
  RepositorySubscriptionReceipt,
} from "../../contracts/input/repository-subscription.js";
import type { RepositorySubscriptionPersistence } from "../../contracts/output/repository-subscription.js";
import { RepositoryError } from "../../contracts/repository.js";
import {
  decideRepositorySubscription,
  isRepositorySubscriptionState,
  RepositorySubscriptionDecisionError,
} from "../../domain/repository/entities/repository.js";

type Receipt = Readonly<{
  receiptVersion: 1;
  family: "repository-subscription";
  action: "set";
  result: RepositorySubscriptionReceipt;
}>;

function readReceipt(value: unknown): RepositorySubscriptionReceipt {
  if (!isRecord(value) || !isRecord(value.result)) {
    throw new RepositoryError(503, "Repository subscription 回執無法讀取。");
  }
  const result = value.result;
  if (
    value.receiptVersion !== 1 ||
    value.family !== "repository-subscription" ||
    value.action !== "set" ||
    typeof result.requestId !== "string" ||
    typeof result.repositoryId !== "string" ||
    !isRepositorySubscriptionState(result.state) ||
    typeof result.version !== "number" ||
    !Number.isSafeInteger(result.version) ||
    typeof result.at !== "number" ||
    !Number.isSafeInteger(result.at)
  ) {
    throw new RepositoryError(503, "Repository subscription 回執無法讀取。");
  }
  return {
    requestId: result.requestId,
    repositoryId: result.repositoryId,
    state: result.state,
    version: result.version,
    at: result.at,
  };
}

function decide(
  ...args: Parameters<typeof decideRepositorySubscription>
): ReturnType<typeof decideRepositorySubscription> {
  try {
    return decideRepositorySubscription(...args);
  } catch (error) {
    if (!(error instanceof RepositorySubscriptionDecisionError)) throw error;
    if (error.code === "unchanged") {
      throw new RepositoryError(409, "Repository subscription 沒有變更。");
    }
    throw new RepositoryError(409, "Repository subscription 已更新，請重新載入。");
  }
}

export class RepositorySubscriptionMutationUseCase {
  constructor(private readonly persistence: RepositorySubscriptionPersistence) {}

  execute(
    userId: string,
    input: RepositorySubscriptionCommand,
    now: number,
  ): Promise<RepositorySubscriptionReceipt> {
    const command: RepositorySubscriptionCommand = { ...input };
    const payload = JSON.stringify({ family: "repository-subscription", command });
    return this.persistence.transact(async (transaction) => {
      if (!(await transaction.hasCurrentUpdateQualification(userId))) {
        throw new RepositoryError(403, "目前 User 資格不能管理 Repository subscription。");
      }
      const repository = await transaction.authorizedRepository(userId, command.repositoryId);
      await transaction.lockRequest(userId, command.requestId);
      const previous = await transaction.evidence(userId, command.requestId, payload);
      if (previous) {
        if (!previous.matches) {
          throw new RepositoryError(409, "此請求編號已用於不同 Repository 操作。");
        }
        return readReceipt(previous.value);
      }

      await transaction.lockPair(repository.id, userId);
      const current = await transaction.currentForUpdate(repository.id, userId);
      const decision = decide(current, {
        state: command.state,
        expectedVersion: command.expectedVersion,
      });
      if (!(await transaction.save(repository.id, userId, decision, now))) {
        throw new RepositoryError(409, "Repository subscription 已更新，請重新載入。");
      }

      const result: RepositorySubscriptionReceipt = {
        requestId: command.requestId,
        repositoryId: repository.id,
        state: decision.current.state,
        version: decision.current.version,
        at: now,
      };
      const receipt: Receipt = {
        receiptVersion: 1,
        family: "repository-subscription",
        action: "set",
        result,
      };
      await transaction.record({
        actorUserId: userId,
        requestId: command.requestId,
        payload,
        evidence: receipt,
        at: now,
      });
      return result;
    });
  }
}
