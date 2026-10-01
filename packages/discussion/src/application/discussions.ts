import { normalizeAccountLogin } from "@line_bot_v1/namespace";
import { normalizeRepositoryName } from "@line_bot_v1/repository/domain";
import type {
  DiscussionCursor,
  DiscussionReadStore,
  RepositorySelector,
} from "../contracts/output/discussion-read.js";
import { DiscussionError, normalizeDiscussionId } from "../domain.js";

const maxCursorLength = 240;

function accountLoginForRepositoryLocator(value: string): string | null {
  try {
    return normalizeAccountLogin(value);
  } catch {
    return null;
  }
}

function repositorySelector(value: RepositorySelector): RepositorySelector {
  if ("repositoryId" in value) {
    if (!value.repositoryId || value.repositoryId.length > 120) {
      throw new DiscussionError(400, "Repository 識別碼不正確。");
    }
    return value;
  }
  const ownerLogin = accountLoginForRepositoryLocator(value.ownerLogin);
  const repositoryName = normalizeRepositoryName(value.repositoryName);
  if (!ownerLogin || !repositoryName) {
    throw new DiscussionError(400, "Repository 路徑不正確。");
  }
  return { ownerLogin, repositoryName };
}

function cursor(after: string | undefined): DiscussionCursor | undefined {
  if (after === undefined) return undefined;
  try {
    if (!after || after.length > maxCursorLength) throw new Error();
    const value = JSON.parse(after) as Record<string, unknown>;
    if (
      !Number.isSafeInteger(value.at) ||
      Number(value.at) < 0 ||
      typeof value.id !== "string" ||
      !value.id
    ) {
      throw new Error();
    }
    return { at: Number(value.at), id: value.id };
  } catch {
    throw new DiscussionError(400, "Repository 分頁不正確，請重新讀取。");
  }
}

export function createDiscussions(deps: {
  activeUser(subject: string): Promise<{ id: string }>;
  store(): DiscussionReadStore;
}) {
  async function identity(subject: string) {
    return { userId: (await deps.activeUser(subject)).id };
  }
  return {
    list: async (subject: string, selector: RepositorySelector, after?: string) => {
      const selected = repositorySelector(selector);
      const page = cursor(after);
      const actor = await identity(subject);
      return deps.store().list(actor, selected, page);
    },
    detail: async (
      subject: string,
      selector: RepositorySelector,
      discussionId: string,
      commentsAfter?: string,
    ) => {
      const selected = repositorySelector(selector);
      const id = normalizeDiscussionId(discussionId);
      if (id === null) throw new DiscussionError(400, "Discussion 識別碼不正確。");
      const page = cursor(commentsAfter);
      const actor = await identity(subject);
      return deps.store().detail(actor, selected, id, page);
    },
  };
}
