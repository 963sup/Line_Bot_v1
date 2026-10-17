import type { ProjectActionRule, ProjectActionRun } from "../../domain/project-automation.js";

export interface ProjectActionRules {
  list(): Promise<ProjectActionRule[]>;
  load(id: string): Promise<ProjectActionRule | null>;
  save(rule: ProjectActionRule, expectedVersion: number): Promise<void>;
}
export interface ProjectActionRuns {
  load(id: string): Promise<ProjectActionRun | null>;
  save(run: ProjectActionRun, expectedVersion: number, at: number): Promise<void>;
}
