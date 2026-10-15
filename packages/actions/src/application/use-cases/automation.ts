import type { ActionRecord, ActionTransactions } from "../../contracts/output/automation.js";
import type { FixedSteps } from "../../contracts/output/fixed-steps.js";
import {
  ActionsError,
  cancelActionRun,
  changeActionRule,
  requireActionAccess,
  requireActionManager,
  requireRuleCapacity,
  retryActionRun,
  startManualActionRun,
} from "../../domain/automation.js";
import { actionCommand } from "../commands/automation.js";
import { actionReceiptDto, actionRuleDto, actionRunDto } from "./automation-dto.js";
export function createActions(deps: {
  transactions: ActionTransactions;
  steps: FixedSteps;
  now: () => number;
}) {
  return {
    rules(userId: string, repositoryId: string) {
      return deps.transactions.transact(userId, repositoryId, async (tx) => {
        requireActionAccess(tx.scope);
        return (await tx.rules.list()).map(actionRuleDto);
      });
    },
    run(userId: string, repositoryId: string, id: string) {
      return deps.transactions.transact(userId, repositoryId, async (tx) => {
        requireActionAccess(tx.scope);
        const run = await tx.runs.load(id);
        return run ? actionRunDto(run) : null;
      });
    },
    async execute(userId: string, input: unknown) {
      const cmd = actionCommand(input),
        now = deps.now(),
        fingerprint = JSON.stringify(cmd);
      const result = await deps.transactions.transact(userId, cmd.repositoryId, async (tx) => {
        requireActionManager(tx.scope);
        const previous = await tx.replay(cmd.requestId, fingerprint);
        if (previous) return previous;
        let result: ActionRecord;
        if (cmd.action === "define" && "kind" in cmd) {
          const current = await tx.rules.load(cmd.id);
          if (!current) requireRuleCapacity((await tx.rules.list()).length);
          const rule = changeActionRule(
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
          const run = startManualActionRun(rule, {
            id: tx.id(),
            repositoryId: cmd.repositoryId,
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
          if (!current) throw new ActionsError(404, "找不到執行。");
          const run =
            cmd.action === "cancel"
              ? cancelActionRun(current, cmd.expectedVersion)
              : retryActionRun(current, cmd.expectedVersion, now);
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
            `actions:${result.run.id}:${recipient}`,
            deps.now(),
          );
      }
      return actionReceiptDto(result);
    },
  };
}
