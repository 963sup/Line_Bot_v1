import type { WbsBaselineEvent } from "@line_bot_v1/wbs/contracts/output/baseline-events";
import type { ActionRule, ActionRun, ActionScope } from "../../domain/automation.js";

export type ActionLease = Readonly<{ run: ActionRun; token: string; until: number }>;
export interface ActionRunQueue {
  accept(
    event: WbsBaselineEvent,
    work: (
      rules: ActionRule[],
      insert: (run: ActionRun) => Promise<void>,
      id: () => string,
    ) => Promise<void>,
  ): Promise<void>;
  claim(now: number): Promise<ActionLease | null>;
  inspect(
    lease: ActionLease,
    now: number,
  ): Promise<{ run: ActionRun; rule: ActionRule | null; scope: ActionScope | null } | null>;
  finish(lease: ActionLease, now: number, work: (run: ActionRun) => ActionRun): Promise<boolean>;
}
