import type { VerifiedLineActor } from "@line_bot_v1/identity-access/contracts/governance";
import { GovernanceAccessError } from "@line_bot_v1/identity-access/domain/role-assignment";
import type { EnterpriseReceipt } from "../../contracts/enterprise-governance.js";
import type {
  EnterpriseIdentityCommand,
  EnterpriseIdentityTransactions,
} from "../../contracts/output/enterprise-identity.js";
import { completeEnterpriseIdentity, createEnterprise, EnterpriseError } from "../../domain.js";

export function executeEnterpriseIdentity(
  transactions: EnterpriseIdentityTransactions,
  actor: VerifiedLineActor,
  command: EnterpriseIdentityCommand,
  at: number,
) {
  if (command.action === "create-enterprise")
    return transactions.create(actor, command, at, async (transaction) => {
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
  return transactions.complete(actor, command, at, async (transaction) => {
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
