import type { EnterpriseCommand, EnterpriseReceipt } from "../contracts/enterprise-governance.js";

export function makeEnterpriseReceipt(
  command: EnterpriseCommand,
  status: string,
  version: number,
  at: number,
  teamIdOverride: string | null = null,
): EnterpriseReceipt {
  const enterpriseAccountId = "enterpriseAccountId" in command ? command.enterpriseAccountId : "";
  const userId = "targetUserId" in command ? command.targetUserId : null;
  const organizationAccountId =
    "organizationAccountId" in command ? command.organizationAccountId : null;
  const teamId = teamIdOverride ?? ("teamId" in command ? command.teamId : null);
  const teamSubject =
    teamId &&
    (command.action === "create-enterprise-team" ||
      command.action === "rename-enterprise-team" ||
      command.action === "assign-enterprise-team-organization" ||
      command.action === "detach-enterprise-team-organization")
      ? teamId
      : null;
  return {
    requestId: command.requestId,
    action: command.action,
    scopeId: enterpriseAccountId,
    subjectKind: userId
      ? "user"
      : teamSubject
        ? "enterprise-team"
        : organizationAccountId
          ? "organization"
          : null,
    subjectId: userId ?? teamSubject ?? organizationAccountId,
    status,
    version,
    at,
  };
}
