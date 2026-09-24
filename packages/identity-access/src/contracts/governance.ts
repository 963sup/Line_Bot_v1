export type VerifiedLineActor = Readonly<{ provider: string; subject: string }>;

export type GovernanceQuery = Readonly<{ id?: string; after?: string }>;

export type GovernanceSubjectKind =
  | "user"
  | "organization"
  | "organization-team"
  | "enterprise-team";

export type GovernanceReceipt = Readonly<{
  requestId: string;
  action: string;
  scopeId: string;
  subjectKind: GovernanceSubjectKind | null;
  subjectId: string | null;
  status: string;
  version: number;
  at: number;
}>;
