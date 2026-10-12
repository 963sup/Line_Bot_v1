import type {
  DiscussionResult,
  DiscussionsResult,
} from "@line_bot_v1/discussion/contracts/discussions";
import type {
  RepositoryLabelsResult,
  RepositoryMilestoneResult,
  RepositoryMilestonesResult,
} from "@line_bot_v1/repository/contracts/output/resources";

export type ResourcesKind = "discussions" | "discussion" | "labels" | "milestones" | "milestone";
export type MilestoneStatus = "open" | "closed";

export type PageData =
  | ({ kind: "discussions" } & DiscussionsResult)
  | ({ kind: "discussion" } & DiscussionResult)
  | ({ kind: "labels" } & RepositoryLabelsResult)
  | ({ kind: "milestones" } & RepositoryMilestonesResult)
  | ({ kind: "milestone" } & RepositoryMilestoneResult);

export type ResourceError = { message: string; status: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const permissionValues = new Set(["read", "triage", "triage_plus", "write", "maintain", "admin"]);

function isRepository(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.ownerLogin === "string" &&
    typeof value.name === "string" &&
    Array.isArray(value.permissions) &&
    value.permissions.every(
      (permission) => typeof permission === "string" && permissionValues.has(permission),
    )
  );
}

function isNullableString(value: unknown) {
  return value === null || typeof value === "string";
}

function isDiscussionSummary(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.repositoryId === "string" &&
    (value.number === null || Number.isSafeInteger(value.number)) &&
    typeof value.author === "string" &&
    typeof value.title === "string" &&
    typeof value.category === "string" &&
    isNullableString(value.categoryId) &&
    (value.state === "OPEN" || value.state === "CLOSED") &&
    (value.stateReason === null ||
      value.stateReason === "DUPLICATE" ||
      value.stateReason === "OUTDATED" ||
      value.stateReason === "REOPENED" ||
      value.stateReason === "RESOLVED") &&
    typeof value.locked === "boolean" &&
    (value.lockReason === null ||
      value.lockReason === "OFF_TOPIC" ||
      value.lockReason === "RESOLVED" ||
      value.lockReason === "SPAM" ||
      value.lockReason === "TOO_HEATED") &&
    typeof value.deleted === "boolean" &&
    Number.isSafeInteger(value.version) &&
    typeof value.createdAt === "number" &&
    typeof value.updatedAt === "number"
  );
}

function isDiscussion(value: unknown) {
  return isDiscussionSummary(value) && "body" in value && isNullableString(value.body);
}

function isDiscussionComment(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.discussionId === "string" &&
    typeof value.author === "string" &&
    isNullableString(value.body) &&
    isNullableString(value.replyToId) &&
    typeof value.deleted === "boolean" &&
    Number.isSafeInteger(value.version) &&
    typeof value.createdAt === "number" &&
    typeof value.updatedAt === "number"
  );
}

function isLabel(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.repositoryId === "string" &&
    typeof value.name === "string" &&
    typeof value.color === "string" &&
    typeof value.description === "string" &&
    Number.isSafeInteger(value.version)
  );
}

function isMilestone(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.repositoryId === "string" &&
    Number.isSafeInteger(value.number) &&
    typeof value.title === "string" &&
    typeof value.description === "string" &&
    (value.status === "open" || value.status === "closed") &&
    (value.dueAt === null || typeof value.dueAt === "number") &&
    Number.isSafeInteger(value.version) &&
    typeof value.createdAt === "number" &&
    typeof value.updatedAt === "number"
  );
}

function hasNext(value: Record<string, unknown>) {
  return value.next === null || typeof value.next === "string";
}

function isDiscussionsResult(value: unknown): value is DiscussionsResult {
  return (
    isRecord(value) &&
    isRepository(value.repository) &&
    Array.isArray(value.discussions) &&
    value.discussions.every(isDiscussionSummary) &&
    hasNext(value)
  );
}

function isDiscussionResult(value: unknown): value is DiscussionResult {
  return (
    isRecord(value) &&
    isRepository(value.repository) &&
    isDiscussion(value.discussion) &&
    Array.isArray(value.comments) &&
    value.comments.every(isDiscussionComment) &&
    hasNext(value)
  );
}

