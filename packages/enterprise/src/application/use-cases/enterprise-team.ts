import type { VerifiedLineActor } from "@line_bot_v1/identity-access/contracts/governance";
import { GovernanceAccessError } from "@line_bot_v1/identity-access/domain/role-assignment";
import type { EnterpriseReceipt } from "../../contracts/enterprise-governance.js";
import type { EnterpriseTeamTransactions } from "../../contracts/output/enterprise-team.js";
import {
  activateEnterpriseTeamMembership,
  activateEnterpriseTeamOrganization,
  createEnterpriseTeam,
  detachEnterpriseTeamFromOrganization,
  EnterpriseError,
  type EnterpriseTeamMembership,
  type EnterpriseTeamOrganizationAssignment,
  removeEnterpriseTeamMembership,
  renameEnterpriseTeam,
  requireActiveEnterprise,
  requireEnterpriseTeamAffiliation,
  requireEnterpriseTeamOrganization,
} from "../../domain.js";
import type { EnterpriseTeamCommand } from "../commands/enterprise-governance.js";

export function executeEnterpriseTeam(
  transactions: EnterpriseTeamTransactions,
  actor: VerifiedLineActor,
  input: EnterpriseTeamCommand,
  at: number,
) {
  const command = { ...input };
  const scope = command.enterpriseAccountId;
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
      let teamId: string;
      let status: string;
      let version: number;
      if (command.action === "create-enterprise-team") {
        const team = createEnterpriseTeam(
          command.enterpriseAccountId,
          transaction.nextId(),
          command.name,
        );
        teamId = team.id;
        version = await transaction.saveTeam(team);
        status = "created";
      } else {
        teamId = command.teamId;
        const team = await transaction.loadTeam(teamId);
        if (!team) throw new GovernanceAccessError(404, "not-found", "找不到 Enterprise Team。");
        if (command.action === "rename-enterprise-team") {
          version = await transaction.saveTeam(
            renameEnterpriseTeam(team, command.name, command.expectedVersion),
          );
          status = "renamed";
        } else if (
          command.action === "add-enterprise-team-member" ||
          command.action === "remove-enterprise-team-member"
        ) {
          const current = await transaction.loadMembership(teamId, command.targetUserId);
          const add = command.action === "add-enterprise-team-member";
          if (add) {
            await transaction.requireActiveTarget(command.targetUserId);
            requireEnterpriseTeamAffiliation(await transaction.isAffiliated(command.targetUserId));
          }
          let next: EnterpriseTeamMembership;
          if (add)
            next = activateEnterpriseTeamMembership(
              team,
              command.targetUserId,
              current,
              command.expectedVersion,
            );
          else {
            if (!current)
              throw new GovernanceAccessError(
                409,
                "conflict",
                "Enterprise Team membership 版本不符。",
              );
            next = removeEnterpriseTeamMembership(current, command.expectedVersion);
          }
          let organizationIds = add ? null : await transaction.organizationIds(teamId);
          if (organizationIds)
            for (const organizationId of organizationIds)
              await transaction.assertSourceRemovable(organizationId, command.targetUserId, teamId);
          version = await transaction.saveMembership(next);
          if (!organizationIds) organizationIds = await transaction.organizationIds(teamId);
          for (const organizationId of organizationIds) {
            await transaction.refreshMembership(organizationId, command.targetUserId);
            if (add) await transaction.cancelInvitation(organizationId, command.targetUserId);
          }
          status = next.status;
        } else if ("organizationAccountId" in command) {
          const scope = await transaction.organizationScope(command.organizationAccountId);
          requireEnterpriseTeamOrganization(scope.attached, scope.status);
          const current = await transaction.loadAssignment(teamId, command.organizationAccountId);
          const assign = command.action === "assign-enterprise-team-organization";
          let next: EnterpriseTeamOrganizationAssignment;
          if (assign)
            next = activateEnterpriseTeamOrganization(
              team,
              command.organizationAccountId,
              current,
              command.expectedVersion,
            );
          else {
            if (!current)
              throw new GovernanceAccessError(
                409,
                "conflict",
                "Enterprise Team assignment 版本不符。",
              );
            next = detachEnterpriseTeamFromOrganization(current, command.expectedVersion);
          }
          let memberIds = assign ? null : await transaction.memberIds(teamId);
          if (memberIds)
            for (const userId of memberIds)
              await transaction.assertSourceRemovable(
                command.organizationAccountId,
                userId,
                teamId,
                memberIds,
              );
          version = await transaction.saveAssignment(next);
          if (!memberIds) memberIds = await transaction.memberIds(teamId);
          for (const userId of memberIds) {
            await transaction.refreshMembership(command.organizationAccountId, userId);
            if (assign) await transaction.cancelInvitation(command.organizationAccountId, userId);
          }
          status = next.status;
        } else {
          throw new GovernanceAccessError(400, "invalid-input", "Enterprise Team 操作格式不正確。");
        }
      }
      const userId = "targetUserId" in command ? command.targetUserId : null;
      const result: EnterpriseReceipt = {
        requestId: command.requestId,
        action: command.action,
        scopeId: command.enterpriseAccountId,
        subjectKind: userId ? "user" : "enterprise-team",
        subjectId: userId ?? teamId,
        status,
        version,
        at,
      };
      await transaction.record(result);
      return result;
    } catch (error) {
      if (!(error instanceof EnterpriseError) || error.code === "invalid-input") throw error;
      if (error.code === "inactive")
        throw new GovernanceAccessError(409, error.code, "Enterprise 已停用。");
      if (command.action === "rename-enterprise-team")
        throw new GovernanceAccessError(
          409,
          error.code,
          error.code === "conflict"
            ? "Enterprise Team 版本已更新。"
            : "Enterprise Team 名稱沒有變更。",
        );
      if (command.action === "remove-enterprise-team-member")
        throw new GovernanceAccessError(409, "conflict", "Enterprise Team membership 版本不符。");
      if (
        command.action === "detach-enterprise-team-organization" &&
        error.code !== "scope-conflict"
      )
        throw new GovernanceAccessError(409, "conflict", "Enterprise Team assignment 版本不符。");
      throw new GovernanceAccessError(
        error.code === "forbidden" ? 403 : 409,
        error.code,
        error.message,
      );
    }
  });
}
