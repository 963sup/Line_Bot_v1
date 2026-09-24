import type { GovernanceReceipt, VerifiedLineActor } from "../../contracts/governance.js";
import type { ScopedRoleCommand } from "../../domain/role-assignment.js";

export interface RoleAssignmentPort {
  execute(
    actor: VerifiedLineActor,
    command: ScopedRoleCommand,
    now: number,
  ): Promise<GovernanceReceipt>;
}
