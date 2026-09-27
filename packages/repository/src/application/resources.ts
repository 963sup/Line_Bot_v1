import {
  IssueError,
  normalizeDiscussionId,
  normalizeRepositoryMilestoneNumber,
  normalizeRepositoryName,
} from "../domain.js";
import type {
  RepositoryLabelCursor,
  RepositoryMilestoneCursor,
  RepositoryMilestoneStatus,
  RepositoryResourceCursor,
  RepositoryResourceStore,
} from "./ports/resources.js";
import type { RepositorySelector } from "./ports/selectors.js";

const maxCursorLength = 240;

function repositorySelector(value: RepositorySelector): RepositorySelector {
  if ("repositoryId" in value) {
    if (!value.repositoryId || value.repositoryId.length > 120) {
      throw new IssueError(400, "Repository 識別碼不正確。");
    }
    return value;
  }
  const repositoryName = normalizeRepositoryName(value.repositoryName);
  if (!value.ownerLogin || !repositoryName) {
    throw new IssueError(400, "Repository 路徑不正確。");
  }
  return { ownerLogin: value.ownerLogin, repositoryName };
}

function parseJsonCursor(after: string | undefined): Record<string, unknown> | undefined {
  if (after === undefined) return undefined;
  try {
    if (!after || after.length > maxCursorLength) throw new Error();
    const value = JSON.parse(after) as Record<string, unknown>;
    if (!value || typeof value !== "object") throw new Error();
    return value;
  } catch {
    throw new IssueError(400, "Repository 分頁不正確，請重新讀取。");
  }
}

function resourceCursor(after: string | undefined): RepositoryResourceCursor | undefined {
  const value = parseJsonCursor(after);
  if (!value) return undefined;
  if (
    !Number.isSafeInteger(value.at) ||
    Number(value.at) < 0 ||
    typeof value.id !== "string" ||
    !value.id
  ) {
    throw new IssueError(400, "Repository 分頁不正確，請重新讀取。");
  }
  return { at: Number(value.at), id: value.id };
}

function labelCursor(after: string | undefined): RepositoryLabelCursor | undefined {
  const value = parseJsonCursor(after);
  if (!value) return undefined;
  if (typeof value.name !== "string" || !value.name || typeof value.id !== "string" || !value.id) {
    throw new IssueError(400, "Repository 分頁不正確，請重新讀取。");
  }
  return { name: value.name, id: value.id };
}

function milestoneCursor(after: string | undefined): RepositoryMilestoneCursor | undefined {
  const value = parseJsonCursor(after);
  if (!value) return undefined;
  if (
    !Number.isSafeInteger(value.number) ||
    Number(value.number) < 1 ||
    typeof value.id !== "string" ||
    !value.id
  ) {
    throw new IssueError(400, "Repository 分頁不正確，請重新讀取。");
  }
  return { number: Number(value.number), id: value.id };
}

function milestoneStatus(value?: string): RepositoryMilestoneStatus | undefined {
  if (value === undefined) return undefined;
  if (value !== "open" && value !== "closed") {
    throw new IssueError(400, "Milestone 狀態不正確。");
  }
  return value;
}

export function createRepositoryResources(deps: {
  activeUser(subject: string): Promise<{ id: string }>;
  store(): RepositoryResourceStore;
}) {
  async function identity(subject: string) {
    return { userId: (await deps.activeUser(subject)).id };
  }
  return {
    discussions: async (subject: string, selector: RepositorySelector, after?: string) => {
      const selected = repositorySelector(selector);
      const cursor = resourceCursor(after);
      const actor = await identity(subject);
      return deps.store().discussions(actor, selected, cursor);
    },
    discussion: async (
      subject: string,
      selector: RepositorySelector,
      id: string,
      commentsAfter?: string,
    ) => {
      const selected = repositorySelector(selector);
      const selectedDiscussionId = normalizeDiscussionId(id);
      if (selectedDiscussionId === null) {
        throw new IssueError(400, "Discussion 識別碼不正確。");
      }
      const cursor = resourceCursor(commentsAfter);
      const actor = await identity(subject);
      return deps.store().discussion(actor, selected, selectedDiscussionId, cursor);
    },
    labels: async (subject: string, selector: RepositorySelector, after?: string) => {
      const selected = repositorySelector(selector);
      const cursor = labelCursor(after);
      const actor = await identity(subject);
      return deps.store().labels(actor, selected, cursor);
    },
    milestones: async (
      subject: string,
      selector: RepositorySelector,
      status?: string,
      after?: string,
    ) => {
      const selected = repositorySelector(selector);
      const selectedStatus = milestoneStatus(status);
      const cursor = milestoneCursor(after);
      const actor = await identity(subject);
      return deps.store().milestones(actor, selected, selectedStatus, cursor);
    },
    milestone: async (subject: string, selector: RepositorySelector, number: number) => {
      const selected = repositorySelector(selector);
      const selectedNumber = normalizeRepositoryMilestoneNumber(number);
      if (selectedNumber === null) throw new IssueError(400, "Milestone number 不正確。");
      const actor = await identity(subject);
      return deps.store().milestone(actor, selected, selectedNumber);
    },
  };
}
