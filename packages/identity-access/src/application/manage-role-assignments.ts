import type { VerifiedLineActor } from "../contracts/governance.js";
import { parseScopedRoleCommand } from "../domain/role-assignment.js";
import type { RoleAssignmentPort } from "./ports/role-assignments.js";

export function manageRoleAssignments(port: RoleAssignmentPort, clock: () => number = Date.now) {
  return {
    execute(actor: VerifiedLineActor, raw: unknown) {
      return port.execute(actor, parseScopedRoleCommand(raw), clock());
    },
  };
}
