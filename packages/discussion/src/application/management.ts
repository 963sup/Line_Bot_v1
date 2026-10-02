import type {
  DiscussionManagementCommand,
  DiscussionManagementStore,
} from "../contracts/management.js";
import type { DiscussionCloseReason, DiscussionLockReason } from "../domain.js";
import { DiscussionError } from "../domain.js";

const requestIdPattern = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const closeReasons: readonly DiscussionCloseReason[] = ["DUPLICATE", "OUTDATED", "RESOLVED"];
const lockReasons: readonly DiscussionLockReason[] = [
  "OFF_TOPIC",
  "RESOLVED",
  "SPAM",
  "TOO_HEATED",
];

function objectInput(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new DiscussionError(400, "Discussion 操作格式不正確。");
  }
  return raw as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new DiscussionError(400, "Discussion 操作含有未知欄位。");
  }
}

function id(value: unknown, label: string): string {
  if (typeof value !== "string" || !value || value !== value.trim() || value.length > 128) {
    throw new DiscussionError(400, `${label} 不正確。`);
  }
  return value;
}

function text(value: unknown, label: string, max: number, allowEmpty = false): string {
  if (typeof value !== "string") throw new DiscussionError(400, `${label} 不正確。`);
  const normalized = value.trim();
  if ((!allowEmpty && !normalized) || normalized.length > max) {
    throw new DiscussionError(400, `${label} 不正確。`);
  }
  return normalized;
}

function version(value: unknown, create = false): number {
  if (!Number.isSafeInteger(value) || Number(value) < (create ? 0 : 1)) {
    throw new DiscussionError(400, "Discussion 版本不正確。");
  }
  const normalized = Number(value);
  if (create && normalized !== 0) {
    throw new DiscussionError(400, "建立操作必須從版本 0 開始。");
  }
  return normalized;
}

function base(value: Record<string, unknown>) {
  if (typeof value.requestId !== "string" || !requestIdPattern.test(value.requestId)) {
    throw new DiscussionError(400, "Discussion 請求編號不正確。");
  }
  return {
    requestId: value.requestId.toLowerCase(),
    repositoryId: id(value.repositoryId, "Repository 識別碼"),
  };
}

function existing(value: Record<string, unknown>) {
  return {
    ...base(value),
    discussionId: id(value.discussionId, "Discussion 識別碼"),
    expectedVersion: version(value.expectedVersion),
  };
}

function ids(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || !value.length) {
    throw new DiscussionError(400, `${label} 不可為空。`);
  }
  return [...new Set(value.map((item) => id(item, label)))].sort((left, right) =>
    left.localeCompare(right),
  );
}

function pollOptions(value: unknown): string[] {
  if (!Array.isArray(value)) throw new DiscussionError(400, "Poll options 格式不正確。");
  const options = value.map((item) => text(item, "Poll option", 200));
  if (options.length < 2 || options.length > 10 || new Set(options).size !== options.length) {
    throw new DiscussionError(400, "Poll 需要 2 到 10 個不重複選項。");
  }
  return options;
}

