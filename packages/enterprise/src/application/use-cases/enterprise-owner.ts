import type { VerifiedLineActor } from "@line_bot_v1/identity-access/contracts/governance";
import { GovernanceAccessError } from "@line_bot_v1/identity-access/domain/role-assignment";
import type { EnterpriseReceipt } from "../../contracts/enterprise-governance.js";
import type { EnterpriseOwnerTransactions } from "../../contracts/output/enterprise-owner.js";
import {
  EnterpriseError,
  grantEnterpriseOwner,
  requireActiveEnterprise,
  requireDirectEnterpriseOwnerAffiliation,
  requireReplacementEnterpriseOwner,
  revokeEnterpriseOwner,
} from "../../domain.js";
import type { EnterpriseOwnerCommand } from "../commands/enterprise-governance.js";

export function executeEnterpriseOwner(
  transactions: EnterpriseOwnerTransactions,
  actor: VerifiedLineActor,
  input: EnterpriseOwnerCommand,
  at: number,
) {
  const command = { ...input };
  const scope = {
    enterpriseAccountId: command.enterpriseAccountId,
    targetUserId: command.targetUserId,
  };
  const evidence = {
    requestId: command.requestId,
    payload: JSON.stringify(command),
    action: command.action,
    reason: command.reason,
    at,
  };
  return transactions.transact(actor, scope, evidence, async (transaction) => {
    await transaction.authorize();
    const replay = await transaction.replay();
    if (replay) return replay;
    try {
      requireActiveEnterprise(transaction.enterpriseStatus);
      requireDirectEnterpriseOwnerAffiliation(await transaction.hasDirectAffiliation());
      const userStatusVersion = await transaction.activeUserVersion();
      if (userStatusVersion === null)
        throw new GovernanceAccessError(404, "not-found", "找不到有效對象使用者。");
      const current = await transaction.load();
      const next =
        command.action === "grant-enterprise-owner"
          ? grantEnterpriseOwner(current, command.expectedVersion, userStatusVersion)
          : revokeEnterpriseOwner(current, command.expectedVersion);
      if (command.action === "revoke-enterprise-owner") {
        const effective = await transaction.isEffectiveOwner();
        requireReplacementEnterpriseOwner(
          effective,
          effective && (await transaction.hasReplacementOwner()),
        );
      }
      const saved = await transaction.save(next);
      const result: EnterpriseReceipt = {
        requestId: command.requestId,
        action: command.action,
        scopeId: command.enterpriseAccountId,
        subjectKind: "user",
        subjectId: command.targetUserId,
        status: saved.status,
        version: saved.version,
        at,
      };
      await transaction.record(result);
      return result;
    } catch (error) {
      if (!(error instanceof EnterpriseError)) throw error;
      throw new GovernanceAccessError(
        error.code === "forbidden"
          ? 403
          : error.code === "not-found"
            ? 404
            : error.code === "invalid-input"
              ? 400
              : 409,
        error.code,
        error.message,
      );
    }
  });
}
