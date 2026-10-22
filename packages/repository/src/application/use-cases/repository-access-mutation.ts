import { isRecord } from "@line_bot_v1/platform/validation";
import { RepositoryError } from "../../contracts/errors/repository-error.js";
import type {
  RepositoryAccessCommand,
  RepositoryAccessReceipt,
} from "../../contracts/input/repository-access.js";
import type { RepositoryAccessPersistence } from "../../contracts/output/repository-access.js";
import {
  decideRepositoryAccess,
  type RepositoryAccessDecision,
  RepositoryAccessDecisionError,
  type RepositoryAccessFacts,
} from "../../domain/repository/entities/repository.js";

type Receipt = Readonly<{
  receiptVersion: 1;
  family: "repository-access";
  action: RepositoryAccessCommand["action"];
  result: RepositoryAccessReceipt;
}>;

function readReceipt(value: unknown): RepositoryAccessReceipt {
  if (!isRecord(value) || !isRecord(value.result)) {
    throw new RepositoryError(503, "Repository access 回執無法讀取。");
  }
  const result = value.result;
  if (
    value.receiptVersion !== 1 ||
    value.family !== "repository-access" ||
    (value.action !== "grant" && value.action !== "revoke") ||
    typeof result.requestId !== "string" ||
    typeof result.repositoryId !== "string" ||
    (result.subjectKind !== "USER" && result.subjectKind !== "TEAM") ||
    typeof result.subjectId !== "string" ||
    (result.capability !== null &&
      result.capability !== "read" &&
      result.capability !== "triage" &&
      result.capability !== "triage_plus" &&
      result.capability !== "write" &&
      result.capability !== "maintain" &&
      result.capability !== "admin") ||
    (result.version !== null &&
      (typeof result.version !== "number" || !Number.isSafeInteger(result.version))) ||
    typeof result.at !== "number" ||
    !Number.isSafeInteger(result.at)
  ) {
    throw new RepositoryError(503, "Repository access 回執無法讀取。");
  }
  return {
    requestId: result.requestId,
    repositoryId: result.repositoryId,
    subjectKind: result.subjectKind,
    subjectId: result.subjectId,
    capability: result.capability,
    version: result.version,
    at: result.at,
  };
}

function presentDecisionError(error: unknown): never {
  if (!(error instanceof RepositoryAccessDecisionError)) throw error;
  if (error.code === "target-user-inactive") {
    throw new RepositoryError(403, "Repository access 資格不符。");
  }
  throw new RepositoryError(409, "Repository access 狀態已變更，請重新載入。");
}

function decide(...args: Parameters<typeof decideRepositoryAccess>): RepositoryAccessDecision {
  try {
    return decideRepositoryAccess(...args);
  } catch (error) {
    presentDecisionError(error);
  }
}

export class RepositoryAccessMutationUseCase {
  constructor(private readonly persistence: RepositoryAccessPersistence) {}

  execute(
    userId: string,
    input: RepositoryAccessCommand,
    now: number,
  ): Promise<RepositoryAccessReceipt> {
    const command: RepositoryAccessCommand = { ...input };
    const payload = JSON.stringify({ family: "repository-access", command });
    return this.persistence.transact(async (transaction) => {
      if (!(await transaction.hasCurrentUpdateQualification(userId))) {
        throw new RepositoryError(403, "目前 User 資格不能管理 Repository access。");
      }
      const repository = await transaction.load(command.repositoryId);
      if (!repository) throw new RepositoryError(404, "找不到 Repository。");
      if (!(await transaction.hasCurrentAdmin(repository.id, userId))) {
        throw new RepositoryError(403, "沒有此 Repository 的 access 管理權限。");
      }

      await transaction.lockRequest(userId, command.requestId);
      const previous = await transaction.evidence(userId, command.requestId, payload);
      if (previous) {
        if (!previous.matches) {
          throw new RepositoryError(409, "此請求編號已用於不同 Repository 操作。");
        }
        return readReceipt(previous.value);
      }

      const change =
        command.action === "grant"
          ? {
              action: command.action,
              subjectKind: command.subjectKind,
              subjectId: command.subjectId,
              capability: command.capability,
              expectedVersion: command.expectedVersion,
            }
          : {
              action: command.action,
              subjectKind: command.subjectKind,
              subjectId: command.subjectId,
              expectedVersion: command.expectedVersion,
            };
      let decision: RepositoryAccessDecision;
      if (
        command.subjectId.length < 1 ||
        command.subjectId.length > 128 ||
        command.subjectId !== command.subjectId.trim() ||
        !Number.isSafeInteger(command.expectedVersion) ||
        command.expectedVersion < 0 ||
        command.expectedVersion > 2_147_483_647
      ) {
        decision = {
          kind: "accepted",
          mutation: {
            subjectKind: command.subjectKind,
            subjectId: command.subjectId,
            capability: command.action === "grant" ? command.capability : null,
            expectedVersion: command.expectedVersion,
          },
        };
      } else {
        let facts: RepositoryAccessFacts = {};
        decision = decide(repository, change, facts);
        if (decision.kind === "requires-current-grant") {
          facts = {
            ...facts,
            currentGrant: await transaction.currentGrant(
              repository.id,
              decision.subjectKind,
              decision.subjectId,
            ),
          };
          decision = decide(repository, change, facts);
        }
        if (decision.kind === "requires-active-user") {
          facts = {
            ...facts,
            targetUserActive: await transaction.targetUserActive(decision.userId),
          };
          decision = decide(repository, change, facts);
        }
        if (decision.kind !== "accepted") {
          throw new Error("Repository access facts were not resolved.");
        }
      }

      const changed = await transaction.mutate(userId, repository.id, decision.mutation);
      const result: RepositoryAccessReceipt = {
        requestId: command.requestId,
        repositoryId: repository.id,
        subjectKind: command.subjectKind,
        subjectId: command.subjectId,
        capability: changed.capability,
        version: changed.version,
        at: now,
      };
      const receipt: Receipt = {
        receiptVersion: 1,
        family: "repository-access",
        action: command.action,
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
