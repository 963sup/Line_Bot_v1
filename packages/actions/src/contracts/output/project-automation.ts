import type {
  ProjectActionRule,
  ProjectActionRun,
  ProjectActionScope,
} from "../../domain/project-automation.js";
import type { ProjectActionRules, ProjectActionRuns } from "../repositories/project-automation.js";

export type ProjectActionRecord = { rule: ProjectActionRule } | { run: ProjectActionRun };
export interface ProjectActionTransaction {
  readonly scope: ProjectActionScope;
  readonly rules: ProjectActionRules;
  readonly runs: ProjectActionRuns;
  id(): string;
  cursor(): Promise<number>;
  replay(requestId: string, fingerprint: string): Promise<ProjectActionRecord | null>;
  receipt(
    requestId: string,
    fingerprint: string,
    result: ProjectActionRecord,
    now: number,
  ): Promise<void>;
}
export interface ProjectActionTransactions {
  transact<T>(
    userId: string,
    projectId: string,
    work: (tx: ProjectActionTransaction) => Promise<T>,
  ): Promise<T>;
}
