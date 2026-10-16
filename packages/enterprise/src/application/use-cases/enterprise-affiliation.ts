import type { VerifiedLineActor } from "@line_bot_v1/identity-access/contracts/governance";
import { GovernanceAccessError } from "@line_bot_v1/identity-access/domain/role-assignment";
import type { EnterpriseReceipt } from "../../contracts/enterprise-governance.js";
import type { EnterpriseAffiliationTransactions } from "../../contracts/output/enterprise-affiliation.js";
import {
  activateEnterpriseDirectAffiliation,
  EnterpriseError,
  inviteEnterpriseUser,
  removeEnterpriseDirectAffiliation,
  requireActiveEnterprise,
  requireNoDerivedEnterpriseAffiliation,
  requireNoEffectiveEnterpriseAffiliation,
  requireReplacementEnterpriseOwner,
  resolveEnterpriseInvitation,
} from "../../domain.js";
import type { EnterpriseAffiliationCommand } from "../commands/enterprise-governance.js";

export function executeEnterpriseAffiliation(
  transactions: EnterpriseAffiliationTransactions,
  actor: VerifiedLineActor,
  input: EnterpriseAffiliationCommand,
  at: number,
) {
  const command = { ...input };
  const scope = {
    enterpriseAccountId: command.enterpriseAccountId,
    targetUserId: command.action === "leave-enterprise" ? null : command.targetUserId,
  };
  const evidence = {
    requestId: command.requestId,
    payload: JSON.stringify(command),
    action: command.action,
    reason: command.reason,
    at,
  };
  return transactions.transact(actor, scope, evidence, async (transaction) => {
    if (command.action === "accept-invitation" || command.action === "decline-invitation") {
      if (transaction.targetUserId !== transaction.actorUserId)
        throw new GovernanceAccessError(403, "forbidden", "只能接受自己的 Enterprise invitation。");
    } else if (command.action !== "leave-enterprise") await transaction.authorizeOwner();
    const replay = await transaction.replay();
    if (replay) return replay;
    try {
      requireActiveEnterprise(transaction.enterpriseStatus);
      const direct = await transaction.loadDirect();
      const invitation = await transaction.loadInvitation();
      let status: string;
      let version: number;
      if (command.action === "invite-user") {
        requireNoEffectiveEnterpriseAffiliation(await transaction.hasEffectiveAffiliation());
        await transaction.requireActiveTarget();
        const next = inviteEnterpriseUser(invitation, command.expectedVersion);
        version = await transaction.saveInvitation(next);
        status = next.status;
      } else if (command.action === "accept-invitation") {
        const next = resolveEnterpriseInvitation(invitation, command.expectedVersion, "accepted");
        await transaction.requireActiveTarget();
        requireNoEffectiveEnterpriseAffiliation(await transaction.hasEffectiveAffiliation());
        await transaction.saveDirect(activateEnterpriseDirectAffiliation(direct));
        version = await transaction.saveInvitation(next);
        status = next.status;
      } else if (
        command.action === "decline-invitation" ||
        command.action === "cancel-invitation"
      ) {
        const next = resolveEnterpriseInvitation(
          invitation,
          command.expectedVersion,
          command.action === "decline-invitation" ? "declined" : "cancelled",
        );
        version = await transaction.saveInvitation(next);
        status = next.status;
      } else {
        const next = removeEnterpriseDirectAffiliation(direct, command.expectedVersion);
        if (command.action === "leave-enterprise")
          requireNoDerivedEnterpriseAffiliation(await transaction.hasOtherAffiliation());
        const effectiveOwner = await transaction.isEffectiveOwner();
        requireReplacementEnterpriseOwner(
          effectiveOwner,
          effectiveOwner && (await transaction.hasReplacementOwner()),
        );
        version = await transaction.saveDirect(next);
        if (effectiveOwner) await transaction.revokeOwner();
        status = next.status;
      }
      const result: EnterpriseReceipt = {
        requestId: command.requestId,
        action: command.action,
        scopeId: command.enterpriseAccountId,
        subjectKind: "user",
        subjectId: transaction.targetUserId,
        status,
        version,
        at,
      };
      await transaction.record(result);
      return result;
    } catch (error) {
      if (!(error instanceof EnterpriseError)) throw error;
      throw new GovernanceAccessError(
        409,
        error.code,
        error.code === "inactive"
          ? "Enterprise 已停用。"
          : error.code === "last-effective-role-holder"
            ? "不能移除最後一位有效 EnterpriseOwner 的最後 affiliation。"
            : error.message,
      );
    }
  });
}
