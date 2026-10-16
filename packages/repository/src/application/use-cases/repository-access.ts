import type { RepositoryAccessStore } from "../../contracts/input/repository-access.js";
import type { RepositorySelector } from "../../contracts/selectors.js";
import {
  parseRepositoryAccessCommand,
  parseRepositoryAccessSelector,
} from "../commands/repository-access.js";

export function createRepositoryAccess(deps: {
  activeUser(subject: string): Promise<{ id: string }>;
  store(): RepositoryAccessStore;
  now(): number;
}) {
  return {
    async view(subject: string, selector: RepositorySelector) {
      const user = await deps.activeUser(subject);
      return deps.store().view(user.id, parseRepositoryAccessSelector(selector));
    },
    async execute(subject: string, raw: unknown) {
      const command = parseRepositoryAccessCommand(raw);
      const user = await deps.activeUser(subject);
      return deps.store().execute(user.id, command, deps.now());
    },
  };
}
