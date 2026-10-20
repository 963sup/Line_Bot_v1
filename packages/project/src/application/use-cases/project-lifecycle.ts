import type { ProjectManagementIdentity } from "../../contracts/management.js";
import type {
  ProjectLifecycleCommand,
  ProjectLifecyclePersistence,
} from "../../contracts/output/project-lifecycle.js";
import { changeProjectLifecycle } from "../../domain/project-lifecycle.js";

export function executeProjectLifecycle(
  persistence: ProjectLifecyclePersistence,
  identity: ProjectManagementIdentity,
  command: ProjectLifecycleCommand,
  now: number,
) {
  return persistence.transact(identity, command, async (transaction) => {
    const replay = await transaction.replay();
    if (replay) return replay;
    const { state, role } = await transaction.load();
    const change = changeProjectLifecycle(
      state,
      role,
      command.expectedVersion,
      command.action,
      now,
    );
    return transaction.save(change, now);
  });
}
