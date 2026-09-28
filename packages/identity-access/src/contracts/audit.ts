import type { GovernanceSubjectKind, VerifiedLineActor } from "./governance.js";

export type GovernanceAuditQuery = Readonly<{
  scopeKind: "enterprise" | "organization";
  scopeId: string;
  before?: Readonly<{ at: number; id: string }>;
  limit: number;
}>;

export type GovernanceAuditEvent = Readonly<{
  id: string;
  actorUserId: string;
  action: string;
  scopeKind: "enterprise" | "organization";
  scopeId: string;
  subjectKind: GovernanceSubjectKind | null;
  subjectId: string | null;
  requestId: string;
  occurredAt: number;
  outcome: string;
  version: number;
}>;

export interface GovernanceAuditReader {
  read(actor: VerifiedLineActor, query: GovernanceAuditQuery): Promise<GovernanceAuditEvent[]>;
}
