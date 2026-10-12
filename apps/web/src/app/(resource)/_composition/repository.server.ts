import { createPublicRepositories } from "@line_bot_v1/repository/application/public";
import { PostgresPublicRepositoryStore } from "@line_bot_v1/repository/postgres/public";

function publicRepositoryStore() {
  return (globalThis.publicRepositoryStore ??= new PostgresPublicRepositoryStore());
}

export function publicRepositories() {
  return createPublicRepositories(publicRepositoryStore());
}
