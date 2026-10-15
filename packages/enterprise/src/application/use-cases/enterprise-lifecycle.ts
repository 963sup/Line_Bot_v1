import type { VerifiedLineActor } from "@line_bot_v1/identity-access/contracts/governance";
import { GovernanceAccessError } from "@line_bot_v1/identity-access/domain/role-assignment";
import type { EnterpriseReceipt } from "../../contracts/enterprise-governance.js";
import type { EnterpriseLifecycleTransactions } from "../../contracts/output/enterprise-lifecycle.js";
import {
  deactivateEnterprise,
  type Enterprise,
  EnterpriseError,
  reactivateEnterprise,
} from "../../domain.js";
import type { EnterpriseLifecycleCommand } from "../commands/enterprise-lifecycle.js";

export function executeEnterpriseLifecycle(
  transactions: EnterpriseLifecycleTransactions,
  actor: VerifiedLineActor,
  command: EnterpriseLifecycleCommand,
  now: number,
) {
  return transactions.transact(
    actor,
    command.enterpriseAccountId,
    {
      requestId: command.requestId,
      payload: JSON.stringify(command),
      reason: command.reason,
      at: now,
    },
    async (transaction) => {
      if (!transaction.ownerQualification) {
        throw new GovernanceAccessError(403, "forbidden", "你沒有此 Enterprise 的治理權限。");
      }
      const replay = await transaction.replay();
      if (replay) return replay;

      let next: Enterprise;
      const current = await transaction.enterprises.load();
      try {
        next =
          command.action === "deactivate"
            ? deactivateEnterprise(current, command.expectedVersion)
            : reactivateEnterprise(current, command.expectedVersion);
      } catch (error) {
        if (!(error instanceof EnterpriseError)) throw error;
        throw new GovernanceAccessError(
          error.code === "invalid-input" ? 400 : 409,
          error.code,
          error.code === "conflict"
            ? "Enterprise 版本已更新。"
            : "Enterprise lifecycle 狀態不適用此操作。",
        );
      }
      await transaction.enterprises.save(next, command.expectedVersion);
      const result: EnterpriseReceipt = {
        requestId: command.requestId,
        action: command.action,
        scopeId: next.id,
        subjectKind: null,
        subjectId: null,
        status: next.status,
        version: next.version,
        at: now,
      };
      await transaction.record(result);
      return result;
    },
  );
}
