import { RepositoryError } from "../../contracts/errors/repository-error.js";
import type { RepositorySubscriptionStore } from "../../contracts/input/repository-subscription.js";
import type { RepositorySelector } from "../../contracts/selectors.js";
import { normalizeRepositoryName } from "../../domain/repository/value-objects/repository-name.js";
import { parseRepositorySubscriptionCommand } from "../commands/repository-subscription.js";
import { accountLoginForRepositoryLocator } from "../owner-locator.js";

const identifierPattern = /^[\w-]{1,128}$/;

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
      const command = parseRepositorySubscriptionCommand(raw);
      const user = await deps.activeUser(subject);
      return deps.store().execute(user.id, command, deps.now());
    },
  };
}
