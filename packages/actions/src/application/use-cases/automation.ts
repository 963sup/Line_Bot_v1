import type { ActionReceipt } from "../../contracts/dto/automation.js";
import type { FixedSteps } from "../../contracts/output/fixed-steps.js";
import type { ActionStore } from "../../contracts/repositories/automation.js";
import {
  type ActionRun,
  ActionsError,
  cancelActionRun,
  changeActionRule,
  requireActionAccess,
  requireActionManager,
  retryActionRun,
} from "../../domain/automation.js";
import { actionCommand } from "../commands/automation.js";
export function createActions(deps: { store: ActionStore; steps: FixedSteps; now: () => number }) {
  return {
    rules(userId: string, repositoryId: string) {
      return deps.store.transact(userId, repositoryId, async (tx) => {
        requireActionAccess(tx.scope);
        return tx.rules();
      });
    },
    run(userId: string, repositoryId: string, id: string) {
      return deps.store.transact(userId, repositoryId, async (tx) => {
        requireActionAccess(tx.scope);
        return tx.run(id);
      });
    },
    async execute(userId: string, input: unknown) {
      const cmd = actionCommand(input),
        now = deps.now(),
        fingerprint = JSON.stringify(cmd);
      const result = await deps.store.transact(userId, cmd.repositoryId, async (tx) => {
        requireActionManager(tx.scope);
        const previous = await tx.replay(cmd.requestId, fingerprint);
        if (previous) return previous;
        let result: ActionReceipt;
        if (cmd.action === "define" && "kind" in cmd) {
          const current = await tx.rule(cmd.id);
          if (!current && (await tx.rules()).length >= 100)
            throw new ActionsError(409, "Repository 規則上限為 100。");
          const rule = changeActionRule(
            current,
            cmd,
            userId,
            tx.scope.qualificationVersion,
            await tx.cursor(),
            tx.id(),
          );
          await tx.saveRule(rule);
          result = { rule };
        } else if (cmd.action === "execute" && "revisionId" in cmd) {
          const rule = await tx.rule(cmd.id);
          if (!rule || !rule.enabled || rule.kind !== "check-wbs-revision")
            throw new ActionsError(409, "規則不適用於手動執行。");
          if (rule.version !== cmd.expectedVersion) throw new ActionsError(409, "規則版本衝突。");
          // Manual execution delegates the verified manager for this run.
          const snapshot = {
            ...rule,
            delegate: userId,
            delegateVersion: tx.scope.qualificationVersion,
          };
          const run: ActionRun = {
            id: tx.id(),
            repositoryId: cmd.repositoryId,
            rule: snapshot,
            revisionId: cmd.revisionId,
            baselineId: null,
            status: "queued",
            version: 1,
            step: 0,
            attempt: 0,
            due: now,
            createdAt: now,
            results: [],
          };
          await tx.saveRun(run, now);
          result = { run };
        } else {
          const current = await tx.run(cmd.id);
          if (!current) throw new ActionsError(404, "找不到執行。");
          if (current.version !== cmd.expectedVersion)
            throw new ActionsError(409, "執行版本衝突。");
          const run =
            cmd.action === "cancel" ? cancelActionRun(current) : retryActionRun(current, now);
          await tx.saveRun(run, now);
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
      return result;
    },
  };
}
