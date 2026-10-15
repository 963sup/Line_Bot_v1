import type { FixedSteps } from "../../contracts/output/fixed-steps.js";
import type { ActionLease, ActionRunQueue } from "../../contracts/output/worker.js";
import {
  type ActionStepOutcome,
  executionAllowed,
  finishActionStep,
  startBaselineActionRun,
} from "../../domain/automation.js";
export function createActionsWorker(deps: {
  queue: ActionRunQueue;
  steps: FixedSteps;
  now: () => number;
}) {
  const live = async (lease: ActionLease) => {
    const state = await deps.queue.inspect(lease, deps.now());
    return Boolean(state && executionAllowed(state.run, state.rule, state.scope));
  };
  return {
    async once(limit = 20) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
        throw new RangeError("Worker limit must be 1..100.");
      let events = 0,
        eventClaims = 0,
        claimed = 0,
        finished = 0,
        stale = 0;
      // Every source claim and every run step consumes one unit of the bounded budget.
      for (let i = 0; i < limit; i++) {
        const event = await deps.steps.events.claim(deps.now());
        if (!event) break;
        eventClaims++;
        await deps.queue.accept(event, async (rules, insert, id) => {
          for (const rule of rules) {
            const run = startBaselineActionRun(
              rule,
              {
                repositoryId: event.repositoryId,
                revisionId: event.revisionId,
                baselineId: event.baselineId,
                cursor: event.cursor,
              },
              id(),
              deps.now(),
            );
            if (run) await insert(run);
          }
        });
        if (await deps.steps.events.acknowledge(event, deps.now())) events++;
      }
      for (let i = eventClaims; i < limit; i++) {
        const lease = await deps.queue.claim(deps.now());
        if (!lease) break;
        claimed++;
        const at = deps.now();
        let outcome: ActionStepOutcome = { kind: "delegation-unavailable" };
        if (await live(lease))
          try {
            const run = lease.run;
            if (run.rule.kind === "check-wbs-revision")
              outcome = {
                kind: "checked",
                value: await deps.steps.check(run.rule.delegate, run.repositoryId, run.revisionId),
              };
            else {
              const recipient = run.rule.recipients[run.step];
              if (!recipient || !run.baselineId) throw new Error("Invalid fixed step.");
              const result = await deps.steps.notifications.deliver(
                {
                  key: `actions:${run.id}:${recipient}`,
                  repositoryId: run.repositoryId,
                  baselineId: run.baselineId,
                  revisionId: run.revisionId,
                  recipient,
                },
                () => live(lease),
              );
              outcome = { kind: "notified", value: result, nextAt: result.nextAt };
            }
          } catch {
            outcome = { kind: "source-or-delivery-unavailable" };
          }
        const saved = await deps.queue.finish(lease, deps.now(), (run) =>
          finishActionStep(run, outcome, at),
        );
        if (saved) finished++;
        else stale++;
      }
      return { events, claimed, finished, stale };
    },
  };
}
