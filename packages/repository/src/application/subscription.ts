import type {
  RepositorySubscriptionCommand,
  RepositorySubscriptionState,
  RepositorySubscriptionStore,
} from "../contracts/repositories/subscription.js";
import type { RepositorySelector } from "../contracts/selectors.js";
import { normalizeRepositoryName, RepositoryError } from "../domain.js";
import { accountLoginForRepositoryLocator } from "./owner-locator.js";

const requestIdPattern = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const identifierPattern = /^[\w-]{1,128}$/;
const states = new Set<RepositorySubscriptionState>(["SUBSCRIBED", "UNSUBSCRIBED", "IGNORED"]);

function repositorySelector(value: RepositorySelector): RepositorySelector {
  if ("repositoryId" in value) {
    if (!identifierPattern.test(value.repositoryId)) {
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

function parseCommand(raw: unknown): RepositorySubscriptionCommand {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new RepositoryError(400, "Repository subscription 操作格式不正確。");
  }
  const value = raw as Record<string, unknown>;
  const allowed = ["action", "requestId", "repositoryId", "expectedVersion", "state"];
  if (
    value.action !== "set" ||
    Object.keys(value).some((key) => !allowed.includes(key)) ||
    typeof value.requestId !== "string" ||
    !requestIdPattern.test(value.requestId) ||
    typeof value.repositoryId !== "string" ||
    !identifierPattern.test(value.repositoryId) ||
    typeof value.expectedVersion !== "number" ||
    !Number.isSafeInteger(value.expectedVersion) ||
    value.expectedVersion < 0 ||
    typeof value.state !== "string" ||
    !states.has(value.state as RepositorySubscriptionState)
  ) {
    throw new RepositoryError(400, "Repository subscription 操作不正確。");
  }
  return {
    action: "set",
    requestId: value.requestId.toLowerCase(),
    repositoryId: value.repositoryId,
    expectedVersion: value.expectedVersion,
    state: value.state as RepositorySubscriptionState,
  };
}

export function createRepositorySubscription(deps: {
  activeUser(subject: string): Promise<{ id: string }>;
  store(): RepositorySubscriptionStore;
  now(): number;
}) {
  return {
    async view(subject: string, selector: RepositorySelector) {
      const user = await deps.activeUser(subject);
      return deps.store().view(user.id, repositorySelector(selector));
    },
    async execute(subject: string, raw: unknown) {
      const command = parseCommand(raw);
      const user = await deps.activeUser(subject);
      return deps.store().execute(user.id, command, deps.now());
    },
  };
}
