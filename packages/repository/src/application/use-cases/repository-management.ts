import type { RepositoryManagementStore } from "../../contracts/input/repository-management.js";
import type { RepositorySelector } from "../../contracts/selectors.js";
import {
  parseRepositoryManagementCommand,
  parseRepositoryManagementSelector,
} from "../commands/repository-management.js";

export function createRepositoryManagement(deps: {
  activeUser(subject: string): Promise<{ id: string }>;
  store(): RepositoryManagementStore;
  now(): number;
}) {
  return {
    async view(subject: string, selector: RepositorySelector) {
      const user = await deps.activeUser(subject);
      return deps.store().view(user.id, parseRepositoryManagementSelector(selector));
    },
    async execute(subject: string, raw: unknown) {
      const command = parseRepositoryManagementCommand(raw);
      const user = await deps.activeUser(subject);
      return deps.store().execute(user.id, command, deps.now());
    },
  };
}
