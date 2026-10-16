import type { VerifiedLineActor } from "@line_bot_v1/identity-access/contracts/governance";
import { GovernanceAccessError } from "@line_bot_v1/identity-access/domain/role-assignment";
import type { OrganizationReceipt } from "../../contracts/organization-governance.js";
import type { OrganizationMembershipTransactions } from "../../contracts/output/organization-membership.js";
import {
  activateOrganizationDirectMembership,
  inviteOrganizationUser,
  type OrganizationDirectMembership,
  OrganizationError,
  type OrganizationInvitation,
  removeOrganizationDirectMembership,
  requireActiveOrganizationMembershipScope,
  requireNoActiveOrganizationMembership,
  requireNoDerivedOrganizationMembership,
  resolveOrganizationInvitation,
} from "../../domain.js";
import type { OrganizationMembershipCommand } from "../commands/organization-membership.js";

export function executeOrganizationMembership(
  transactions: OrganizationMembershipTransactions,
  actor: VerifiedLineActor,
  input: OrganizationMembershipCommand,
  at: number,
) {
  const command = { ...input };
  const scope = {
    organizationAccountId: command.organizationAccountId,
    targetUserId: command.action === "leave-organization" ? null : command.targetUserId,
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
        throw new GovernanceAccessError(
          403,
          "forbidden",
          "只能接受自己的 Organization invitation。",
        );
    } else if (command.action !== "leave-organization") await transaction.authorizeOwner();
    const replay = await transaction.replay();
    if (replay) return replay;
    try {
      requireActiveOrganizationMembershipScope(transaction.organizationStatus);
      const membershipActive = await transaction.membershipActive();
      const direct = await transaction.directMembership();
      const invitation = await transaction.invitation();
      let status: string;
      let version: number;
      if (command.action === "invite-member") {
        requireNoActiveOrganizationMembership(membershipActive);
        await transaction.requireActiveTarget();
        const next = inviteOrganizationUser(
          invitation,
          command.organizationAccountId,
          transaction.targetUserId,
          command.expectedVersion,
        );
        version = await transaction.saveInvitation(next);
        status = next.status;
      } else if (
        command.action === "accept-invitation" ||
        command.action === "decline-invitation" ||
        command.action === "cancel-invitation"
      ) {
        if (!invitation)
          throw new GovernanceAccessError(409, "conflict", "找不到指定版本的 pending invitation。");
        let next: OrganizationInvitation;
        try {
          next = resolveOrganizationInvitation(
            invitation,
            command.action === "accept-invitation"
              ? "accepted"
              : command.action === "decline-invitation"
                ? "declined"
                : "cancelled",
            command.expectedVersion,
          );
        } catch (error) {
          if (!(error instanceof OrganizationError)) throw error;
          throw new GovernanceAccessError(409, "conflict", "找不到指定版本的 pending invitation。");
        }
        if (command.action === "accept-invitation") {
          await transaction.requireActiveTarget();
          requireNoActiveOrganizationMembership(membershipActive);
          await transaction.saveDirect(
            activateOrganizationDirectMembership(
              command.organizationAccountId,
              transaction.targetUserId,
              direct,
            ),
          );
          await transaction.refreshMembership();
        }
        version = await transaction.saveInvitation(next);
        status = next.status;
      } else {
        if (!direct)
          throw new GovernanceAccessError(
            409,
            "conflict",
            "找不到指定版本的有效 Organization direct membership。",
          );
        let next: OrganizationDirectMembership;
        try {
          next = removeOrganizationDirectMembership(direct, command.expectedVersion);
        } catch (error) {
          if (!(error instanceof OrganizationError)) throw error;
          throw new GovernanceAccessError(
            409,
            "conflict",
            "找不到指定版本的有效 Organization direct membership。",
          );
        }
        if (command.action === "leave-organization")
          requireNoDerivedOrganizationMembership(await transaction.hasOtherSource());
        await transaction.assertDirectSourceRemovable();
        version = await transaction.saveDirect(next);
        await transaction.refreshMembership();
        status = next.status;
      }
      const result: OrganizationReceipt = {
        requestId: command.requestId,
        action: command.action,
        scopeId: command.organizationAccountId,
        subjectKind: "user",
        subjectId: transaction.targetUserId,
        status,
        version,
        at,
      };
      await transaction.record(result);
      return result;
    } catch (error) {
      if (!(error instanceof OrganizationError)) throw error;
      throw new GovernanceAccessError(
        error.code === "invalid-input" ? 400 : 409,
        error.code,
        error.message,
      );
    }
  });
}
