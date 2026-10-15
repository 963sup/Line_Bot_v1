import type { ActionRule, ActionRun, ActionScope } from "../../domain/automation.js";
import type { ActionRules, ActionRuns } from "../repositories/automation.js";

export type ActionRecord = { rule: ActionRule } | { run: ActionRun };
export interface ActionTransaction {
  readonly scope: ActionScope;
  readonly rules: ActionRules;
  readonly runs: ActionRuns;
  id(): string;
  cursor(): Promise<number>;
  replay(requestId: string, fingerprint: string): Promise<ActionRecord | null>;
  receipt(requestId: string, fingerprint: string, result: ActionRecord, now: number): Promise<void>;
}
export interface ActionTransactions {
  transact<T>(
    userId: string,
    repositoryId: string,
    work: (tx: ActionTransaction) => Promise<T>,
  ): Promise<T>;
}
