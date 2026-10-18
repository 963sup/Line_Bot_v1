import type { ProjectWbsBaselineEvent } from "@line_bot_v1/wbs/contracts/output/project-baseline-events";
import type {
  ProjectActionRule,
  ProjectActionRun,
  ProjectActionScope,
} from "../../domain/project-automation.js";

export type ProjectActionLease = Readonly<{ run: ProjectActionRun; token: string; until: number }>;
export interface ProjectActionRunQueue {
  accept(
    event: ProjectWbsBaselineEvent,
    work: (
      rules: ProjectActionRule[],
      insert: (run: ProjectActionRun) => Promise<void>,
      id: () => string,
    ) => Promise<void>,
  ): Promise<void>;
  claim(now: number): Promise<ProjectActionLease | null>;
  inspect(
    lease: ProjectActionLease,
    now: number,
  ): Promise<{
    run: ProjectActionRun;
    rule: ProjectActionRule | null;
    scope: ProjectActionScope | null;
  } | null>;
  finish(
    lease: ProjectActionLease,
    now: number,
    work: (run: ProjectActionRun) => ProjectActionRun,
  ): Promise<boolean>;
}
