import type { VerifiedLineActor } from "@line_bot_v1/identity-access/contracts/governance";
import { GovernanceAccessError } from "@line_bot_v1/identity-access/domain/role-assignment";
import type {
  OrganizationMemberCreationPolicy,
  OrganizationReceipt,
} from "../../contracts/organization-governance.js";
import type { OrganizationScopeTransactions } from "../../contracts/output/organization-scope.js";
import {
  createOrganization,
  type Organization,
  OrganizationError,
  updateOrganizationMemberCreationPolicy,
} from "../../domain.js";
import type { OrganizationScopeCommand } from "../commands/organization-scope.js";

export function executeOrganizationScope(
  transactions: OrganizationScopeTransactions,
  actor: VerifiedLineActor,
  input: OrganizationScopeCommand,
  at: number,
) {
  const command = { ...input };
  const evidence = {
    requestId: command.requestId,
    payload: JSON.stringify(command),
    action: command.action,
    reason: command.reason,
    at,
  };

  if (command.action === "create-organization") {
    return transactions.transactCreation(actor, evidence, async (transaction) => {
      const replay = await transaction.replay();
      if (replay) return replay;
      const organization = createOrganization(transaction.nextOrganizationAccountId());
      const version = await transaction.provision(organization, {
        login: command.login,
        name: command.name,
      });
      const result: OrganizationReceipt = {
        requestId: command.requestId,
        action: command.action,
        scopeId: organization.id,
        subjectKind: null,
        subjectId: null,
        status: organization.status,
        version,
        at,
      };
      await transaction.record(result);
      return result;
    });
  }

  const policy: OrganizationMemberCreationPolicy = {
    memberCanCreatePublicRepositories: command.memberCanCreatePublicRepositories,
    memberCanCreatePrivateRepositories: command.memberCanCreatePrivateRepositories,
    memberCanCreateInternalRepositories: command.memberCanCreateInternalRepositories,
    memberCanCreateProjectV2: command.memberCanCreateProjectV2,
    memberCanCreateTeams: command.memberCanCreateTeams,
  };
  return transactions.transactMemberPolicy(
    actor,
    { organizationAccountId: command.organizationAccountId },
    evidence,
    async (transaction) => {
      await transaction.authorizeOwner();
      const replay = await transaction.replay();
      if (replay) return replay;
      let next: Organization;
      try {
        next = updateOrganizationMemberCreationPolicy(
          transaction.organization,
          command.expectedVersion,
        );
      } catch (error) {
        if (!(error instanceof OrganizationError)) throw error;
        throw new GovernanceAccessError(
          409,
          error.code === "inactive" ? "inactive" : "conflict",
          error.code === "inactive"
            ? "停用的 Organization 不能變更成員建立政策。"
            : "Organization 版本已更新。",
        );
      }
      const version = await transaction.save(next, command.expectedVersion, policy);
      const result: OrganizationReceipt = {
        requestId: command.requestId,
        action: command.action,
        scopeId: command.organizationAccountId,
        subjectKind: null,
        subjectId: null,
        status: next.status,
        version,
        at,
      };
      await transaction.record(result);
      return result;
    },
  );
}
