import type {
  GovernanceQuery,
  VerifiedLineActor,
} from "@line_bot_v1/identity-access/contracts/governance";
import type { EnterpriseCommand } from "../contracts/enterprise-governance.js";
import type { EnterpriseGovernancePort } from "../contracts/input/enterprise-governance.js";
import type { EnterpriseLifecycleTransactions } from "../contracts/output/enterprise-lifecycle.js";
import { normalizeEnterpriseSlug } from "../domain.js";
import { parseEnterpriseCommand, parseId } from "./commands/enterprise-governance.js";
import type { EnterpriseLifecycleCommand } from "./commands/enterprise-lifecycle.js";
import { executeEnterpriseLifecycle } from "./use-cases/enterprise-lifecycle.js";

function isLifecycleCommand(
  command: EnterpriseCommand | EnterpriseLifecycleCommand,
): command is EnterpriseLifecycleCommand {
  return command.action === "deactivate" || command.action === "reactivate";
}

export function enterpriseGovernance(
  port: EnterpriseGovernancePort,
  lifecycle: EnterpriseLifecycleTransactions,
  clock: () => number = Date.now,
) {
  return {
    list(actor: VerifiedLineActor, query: GovernanceQuery = {}) {
      return port.list(actor, query);
    },
    detail(actor: VerifiedLineActor, enterpriseAccountId: string) {
      return port.detail(actor, parseId(enterpriseAccountId, "Enterprise"));
    },
    detailBySlug(actor: VerifiedLineActor, value: string) {
      return port.detailBySlug(actor, normalizeEnterpriseSlug(value));
    },
    execute(actor: VerifiedLineActor, raw: unknown) {
      const command = parseEnterpriseCommand(raw);
      const now = clock();
      if (isLifecycleCommand(command))
        return executeEnterpriseLifecycle(lifecycle, actor, command, now);
      return port.execute(actor, command, now);
    },
  };
}