function isLabelsResult(value: unknown): value is RepositoryLabelsResult {
  return (
    isRecord(value) &&
    isRepository(value.repository) &&
    Array.isArray(value.labels) &&
    value.labels.every(isLabel) &&
    hasNext(value)
  );
}

function isMilestonesResult(value: unknown): value is RepositoryMilestonesResult {
  return (
    isRecord(value) &&
    isRepository(value.repository) &&
    Array.isArray(value.milestones) &&
    value.milestones.every(isMilestone) &&
    hasNext(value)
  );
}

function isMilestoneResult(value: unknown): value is RepositoryMilestoneResult {
  return isRecord(value) && isRepository(value.repository) && isMilestone(value.milestone);
}

export function parseRepositoryResourcePage(kind: ResourcesKind, value: unknown): PageData {
  if (!isRecord(value) || !isRecord(value.repository)) {
    throw { status: 503, message: "Repository 資源回應格式不正確。" };
  }
  if (kind === "discussions" && isDiscussionsResult(value)) {
    return { ...value, kind };
  }
  if (kind === "discussion" && isDiscussionResult(value)) {
    return { ...value, kind };
  }
  if (kind === "labels" && isLabelsResult(value)) {
    return { ...value, kind };
  }
  if (kind === "milestones" && isMilestonesResult(value)) {
    return { ...value, kind };
  }
  if (kind === "milestone" && isMilestoneResult(value)) {
    return { ...value, kind };
  }
  throw { status: 503, message: "Repository 資源回應格式不正確。" };
}

function mergeById<T extends { id: string }>(current: T[], incoming: T[]) {
  const seen = new Set(current.map((item) => item.id));
  return [...current, ...incoming.filter((item) => !seen.has(item.id))];
}

export function mergeRepositoryResourcePage(
  current: PageData | null,
  incoming: PageData,
  append: boolean,
): PageData {
  if (!append || !current || current.kind !== incoming.kind) return incoming;
  if (current.kind === "discussions" && incoming.kind === "discussions") {
    return { ...incoming, discussions: mergeById(current.discussions, incoming.discussions) };
  }
  if (current.kind === "labels" && incoming.kind === "labels") {
    return { ...incoming, labels: mergeById(current.labels, incoming.labels) };
  }
  if (current.kind === "milestones" && incoming.kind === "milestones") {
    return { ...incoming, milestones: mergeById(current.milestones, incoming.milestones) };
  }
  if (current.kind === "discussion" && incoming.kind === "discussion") {
    return { ...incoming, comments: mergeById(current.comments, incoming.comments) };
  }
  return incoming;
}

export function repositoryResourcesEndpoint({
  ownerLogin,
  repositoryName,
  kind,
  discussionId,
  discussionNumber,
  milestoneNumber,
  milestoneStatus,
  after,
}: {
  ownerLogin: string;
  repositoryName: string;
  kind: ResourcesKind;
  discussionId?: string;
  discussionNumber?: number;
  milestoneNumber?: number;
  milestoneStatus: MilestoneStatus;
  after?: string;
}) {
  const query = new URLSearchParams({ owner: ownerLogin, name: repositoryName });
  if (after) {
    if (kind === "discussion") query.set("commentsAfter", after);
    else query.set("after", after);
  }
  if (kind === "milestones") query.set("status", milestoneStatus);
  if (kind === "discussion" && discussionNumber) {
    return `/api/discussions/by-number/${encodeURIComponent(String(discussionNumber))}?${query}`;
  }
  if (kind === "discussion" && discussionId) {
    return `/api/discussions/${encodeURIComponent(discussionId)}?${query}`;
  }
  if (kind === "labels") return `/api/repository-labels?${query}`;
  if (kind === "milestones") return `/api/repository-milestones?${query}`;
  if (kind === "milestone" && milestoneNumber) {
    return `/api/repository-milestones/${encodeURIComponent(String(milestoneNumber))}?${query}`;
  }
  return `/api/discussions?${query}`;
}
