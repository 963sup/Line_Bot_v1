import type { VerifiedLineActor } from "@line_bot_v1/identity-access/contracts/governance";
import { GovernanceAccessError } from "@line_bot_v1/identity-access/domain/role-assignment";
import type { OrganizationReceipt } from "../../contracts/organization-governance.js";
import type { OrganizationLifecycleTransactions } from "../../contracts/output/organization-lifecycle.js";
import {
  deactivateOrganization,
  type Organization,
  OrganizationError,
  reactivateOrganization,
} from "../../domain.js";
import type { OrganizationLifecycleCommand } from "../commands/organization-lifecycle.js";

export function executeOrganizationLifecycle(
  transactions: OrganizationLifecycleTransactions,
  actor: VerifiedLineActor,
  command: OrganizationLifecycleCommand,
  now: number,
) {
  return transactions.transact(
    actor,
    command.organizationAccountId,
    {
      requestId: command.requestId,
      payload: JSON.stringify(command),
      reason: command.reason,
      at: now,
    },
    async (transaction) => {
      const qualified =
        command.action === "deactivate"
          ? transaction.ownerQualification.activeOwner
          : transaction.ownerQualification.lifecycleOwner;
      if (!qualified) {
        throw new GovernanceAccessError(
          403,
          "forbidden",
          command.action === "deactivate"
            ? "你沒有此 Organization 的 owner 權限。"
            : "你沒有此 Organization 的生命週期權限。",
        );
      }
      const replay = await transaction.replay();
      if (replay) return replay;

      let next: Organization;
      const current = await transaction.organizations.load();
      try {
        next =
          command.action === "deactivate"
            ? deactivateOrganization(current, command.expectedVersion)
            : reactivateOrganization(current, command.expectedVersion);
      } catch (error) {
        if (!(error instanceof OrganizationError)) throw error;
        throw new GovernanceAccessError(
          error.code === "invalid-input" ? 400 : 409,
          error.code,
          error.code === "conflict"
            ? "Organization 版本已更新。"
            : "Organization 狀態不適用此操作。",
        );
      }
      await transaction.organizations.save(next, command.expectedVersion);
      const result: OrganizationReceipt = {
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
