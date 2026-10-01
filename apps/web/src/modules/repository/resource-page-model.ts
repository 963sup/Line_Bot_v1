import type {
  DiscussionResult,
  DiscussionsResult,
} from "@line_bot_v1/discussion/contracts/discussions";
import type {
  RepositoryLabelsResult,
  RepositoryMilestoneResult,
  RepositoryMilestonesResult,
} from "@line_bot_v1/repository/application/ports/resources";

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

export function parseRepositoryResourcePage(kind: ResourcesKind, value: unknown): PageData {
  if (!isRecord(value) || !isRecord(value.repository)) {
    throw { status: 503, message: "Repository 資源回應格式不正確。" };
  }
  if (kind === "discussions" && Array.isArray(value.discussions)) {
    return { ...(value as DiscussionsResult), kind };
  }
  if (kind === "discussion" && isRecord(value.discussion) && Array.isArray(value.comments)) {
    return { ...(value as DiscussionResult), kind };
  }
  if (kind === "labels" && Array.isArray(value.labels)) {
    return { ...(value as RepositoryLabelsResult), kind };
  }
  if (kind === "milestones" && Array.isArray(value.milestones)) {
    return { ...(value as RepositoryMilestonesResult), kind };
  }
  if (kind === "milestone" && isRecord(value.milestone)) {
    return { ...(value as RepositoryMilestoneResult), kind };
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
  milestoneNumber,
  milestoneStatus,
  after,
}: {
  ownerLogin: string;
  repositoryName: string;
  kind: ResourcesKind;
  discussionId?: string;
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
