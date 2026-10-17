export type ProjectWbsBaselineEvent = Readonly<{
  id: string;
  cursor: number;
  projectId: string;
  baselineId: string;
  revisionId: string;
  at: number;
  leaseToken: string;
}>;
export interface ProjectWbsBaselineEvents {
  cursor(projectId: string): Promise<number>;
  claim(now: number): Promise<ProjectWbsBaselineEvent | null>;
  acknowledge(event: ProjectWbsBaselineEvent, now: number): Promise<boolean>;
}
