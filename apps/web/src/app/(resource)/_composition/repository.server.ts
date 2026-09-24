import { PostgresPublicRepositoryStore } from "@line-work/repository/adapters/postgres/public";
import { createPublicRepositories } from "@line-work/repository/application/public";

const state = globalThis as typeof globalThis & {
  publicRepositoryStore?: PostgresPublicRepositoryStore;
};

function publicRepositoryStore() {
  return (state.publicRepositoryStore ??= new PostgresPublicRepositoryStore());
}

export function publicRepositories() {
  return createPublicRepositories(publicRepositoryStore());
}
