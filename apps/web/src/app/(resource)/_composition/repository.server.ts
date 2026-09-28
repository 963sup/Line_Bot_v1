import { createPublicRepositories } from "@line_bot_v1/repository/application/public";
import { PostgresPublicRepositoryStore } from "@line_bot_v1/repository/postgres/public";

const state = globalThis as typeof globalThis & {
  publicRepositoryStore?: PostgresPublicRepositoryStore;
};

function publicRepositoryStore() {
  return (state.publicRepositoryStore ??= new PostgresPublicRepositoryStore());
}

export function publicRepositories() {
  return createPublicRepositories(publicRepositoryStore());
}
