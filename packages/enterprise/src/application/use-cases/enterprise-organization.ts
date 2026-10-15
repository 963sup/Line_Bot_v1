import type { VerifiedLineActor } from "@line_bot_v1/identity-access/contracts/governance";
import { GovernanceAccessError } from "@line_bot_v1/identity-access/domain/role-assignment";
import type { EnterpriseReceipt } from "../../contracts/enterprise-governance.js";
import type {
  EnterpriseOrganizationCommand,
  EnterpriseOrganizationTransactions,
} from "../../contracts/output/enterprise-organization.js";
import {
  attachEnterpriseOrganization,
  detachEnterpriseOrganization,
  EnterpriseError,
  requireEnterpriseOrganizationScopes,
  requireNoEnterpriseTeamAssignments,
} from "../../domain.js";

export function executeEnterpriseOrganization(
  transactions: EnterpriseOrganizationTransactions,
  actor: VerifiedLineActor,
  command: EnterpriseOrganizationCommand,
  at: number,
) {
  return transactions.transact(actor, command, at, async (transaction) => {
    const detach = command.action === "detach-organization";
    const mode = detach ? "current-assignment" : "active-scope";
    await transaction.authorizeEnterprise(mode);
    if (!(await transaction.organizationOwnerConsents(mode)))
      throw new GovernanceAccessError(
        403,
        "consent-required",
        detach
          ? "需要目前 OrganizationOwner 同意解除治理關係。"
          : "需要目前 OrganizationOwner 同意建立治理關係。",
      );
    const replay = await transaction.replay();
    if (replay) return replay;
    try {
      requireEnterpriseOrganizationScopes(
        transaction.enterprise,
        transaction.organization,
        command.expectedEnterpriseVersion,
        command.expectedOrganizationVersion,
        detach ? "detach" : "attach",
      );
      const current = await transaction.load();
      const next = detach
        ? detachEnterpriseOrganization(current, command.expectedRelationVersion)
        : attachEnterpriseOrganization(current, command.expectedRelationVersion);
      if (detach) requireNoEnterpriseTeamAssignments(await transaction.hasTeamAssignments());
      const version = await transaction.save(next);
      const result: EnterpriseReceipt = {
        requestId: command.requestId,
        action: command.action,
        scopeId: command.enterpriseAccountId,
        subjectKind: "organization",
        subjectId: command.organizationAccountId,
        status: next.status,
        version,
        at,
      };
      await transaction.record(result);
      return result;
    } catch (error) {
      if (!(error instanceof EnterpriseError)) throw error;
      throw new GovernanceAccessError(409, error.code, error.message);
    }
  });
}
