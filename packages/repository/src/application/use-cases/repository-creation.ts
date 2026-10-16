import type { RepositoryCreationStore } from "../../contracts/input/repository-creation.js";
import { parseRepositoryCreateCommand } from "../commands/repository-creation.js";

export function createRepositoryCreation(deps: {
  activeUser(subject: string): Promise<{ id: string }>;
  store(): RepositoryCreationStore;
  now(): number;
}) {
  return {
    async owners(subject: string) {
      return deps.store().owners((await deps.activeUser(subject)).id);
    },
    async create(subject: string, raw: unknown) {
      const command = parseRepositoryCreateCommand(raw);
      return deps.store().create((await deps.activeUser(subject)).id, command, deps.now());
    },
  };
}
