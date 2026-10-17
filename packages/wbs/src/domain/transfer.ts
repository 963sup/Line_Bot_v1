import { WbsError } from "./document.js";

const wbsScopeTransferStates = ["REQUESTED", "ACTIVE", "CANCELLED"] as const;
export type WbsScopeTransferState = (typeof wbsScopeTransferStates)[number];

export type WbsTransferSourceFacts = Readonly<{
  repositoryId: string;
  ownerAccountId: string;
  ownerKind: "USER" | "ORGANIZATION";
  visibility: "private" | "internal" | "public";
  archived: boolean;
  permissions: readonly string[];
}>;

export type WbsTransferProjectFacts = Readonly<{
  projectId: string;
  ownerAccountId: string;
  ownerKind: "USER" | "ORGANIZATION";
  role: "READ" | "WRITE" | "ADMIN";
  public: boolean;
  closed: boolean;
  hasCollaboratorGrants: boolean;
}>;

export type WbsTransferSnapshot = Readonly<{
  sourceVersion: number;
  sourceHeadRevisionId: string;
  revisionCount: number;
  commandCount: number;
  sourceHash: string;
}>;

export type WbsTransferDependentCounts = Readonly<{
  repositoryWbsRows: number;
  sourceRepositoryWbsRows: number;
  governanceRows: number;
  outboxRows: number;
  actionRows: number;
  notificationRows: number;
}>;

export function assertWbsTransferRequestFacts(
  actorUserId: string,
  source: WbsTransferSourceFacts,
  project: WbsTransferProjectFacts,
): void {
  if (
    source.ownerKind !== "USER" ||
    source.ownerAccountId !== actorUserId ||
    source.archived ||
    !source.permissions.includes("admin") ||
    source.visibility !== "public"
  )
    throw new WbsError(403, "只有公開來源 Repository 的 User owner 可移轉 WBS。");
  if (
    project.ownerKind !== "USER" ||
    project.ownerAccountId !== actorUserId ||
    project.role !== "ADMIN"
  )
    throw new WbsError(403, "目標 Project 必須由同一 User owner 管理。");
  if (project.public || project.closed || project.hasCollaboratorGrants)
    throw new WbsError(409, "目標 Project 必須是開放中的私人 Project。");
}

export function assertWbsTransferSourceOwner(
  actorUserId: string,
  source: WbsTransferSourceFacts,
): void {
  if (
    source.ownerKind !== "USER" ||
    source.ownerAccountId !== actorUserId ||
    !source.permissions.includes("admin")
  )
    throw new WbsError(403, "只有來源 Repository 的 User owner 可撤回 WBS 移轉。");
}

export function assertWbsTransferSnapshot(
  expectedVersion: number,
  expectedHeadRevisionId: string,
  snapshot: WbsTransferSnapshot,
): void {
  if (
    snapshot.sourceVersion !== expectedVersion ||
    snapshot.sourceHeadRevisionId !== expectedHeadRevisionId
  )
    throw new WbsError(409, "來源 WBS 已變更，請重新建立移轉請求。");
  if (
    snapshot.sourceVersion < 1 ||
    snapshot.revisionCount !== snapshot.sourceVersion ||
    snapshot.commandCount !== snapshot.sourceVersion
  )
    throw new WbsError(409, "來源 WBS 歷史或回執不完整，不能移轉。");
}

export function assertWbsTransferDependenciesEmpty(counts: WbsTransferDependentCounts): void {
  if (counts.repositoryWbsRows !== 1 || counts.sourceRepositoryWbsRows !== 1)
    throw new WbsError(409, "來源必須是唯一的 legacy Repository WBS，不能略過其他資料。");
  if (
    counts.governanceRows !== 0 ||
    counts.outboxRows !== 0 ||
    counts.actionRows !== 0 ||
    counts.notificationRows !== 0
  )
    throw new WbsError(409, "來源 WBS 仍有治理、事件、自動化或通知資料，不能移轉。");
}

export function assertTrustedReleaseContext(context: {
  currentMainSha: string;
  deployedSha: string;
  providerRecoveryReady: boolean;
}): string {
  if (
    !context.providerRecoveryReady ||
    !/^[0-9a-f]{40}$/i.test(context.currentMainSha) ||
    context.currentMainSha !== context.deployedSha
  )
    throw new WbsError(409, "目前 main、部署版本或 provider recovery 尚未就緒。");
  return context.currentMainSha.toLowerCase();
}
