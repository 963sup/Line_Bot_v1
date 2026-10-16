import { isRecord } from "@line_bot_v1/platform/validation";
import type {
  RepositoryManagementCommand,
  RepositoryManagementReceipt,
} from "../../contracts/input/repository-management.js";
import type { RepositoryManagementPersistence } from "../../contracts/output/repository-management.js";
import { RepositoryError } from "../../contracts/repository.js";
import {
  decideRepositoryLifecycle,
  type RepositoryLifecycleChange,
  type RepositoryLifecycleDecisionResult,
  RepositoryLifecycleError,
} from "../../domain/repository/entities/repository.js";

type ReceiptEnvelope = Readonly<{
  receiptVersion: 1;
  family: "repository-management";
  action: RepositoryManagementCommand["action"];
  result: RepositoryManagementReceipt;
}>;

function validVisibility(value: unknown): value is RepositoryManagementReceipt["visibility"] {
  return value === "private" || value === "internal" || value === "public";
}

function readReceipt(value: unknown): RepositoryManagementReceipt {
  if (!isRecord(value) || !isRecord(value.result)) {
    throw new RepositoryError(503, "Repository 管理回執無法讀取。");
  }
  const result = value.result;
  if (
    value.receiptVersion !== 1 ||
    value.family !== "repository-management" ||
    (value.action !== "rename" &&
      value.action !== "visibility" &&
      value.action !== "archive" &&
      value.action !== "unarchive") ||
    typeof result.requestId !== "string" ||
    typeof result.repositoryId !== "string" ||
    result.action !== value.action ||
    typeof result.name !== "string" ||
    !validVisibility(result.visibility) ||
    typeof result.archived !== "boolean" ||
    typeof result.version !== "number" ||
    !Number.isSafeInteger(result.version) ||
    typeof result.at !== "number" ||
    !Number.isSafeInteger(result.at)
  ) {
    throw new RepositoryError(503, "Repository 管理回執無法讀取。");
  }
  return {
    requestId: result.requestId,
    repositoryId: result.repositoryId,
    action: value.action,
    name: result.name,
    visibility: result.visibility,
    archived: result.archived,
    version: result.version,
    at: result.at,
  };
}

function lifecycleChange(command: RepositoryManagementCommand): RepositoryLifecycleChange {
  if (command.action === "rename") {
    return { action: command.action, expectedVersion: command.expectedVersion, name: command.name };
  }
  if (command.action === "visibility") {
    return {
      action: command.action,
      expectedVersion: command.expectedVersion,
      visibility: command.visibility,
    };
  }
  return { action: command.action, expectedVersion: command.expectedVersion };
}

function presentDomainError(error: unknown): never {
  if (!(error instanceof RepositoryLifecycleError)) throw error;
  const messages: Record<RepositoryLifecycleError["code"], string> = {
    "version-conflict": "Repository 已更新，請重新讀取後再操作。",
    "name-unchanged": "Repository name 沒有變更。",
    "name-reserved": "此 owner 的 Repository 名稱已使用或保留為舊名稱。",
    "visibility-unchanged": "Repository visibility 沒有變更。",
    "internal-owner-required": "INTERNAL Repository 必須由 Organization 擁有。",
    "internal-enterprise-required":
      "Organization 必須連結 active Enterprise 才能使用 INTERNAL visibility。",
    "already-archived": "Repository 已封存。",
    "not-archived": "Repository 尚未封存。",
  };
  throw new RepositoryError(409, messages[error.code]);
}

function decide(
  repository: Parameters<typeof decideRepositoryLifecycle>[0],
  change: RepositoryLifecycleChange,
  facts?: Parameters<typeof decideRepositoryLifecycle>[2],
): RepositoryLifecycleDecisionResult {
  try {
    return decideRepositoryLifecycle(repository, change, facts);
  } catch (error) {
    presentDomainError(error);
  }
}
export class RepositoryManagementUseCase {
  constructor(private readonly persistence: RepositoryManagementPersistence) {}

  execute(
    userId: string,
    input: RepositoryManagementCommand,
    now: number,
  ): Promise<RepositoryManagementReceipt> {
    const command: RepositoryManagementCommand = { ...input };
    const payload = JSON.stringify({ family: "repository-management", command });
    return this.persistence.transact(async (transaction) => {
      if (!(await transaction.hasCurrentUpdateQualification(userId))) {
        throw new RepositoryError(403, "目前 User 資格不能管理 Repository。");
      }
      const repository = await transaction.loadForUpdate(command.repositoryId);
      if (!repository) throw new RepositoryError(404, "找不到 Repository。");
      if (!(await transaction.hasCurrentAdmin(repository.id, userId))) {
        throw new RepositoryError(403, "需要 Repository admin 才能管理 Repository 設定。");
      }

      await transaction.lockRequest(userId, command.requestId);
      const previous = await transaction.evidence(userId, command.requestId, payload);
      if (previous) {
        if (!previous.matches) {
          throw new RepositoryError(409, "此請求編號已用於不同 Repository 操作。");
        }
        return readReceipt(previous.value);
      }

      const change = lifecycleChange(command);
      let result = decide(repository, change);
      if (result.kind === "requires-name-reservation") {
        result = decide(repository, change, {
          nameReserved: await transaction.nameReserved(repository, result.name),
        });
      } else if (result.kind === "requires-internal-enterprise") {
        result = decide(repository, change, {
          internalEnterpriseId: await transaction.internalEnterpriseId(
            result.organizationAccountId,
          ),
        });
      }
      if (result.kind !== "accepted") {
        throw new Error("Repository lifecycle facts were not resolved.");
      }

      const saved = await transaction.save(result.decision, now);
      if (saved === "duplicate-name") {
        throw new RepositoryError(409, "此 owner 已有相同名稱的 Repository。");
      }
      if (saved === "version-conflict") {
        throw new RepositoryError(409, "Repository 狀態已變更，請重新載入。");
      }

      const current = result.decision.current;
      const receipt: RepositoryManagementReceipt = {
        requestId: command.requestId,
        repositoryId: current.id,
        action: command.action,
        name: current.name,
        visibility: current.visibility,
        archived: current.archived,
        version: current.version,
        at: now,
      };
      const evidence: ReceiptEnvelope = {
        receiptVersion: 1,
        family: "repository-management",
        action: command.action,
        result: receipt,
      };
      await transaction.record({
        actorUserId: userId,
        requestId: command.requestId,
        payload,
        decision: result.decision,
        evidence,
        at: now,
      });
      return receipt;
    });
  }
}
