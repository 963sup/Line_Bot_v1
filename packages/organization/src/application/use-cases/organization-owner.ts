import type { VerifiedLineActor } from "@line_bot_v1/identity-access/contracts/governance";
import { GovernanceAccessError } from "@line_bot_v1/identity-access/domain/role-assignment";
import type { OrganizationReceipt } from "../../contracts/organization-governance.js";
import type { OrganizationOwnerTransactions } from "../../contracts/output/organization-owner.js";
import {
  grantOrganizationOwner,
  OrganizationError,
  requireActiveOrganizationForOwner,
  requireOrganizationOwnerMembership,
  requireReplacementOrganizationOwner,
  revokeOrganizationOwner,
} from "../../domain.js";
import type { OrganizationOwnerCommand } from "../commands/organization-owner.js";

export function executeOrganizationOwner(
  transactions: OrganizationOwnerTransactions,
  actor: VerifiedLineActor,
  command: OrganizationOwnerCommand,
  at: number,
) {
  return transactions.transact(
    actor,
    { organizationAccountId: command.organizationAccountId, targetUserId: command.targetUserId },
    {
      requestId: command.requestId,
      payload: JSON.stringify(command),
      legacyPayload: JSON.stringify({
        action: command.action === "grant-organization-owner" ? "grant" : "revoke",
        requestId: command.requestId,
        scopeKind: "organization",
        scopeId: command.organizationAccountId,
        principal: { kind: "user", id: command.targetUserId },
        role: "OrganizationOwner",
        expectedVersion: command.expectedVersion,
        reason: command.reason,
      }),
      action: command.action,
      reason: command.reason,
      at,
    },
    async (transaction) => {
      await transaction.authorize();
      const replay = await transaction.replay();
      if (replay) return replay;
      try {
        requireActiveOrganizationForOwner(transaction.organization.status);
        const membership = await transaction.membership();
        requireOrganizationOwnerMembership(membership);
        const current = await transaction.load();
        const grant = command.action === "grant-organization-owner";
        const targetVersion =
          grant || current !== null ? await transaction.activeTargetVersion() : null;
        if (grant && targetVersion === null)
          throw new GovernanceAccessError(404, "not-found", "找不到有效對象使用者。");
        const next =
          grant && targetVersion !== null
            ? grantOrganizationOwner(
                current,
                command.expectedVersion,
                targetVersion,
                membership.version,
              )
            : revokeOrganizationOwner(
                current,
                command.expectedVersion,
                targetVersion,
                membership.version,
              );
        if (!grant) {
          const targetEffective = await transaction.targetEffective();
          requireReplacementOrganizationOwner(
            targetEffective,
            targetEffective && (await transaction.anotherEffective()),
          );
        }
        const version = await transaction.save(next);
        const result: OrganizationReceipt = {
          requestId: command.requestId,
          action: command.action,
          scopeId: command.organizationAccountId,
          subjectKind: "user",
          subjectId: command.targetUserId,
          status: next.status,
          version,
          at,
        };
        await transaction.record(result);
        return result;
      } catch (error) {
        if (!(error instanceof OrganizationError)) throw error;
        const status = error.code === "forbidden" ? 403 : error.code === "not-found" ? 404 : 409;
        throw new GovernanceAccessError(status, error.code, error.message);
      }
    },
  );
}
