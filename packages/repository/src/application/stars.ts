import type { RepositoryStarStore } from "../contracts/repositories/stars.js";
import { RepositoryError } from "../domain.js";

function repositoryId(value: string): string {
  const id = value.trim();
  if (!id || id.length > 120) throw new RepositoryError(400, "Repository 識別碼不正確。");
  return id;
}

export function createRepositoryStars(deps: {
  activeUser(subject: string): Promise<{ id: string }>;
  store(): RepositoryStarStore;
  now(): number;
}) {
  async function actor(subject: string) {
    return (await deps.activeUser(subject)).id;
  }

  return {
    star: async (subject: string, target: string) =>
      deps.store().star(await actor(subject), repositoryId(target), deps.now()),

    unstar: async (subject: string, target: string) =>
      deps.store().unstar(await actor(subject), repositoryId(target)),

    starred: async (subject: string) => deps.store().starred(await actor(subject)),
  };
}
