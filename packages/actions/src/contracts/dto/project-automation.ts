import type { ProjectActionKind, ProjectActionRun } from "../../domain/project-automation.js";

export type ProjectActionRuleDto = Readonly<{
  id: string;
  projectId: string;
  version: number;
  kind: ProjectActionKind;
  recipients: readonly string[];
  enabled: boolean;
  enabledAfter: number;
  delegationId: string;
  delegate: string;
  delegateVersion: number;
}>;
export type ProjectActionRunDto = Readonly<{
  id: string;
  projectId: string;
  rule: ProjectActionRuleDto;
  revisionId: string;
  baselineId: string | null;
  status: ProjectActionRun["status"];
  version: number;
  step: number;
  attempt: number;
  due: number;
  createdAt: number;
  results: readonly Readonly<{ step: number; value: unknown }>[];
}>;
export type ProjectActionReceipt = { rule: ProjectActionRuleDto } | { run: ProjectActionRunDto };
