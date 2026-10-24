import { requireCurrentMain } from "../github/current-main.mjs";
import { assertIdentifierCutoverRevision } from "./identifier-cutover.mjs";

export function remoteMutationRevision(env = process.env) {
  return assertIdentifierCutoverRevision(env.SUPABASE_RELEASE_SHA);
}

export async function requireMutationAdjacentCurrentMain(
  env = process.env,
  fetchImpl = globalThis.fetch,
) {
  return requireCurrentMain({
    sha: remoteMutationRevision(env),
    repository: env.GITHUB_REPOSITORY,
    token: env.GITHUB_TOKEN,
    fetchImpl,
  });
}

export function assertValidatedMainMutationContext(env = process.env) {
  if (env.GITHUB_ACTIONS !== "true" || env.SUPABASE_REMOTE_MUTATION_CONTEXT !== "validated-main") {
    throw new Error(
      "Supabase remote mutation is allowed only from the repository GitHub Actions current-main reconciliation path.",
    );
  }
}
