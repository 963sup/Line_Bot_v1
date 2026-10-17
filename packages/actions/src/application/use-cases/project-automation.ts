import type {
  ProjectActionRecord,
  ProjectActionTransactions,
} from "../../contracts/output/project-automation.js";
import type { ProjectFixedSteps } from "../../contracts/output/project-fixed-steps.js";
import {
  cancelProjectActionRun,
  changeProjectActionRule,
  ProjectActionsError,
  requireProjectActionAccess,
  requireProjectActionManager,
  requireRuleCapacity,
  retryProjectActionRun,
  startManualProjectActionRun,
} from "../../domain/project-automation.js";
import { projectActionCommand } from "../commands/project-automation.js";
import {
  projectActionReceiptDto,
  projectActionRuleDto,
  projectActionRunDto,
} from "./project-automation-dto.js";
export function createProjectActions(deps: {
  transactions: ProjectActionTransactions;
  steps: ProjectFixedSteps;
  now: () => number;
}) {
  return {
    rules(userId: string, projectId: string) {
      return deps.transactions.transact(userId, projectId, async (tx) => {
        requireProjectActionAccess(tx.scope);
        return (await tx.rules.list()).map(projectActionRuleDto);
      });
    },
    run(userId: string, projectId: string, id: string) {
      return deps.transactions.transact(userId, projectId, async (tx) => {
        requireProjectActionAccess(tx.scope);
        const run = await tx.runs.load(id);
        return run ? projectActionRunDto(run) : null;
      });
    },
    async execute(userId: string, input: unknown) {
      const cmd = projectActionCommand(input),
        now = deps.now(),
        fingerprint = JSON.stringify(cmd);
      const result = await deps.transactions.transact(userId, cmd.projectId, async (tx) => {
        requireProjectActionAccess(tx.scope);
        const previous = await tx.replay(cmd.requestId, fingerprint);
        if (previous) return previous;
        requireProjectActionManager(tx.scope);
        let result: ProjectActionRecord;
        if (cmd.action === "define" && "kind" in cmd) {
          const current = await tx.rules.load(cmd.id);
          if (!current) requireRuleCapacity((await tx.rules.list()).length);
          const rule = changeProjectActionRule(
            current,
            cmd,
            userId,
            tx.scope.qualificationVersion,
            await tx.cursor(),
            tx.id(),
          );
          await tx.rules.save(rule, cmd.expectedVersion);
          result = { rule };
        } else if (cmd.action === "execute" && "revisionId" in cmd) {
          const rule = await tx.rules.load(cmd.id);
          const run = startManualProjectActionRun(rule, {
            id: tx.id(),
            projectId: cmd.projectId,
            revisionId: cmd.revisionId,
            expectedVersion: cmd.expectedVersion,
            actor: userId,
            qualificationVersion: tx.scope.qualificationVersion,
            now,
          });
          await tx.runs.save(run, 0, now);
          result = { run };
        } else {
          const current = await tx.runs.load(cmd.id);
          if (!current) throw new ProjectActionsError(404, "找不到執行。");
          const run =
            cmd.action === "cancel"
              ? cancelProjectActionRun(current, cmd.expectedVersion)
              : retryProjectActionRun(current, cmd.expectedVersion, now);
          await tx.runs.save(run, cmd.expectedVersion, now);
          result = { run };
        }
        await tx.receipt(cmd.requestId, fingerprint, result, now);
        return result;
      });
      if (cmd.action === "cancel" && "run" in result) {
        // Replay repeats idempotent cleanup if the caller crashed after committing cancellation.
        for (const recipient of result.run.rule.recipients)
          await deps.steps.notifications.cancel(
            `project-actions:${result.run.id}:${recipient}`,
            deps.now(),
          );
      }
      return projectActionReceiptDto(result);
    },
  };
}
