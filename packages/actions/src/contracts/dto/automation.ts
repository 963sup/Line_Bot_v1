import type { ActionKind, ActionRun } from "../../domain/automation.js";

export type ActionRuleDto = Readonly<{
  id: string;
  repositoryId: string;
  version: number;
  kind: ActionKind;
  recipients: readonly string[];
  enabled: boolean;
  enabledAfter: number;
  delegationId: string;
  delegate: string;
  delegateVersion: number;
}>;
export type ActionRunDto = Readonly<{
  id: string;
  repositoryId: string;
  rule: ActionRuleDto;
  revisionId: string;
  baselineId: string | null;
  status: ActionRun["status"];
  version: number;
  step: number;
  attempt: number;
  due: number;
  createdAt: number;
  results: readonly Readonly<{ step: number; value: unknown }>[];
}>;
export type ActionReceipt = { rule: ActionRuleDto } | { run: ActionRunDto };
