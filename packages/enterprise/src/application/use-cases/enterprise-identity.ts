import type { VerifiedLineActor } from "@line_bot_v1/identity-access/contracts/governance";
import { GovernanceAccessError } from "@line_bot_v1/identity-access/domain/role-assignment";
import type { EnterpriseReceipt } from "../../contracts/enterprise-governance.js";
import type { EnterpriseIdentityTransactions } from "../../contracts/output/enterprise-identity.js";
import { completeEnterpriseIdentity, createEnterprise, EnterpriseError } from "../../domain.js";
import type { EnterpriseIdentityCommand } from "../commands/enterprise-governance.js";

export function executeEnterpriseIdentity(
  transactions: EnterpriseIdentityTransactions,
  actor: VerifiedLineActor,
  input: EnterpriseIdentityCommand,
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
  if (command.action === "create-enterprise")
    return transactions.create(actor, evidence, async (transaction) => {
      const replay = await transaction.replay();
      if (replay) return replay;
      const enterprise = createEnterprise(transaction.nextId());
      const version = await transaction.provisionForActor(enterprise, command.name, command.slug);
      const result: EnterpriseReceipt = {
        requestId: command.requestId,
        action: command.action,
        scopeId: enterprise.id,
        subjectKind: null,
        subjectId: null,
        status: enterprise.status,
        version,
        at,
      };
      await transaction.record(result);
      return result;
    });
  const scope = command.enterpriseAccountId;
  return transactions.complete(actor, scope, evidence, async (transaction) => {
    await transaction.authorizeOwner();
    const replay = await transaction.replay();
    if (replay) return replay;
    try {
      const next = completeEnterpriseIdentity(
        transaction.current,
        command.expectedVersion,
        command.name,
        command.slug,
      );
      const version = await transaction.save(next);
      const result: EnterpriseReceipt = {
        requestId: command.requestId,
        action: command.action,
        scopeId: command.enterpriseAccountId,
        subjectKind: null,
        subjectId: null,
        status: transaction.status,
        version,
        at,
      };
      await transaction.record(result);
      return result;
    } catch (error) {
      if (!(error instanceof EnterpriseError)) throw error;
      throw new GovernanceAccessError(
        error.code === "invalid-input" ? 400 : 409,
        error.code,
        error.message,
      );
    }
  });
}
