import type { ActionRule, ActionRun } from "../../domain/automation.js";
export type ActionReceipt = { rule: ActionRule } | { run: ActionRun };
export type ActionLease = Readonly<{ run: ActionRun; token: string; until: number }>;
