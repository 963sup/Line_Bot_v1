import { createFileReclaimer } from "@line_bot_v1/file/application/use-cases/reclaim";
import { createPostgresFileReclamationDependencies } from "@line_bot_v1/file/composition/bootstrap/files";
import { PostgresDatabase } from "@line_bot_v1/platform/postgres";
import { requireCurrentMain } from "../github/current-main.mjs";
import { loadRootEnv } from "../../core/runtime/load-env.mjs";
import { assertValidatedMainMutationContext } from "../supabase/remote-authorization.mjs";
import { assertConfirmedProject, assertRemoteTarget } from "../supabase/remote-target.mjs";

function beforeUtc(value) {
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value ?? "") ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().replace(".000Z", "Z") !== value
  )
    throw new Error("An exact UTC cutoff is required.");
  return Date.parse(value);
}

async function main() {
  const [action, before, ...rest] = process.argv.slice(2);
  if (!["plan", "apply"].includes(action) || rest.length || !before)
    throw new Error("Usage: pnpm file:reclaim <plan|apply> <YYYY-MM-DDTHH:MM:SSZ>");
  const cutoff = beforeUtc(before);
  loadRootEnv();
  const env = process.env;
  const postgresUrl = env.POSTGRES_URL_NON_POOLING ?? "";
  const projectRef = assertRemoteTarget(env.SUPABASE_URL ?? "", postgresUrl);
  assertConfirmedProject(projectRef, env.SUPABASE_CONFIRM_PROJECT);
  const authorize = async () => {
    assertValidatedMainMutationContext(env);
    await requireCurrentMain({
      sha: env.SUPABASE_RELEASE_SHA ?? "",
      repository: env.GITHUB_REPOSITORY,
      token: env.GITHUB_TOKEN,
    });
  };
  if (action === "apply") {
    if (!env.SUPABASE_SERVICE_ROLE_KEY)
      throw new Error("Private File Storage capability is unavailable.");
    await authorize();
  }
  const db = new PostgresDatabase(postgresUrl);
  try {
    const owner = createFileReclaimer({
      ...createPostgresFileReclamationDependencies(db),
      beforeMutation: authorize,
    });
    const result = action === "plan" ? await owner.plan(cutoff) : await owner.reclaim(cutoff);
    // Counts only: no actor identities, private object keys, file names, or provider payloads.
    console.log(JSON.stringify({ projectRef, action, cutoff: before, ...result }));
  } finally {
    await db.close();
  }
}

main().catch(() => {
  console.error("File reclamation unavailable; inspect the guarded operator run.");
  process.exitCode = 1;
});
