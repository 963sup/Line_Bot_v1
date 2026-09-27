import { PostgresPublicRepositoryStore } from "@line_bot_v1/repository/adapters/postgres/public";
import { createPublicRepositories } from "@line_bot_v1/repository/application/public";

const state = globalThis as typeof globalThis & {
  publicRepositoryStore?: PostgresPublicRepositoryStore;
};

function publicRepositoryStore() {
  return (state.publicRepositoryStore ??= new PostgresPublicRepositoryStore());
}

export function publicRepositories() {
  return createPublicRepositories(publicRepositoryStore());
}