function parseCommand(raw: unknown): DiscussionManagementCommand {
  const value = objectInput(raw);
  const action = value.action;

  if (action === "create-category") {
    exactKeys(value, [
      "action",
      "requestId",
      "repositoryId",
      "expectedVersion",
      "name",
      "slug",
      "description",
      "emoji",
      "isAnswerable",
    ]);
    const slug = text(value.slug, "Category slug", 120).toLowerCase();
    if (!slugPattern.test(slug)) throw new DiscussionError(400, "Category slug 不正確。");
    if (typeof value.isAnswerable !== "boolean") {
      throw new DiscussionError(400, "Category answerable 設定不正確。");
    }
    return {
      ...base(value),
      action,
      expectedVersion: version(value.expectedVersion, true) as 0,
      name: text(value.name, "Category 名稱", 120),
      slug,
      description: text(value.description ?? "", "Category 描述", 500, true),
      emoji: text(value.emoji ?? "", "Category emoji", 32, true),
      isAnswerable: value.isAnswerable,
    };
  }

  if (action === "update-category") {
    exactKeys(value, [
      "action",
      "requestId",
      "repositoryId",
      "categoryId",
      "expectedVersion",
      "name",
      "description",
      "emoji",
      "isAnswerable",
    ]);
    const name = value.name === undefined ? undefined : text(value.name, "Category 名稱", 120);
    const description =
      value.description === undefined
        ? undefined
        : text(value.description, "Category 描述", 500, true);
    const emoji =
      value.emoji === undefined ? undefined : text(value.emoji, "Category emoji", 32, true);
    let isAnswerable: boolean | undefined;
    if (value.isAnswerable !== undefined) {
      if (typeof value.isAnswerable !== "boolean") {
        throw new DiscussionError(400, "Category answerable 設定不正確。");
      }
      isAnswerable = value.isAnswerable;
    }
    if (
      name === undefined &&
      description === undefined &&
      emoji === undefined &&
      isAnswerable === undefined
    ) {
      throw new DiscussionError(400, "Category 修改至少需要一個欄位。");
    }
    return {
      ...base(value),
      action,
      categoryId: id(value.categoryId, "Category 識別碼"),
      expectedVersion: version(value.expectedVersion),
      ...(name === undefined ? {} : { name }),
      ...(description === undefined ? {} : { description }),
      ...(emoji === undefined ? {} : { emoji }),
      ...(isAnswerable === undefined ? {} : { isAnswerable }),
    };
  }

  if (action === "delete-category") {
    exactKeys(value, ["action", "requestId", "repositoryId", "categoryId", "expectedVersion"]);
    return {
      ...base(value),
      action,
      categoryId: id(value.categoryId, "Category 識別碼"),
      expectedVersion: version(value.expectedVersion),
    };
  }

  if (action === "create-discussion") {
    exactKeys(value, [
      "action",
      "requestId",
      "repositoryId",
      "expectedVersion",
      "categoryId",
      "title",
      "body",
    ]);
    return {
      ...base(value),
      action,
      expectedVersion: version(value.expectedVersion, true) as 0,
      categoryId: id(value.categoryId, "Category 識別碼"),
      title: text(value.title, "Discussion title", 160),
      body: text(value.body, "Discussion body", 20_000),
    };
  }

  const current = existing(value);
  if (action === "adopt-discussion") {
    exactKeys(value, [
      "action",
      "requestId",
      "repositoryId",
      "discussionId",
      "expectedVersion",
      "categoryId",
    ]);
    return { ...current, action, categoryId: id(value.categoryId, "Category 識別碼") };
  }

  if (action === "update-discussion") {
    exactKeys(value, [
      "action",
      "requestId",
      "repositoryId",
      "discussionId",
      "expectedVersion",
      "title",
      "body",
      "categoryId",
    ]);
    const title =
      value.title === undefined ? undefined : text(value.title, "Discussion title", 160);
    const body = value.body === undefined ? undefined : text(value.body, "Discussion body", 20_000);
    const categoryId =
      value.categoryId === undefined ? undefined : id(value.categoryId, "Category 識別碼");
    if (title === undefined && body === undefined && categoryId === undefined) {
      throw new DiscussionError(400, "Discussion 修改至少需要一個欄位。");
    }
    return {
      ...current,
      action,
      ...(title === undefined ? {} : { title }),
      ...(body === undefined ? {} : { body }),
      ...(categoryId === undefined ? {} : { categoryId }),
    };
  }

  if (action === "close-discussion") {
    exactKeys(value, [
      "action",
      "requestId",
      "repositoryId",
      "discussionId",
      "expectedVersion",
      "stateReason",
    ]);
    const reason = value.stateReason;
    if (reason !== null && !closeReasons.includes(reason as DiscussionCloseReason)) {
      throw new DiscussionError(400, "Discussion close reason 不正確。");
    }
    return { ...current, action, stateReason: reason as DiscussionCloseReason | null };
  }

  if (
    action === "reopen-discussion" ||
    action === "delete-discussion" ||
    action === "clear-labels"
  ) {
    exactKeys(value, ["action", "requestId", "repositoryId", "discussionId", "expectedVersion"]);
    return { ...current, action };
  }

  if (action === "add-comment") {
    exactKeys(value, [
      "action",
      "requestId",
      "repositoryId",
      "discussionId",
      "expectedVersion",
      "body",
      "replyToId",
    ]);
    return {
      ...current,
      action,
      body: text(value.body, "Discussion comment", 20_000),
      replyToId:
        value.replyToId === null || value.replyToId === undefined
          ? null
          : id(value.replyToId, "Reply comment 識別碼"),
    };
  }

  if (action === "edit-comment") {
    exactKeys(value, [
      "action",
      "requestId",
      "repositoryId",
      "discussionId",
      "expectedVersion",
      "commentId",
      "commentVersion",
      "body",
    ]);
    return {
      ...current,
      action,
      commentId: id(value.commentId, "Comment 識別碼"),
      commentVersion: version(value.commentVersion),
      body: text(value.body, "Discussion comment", 20_000),
    };
  }

  if (action === "delete-comment") {
    exactKeys(value, [
      "action",
      "requestId",
      "repositoryId",
      "discussionId",
      "expectedVersion",
      "commentId",
      "commentVersion",
    ]);
    return {
      ...current,
      action,
      commentId: id(value.commentId, "Comment 識別碼"),
      commentVersion: version(value.commentVersion),
    };
  }

  if (action === "mark-answer" || action === "unmark-answer") {
    exactKeys(value, [
      "action",
      "requestId",
      "repositoryId",
      "discussionId",
      "expectedVersion",
      "commentId",
    ]);
    return { ...current, action, commentId: id(value.commentId, "Comment 識別碼") };
  }

  if (action === "add-labels" || action === "remove-labels") {
    exactKeys(value, [
      "action",
      "requestId",
      "repositoryId",
      "discussionId",
      "expectedVersion",
      "labelIds",
    ]);
    return { ...current, action, labelIds: ids(value.labelIds, "Label 識別碼") };
  }

  if (action === "add-upvote" || action === "remove-upvote") {
    exactKeys(value, [
      "action",
      "requestId",
      "repositoryId",
      "discussionId",
      "expectedVersion",
      "subjectKind",
      "subjectId",
    ]);
    if (value.subjectKind !== "discussion" && value.subjectKind !== "comment") {
      throw new DiscussionError(400, "Upvote subject 不正確。");
    }
    return {
      ...current,
      action,
      subjectKind: value.subjectKind,
      subjectId: id(value.subjectId, "Upvote subject 識別碼"),
    };
  }

  if (action === "create-poll") {
    exactKeys(value, [
      "action",
      "requestId",
      "repositoryId",
      "discussionId",
      "expectedVersion",
      "question",
      "options",
    ]);
    return {
      ...current,
      action,
      question: text(value.question, "Poll question", 500),
      options: pollOptions(value.options),
    };
  }

  if (action === "update-poll") {
    exactKeys(value, [
      "action",
      "requestId",
      "repositoryId",
      "discussionId",
      "expectedVersion",
      "pollId",
      "pollVersion",
      "question",
    ]);
    return {
      ...current,
      action,
      pollId: id(value.pollId, "Poll 識別碼"),
      pollVersion: version(value.pollVersion),
      question: text(value.question, "Poll question", 500),
    };
  }

  if (action === "replace-poll-options") {
    exactKeys(value, [
      "action",
      "requestId",
      "repositoryId",
      "discussionId",
      "expectedVersion",
      "pollId",
      "pollVersion",
      "options",
    ]);
    return {
      ...current,
      action,
      pollId: id(value.pollId, "Poll 識別碼"),
      pollVersion: version(value.pollVersion),
      options: pollOptions(value.options),
    };
  }

  if (action === "add-poll-vote" || action === "remove-poll-vote") {
    exactKeys(value, [
      "action",
      "requestId",
      "repositoryId",
      "discussionId",
      "expectedVersion",
      "optionId",
    ]);
    return { ...current, action, optionId: id(value.optionId, "Poll option 識別碼") };
  }

  if (action === "lock") {
    exactKeys(value, [
      "action",
      "requestId",
      "repositoryId",
      "discussionId",
      "expectedVersion",
      "reason",
    ]);
    if (!lockReasons.includes(value.reason as DiscussionLockReason)) {
      throw new DiscussionError(400, "Discussion lock reason 不正確。");
    }
    return { ...current, action, reason: value.reason as DiscussionLockReason };
  }

  if (action === "unlock") {
    exactKeys(value, ["action", "requestId", "repositoryId", "discussionId", "expectedVersion"]);
    return { ...current, action };
  }

  throw new DiscussionError(400, "Discussion 操作不正確。");
}

export function createDiscussionManagement(deps: {
  activeUser(subject: string): Promise<{ id: string }>;
  store(): DiscussionManagementStore;
  now(): number;
}) {
  async function identity(subject: string) {
    return { userId: (await deps.activeUser(subject)).id };
  }

  return {
    view: async (subject: string, repositoryId: string, discussionId?: string) =>
      deps
        .store()
        .view(
          await identity(subject),
          id(repositoryId, "Repository 識別碼"),
          discussionId === undefined ? undefined : id(discussionId, "Discussion 識別碼"),
        ),
    command: async (subject: string, raw: unknown) =>
      deps.store().execute(await identity(subject), parseCommand(raw), deps.now()),
  };
}
