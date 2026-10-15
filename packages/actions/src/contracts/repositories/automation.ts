import type { ActionRule, ActionRun } from "../../domain/automation.js";

export interface ActionRules {
  list(): Promise<ActionRule[]>;
  load(id: string): Promise<ActionRule | null>;
  save(rule: ActionRule, expectedVersion: number): Promise<void>;
}
export interface ActionRuns {
  load(id: string): Promise<ActionRun | null>;
  save(run: ActionRun, expectedVersion: number, at: number): Promise<void>;
}
