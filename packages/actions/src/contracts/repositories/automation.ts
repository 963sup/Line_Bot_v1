import type { WbsBaselineEvent } from "@line_bot_v1/wbs/contracts/output/baseline-events";
import type { ActionRule, ActionRun, ActionScope } from "../../domain/automation.js";
import type { ActionLease, ActionReceipt } from "../dto/automation.js";
export interface ActionTransaction {
  scope: ActionScope;
  id(): string;
  cursor(): Promise<number>;
  replay(requestId: string, fingerprint: string): Promise<ActionReceipt | null>;
  receipt(
    requestId: string,
    fingerprint: string,
    result: ActionReceipt,
    now: number,
  ): Promise<void>;
  rules(): Promise<ActionRule[]>;
  rule(id: string): Promise<ActionRule | null>;
  saveRule(rule: ActionRule): Promise<void>;
  run(id: string): Promise<ActionRun | null>;
  saveRun(run: ActionRun, at: number): Promise<void>;
}
export interface ActionStore {
  transact<T>(
    userId: string,
    repositoryId: string,
    work: (tx: ActionTransaction) => Promise<T>,
  ): Promise<T>;
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
