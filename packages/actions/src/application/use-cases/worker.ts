import type { ActionLease } from "../../contracts/dto/automation.js";
import type { FixedSteps } from "../../contracts/output/fixed-steps.js";
import type { ActionStore } from "../../contracts/repositories/automation.js";
import { type ActionRun, executionAllowed } from "../../domain/automation.js";
export function createActionsWorker(deps: {
  store: ActionStore;
  steps: FixedSteps;
  now: () => number;
}) {
  const live = async (lease: ActionLease) => {
    const state = await deps.store.inspect(lease, deps.now());
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
        await deps.store.accept(event, async (rules, insert, id) => {
          for (const rule of rules) {
            if (
              !rule.enabled ||
              rule.kind !== "notify-wbs-baseline" ||
              event.cursor <= rule.enabledAfter
            )
              continue;
            const run: ActionRun = {
              id: id(),
              repositoryId: event.repositoryId,
              rule,
              revisionId: event.revisionId,
              baselineId: event.baselineId,
              status: "queued",
              version: 1,
              step: 0,
              attempt: 0,
              due: deps.now(),
              createdAt: deps.now(),
              results: [],
            };
            await insert(run);
          }
        });
        if (await deps.steps.events.acknowledge(event, deps.now())) events++;
      }
      for (let i = eventClaims; i < limit; i++) {
        const lease = await deps.store.claim(deps.now());
        if (!lease) break;
        claimed++;
        let value: unknown,
          status: ActionRun["status"] = "succeeded",
          advance = true,
          due = deps.now();
        if (!(await live(lease))) {
          status = "failed";
          advance = false;
          value = { reason: "delegation-unavailable" };
        } else
          try {
            const run = lease.run;
            if (run.rule.kind === "check-wbs-revision")
              value = await deps.steps.check(run.rule.delegate, run.repositoryId, run.revisionId);
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
              value = result;
              if (result.nextAt !== null) {
                status = "waiting";
                advance = false;
                due = result.nextAt;
              } else if (run.step + 1 < run.rule.recipients.length) status = "queued";
            }
          } catch {
            status = "failed";
            advance = false;
            value = { reason: "source-or-delivery-unavailable" };
          }
        const saved = await deps.store.finish(lease, deps.now(), (run) => ({
          ...run,
          status,
          version: run.version + 1,
          step: run.step + (advance ? 1 : 0),
          due,
          results: [...run.results.filter((r) => r.step !== run.step), { step: run.step, value }],
        }));
        if (saved) finished++;
        else stale++;
      }
      return { events, claimed, finished, stale };
    },
  };
}
