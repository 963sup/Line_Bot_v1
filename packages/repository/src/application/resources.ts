import type { RepositorySelector } from "../contracts/selectors.js";
import {
  normalizeRepositoryMilestoneNumber,
  normalizeRepositoryName,
  RepositoryError,
} from "../domain.js";
import { accountLoginForRepositoryLocator } from "./owner-locator.js";
import type {
  RepositoryLabelCursor,
  RepositoryMilestoneCursor,
  RepositoryMilestoneStatus,
  RepositoryResourceStore,
} from "./ports/resources.js";

const maxCursorLength = 240;

function repositorySelector(value: RepositorySelector): RepositorySelector {
  if ("repositoryId" in value) {
    if (!value.repositoryId || value.repositoryId.length > 120) {
      throw new RepositoryError(400, "Repository 識別碼不正確。");
    }
    return value;
  }
  const ownerLogin = accountLoginForRepositoryLocator(value.ownerLogin);
  const repositoryName = normalizeRepositoryName(value.repositoryName);
  if (!ownerLogin || !repositoryName) {
    throw new RepositoryError(400, "Repository 路徑不正確。");
  }
  return {
    ownerLogin,
    repositoryName,
    ...(value.followRenames === false ? { followRenames: false } : {}),
  };
}

function parseJsonCursor(after: string | undefined): Record<string, unknown> | undefined {
  if (after === undefined) return undefined;
  try {
    if (!after || after.length > maxCursorLength) throw new Error();
    const value = JSON.parse(after) as Record<string, unknown>;
    if (!value || typeof value !== "object") throw new Error();
    return value;
  } catch {
    throw new RepositoryError(400, "Repository 分頁不正確，請重新讀取。");
  }
}

function labelCursor(after: string | undefined): RepositoryLabelCursor | undefined {
  const value = parseJsonCursor(after);
  if (!value) return undefined;
  if (typeof value.name !== "string" || !value.name || typeof value.id !== "string" || !value.id) {
    throw new RepositoryError(400, "Repository 分頁不正確，請重新讀取。");
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
    throw new RepositoryError(400, "Repository 分頁不正確，請重新讀取。");
  }
  return { number: Number(value.number), id: value.id };
}

function milestoneStatus(value?: string): RepositoryMilestoneStatus | undefined {
  if (value === undefined) return undefined;
  if (value !== "open" && value !== "closed") {
    throw new RepositoryError(400, "Milestone 狀態不正確。");
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
      if (selectedNumber === null) throw new RepositoryError(400, "Milestone number 不正確。");
      const actor = await identity(subject);
      return deps.store().milestone(actor, selected, selectedNumber);
    },
  };
}
