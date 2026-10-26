import { pathToFileURL } from "node:url";
import { githubJson, readLatestRunJobs, requireRepository } from "../../providers/github/api.mjs";
import { requireCurrentMain } from "../../providers/github/current-main.mjs";
import {
  assertConfirmedProject,
  assertRemoteTarget,
} from "../../providers/supabase/remote-target.mjs";

export function assertImportTarget({ supabaseUrl, postgresUrl, confirmedProject }) {
  const projectRef = assertRemoteTarget(supabaseUrl, postgresUrl);
  assertConfirmedProject(projectRef, confirmedProject);
  return projectRef;
}

export async function requireReleasedImports({ sha, repository, token, fetchImpl = fetch }) {
  const target = requireRepository(repository);
  await requireCurrentMain({ sha, repository: target, token, fetchImpl });
  const runs = await githubJson(
    `/repos/${target}/actions/runs?head_sha=${sha}&event=push&per_page=100`,
    { token, fetchImpl },
  );
  const release = runs.workflow_runs?.find(
    (run) =>
      run.path === ".github/workflows/release.yml" &&
      run.head_sha === sha &&
      run.head_branch === "main" &&
      run.event === "push" &&
      run.status === "completed" &&
      run.conclusion === "success",
  );
  if (!release) return false;
  const jobs = await readLatestRunJobs({
    repository: target,
    runId: release.id,
    maxAttempt: release.run_attempt,
    token,
    fetchImpl,
  });
  const result = (name) => jobs.find((job) => job.name === name)?.conclusion;
  const core = ["release_plan", "validation / validate"].every(
    (name) => result(name) === "success",
  );
  const schema = ["success", "skipped"].includes(result("supabase"));
  const runtime =
    result("deployment") === "success"
      ? result("identifier_runtime_activation") === "success"
      : result("deployment") === "skipped" && result("identifier_runtime_activation") === "skipped";
  return core && schema && runtime;
}

async function main() {
  const args = process.argv.slice(2);
  if (
    args.length !== 3 ||
    args[0] !== "--live" ||
    args[1] !== "--sha" ||
    !/^[0-9a-f]{40}$/.test(args[2] ?? "")
  )
    throw new Error("Usage: pnpm project:imports --live --sha <40-hex-sha>");
  const ready = await requireReleasedImports({
    sha: args[2],
    repository: process.env.GITHUB_REPOSITORY,
    token: process.env.GITHUB_TOKEN,
  });
  if (!ready) {
    console.log(
      JSON.stringify({
        deferred: true,
        reason: "Current main has not completed its production Release.",
      }),
    );
    return;
  }
  const { PostgresDatabase } = await import("@line_bot_v1/platform/postgres");
  const { createProjectRepositoryImports } = await import(
    "@line_bot_v1/project/composition/bootstrap/repository-imports"
  );
  const projectRef = assertImportTarget({
    supabaseUrl: process.env.SUPABASE_URL ?? "",
    postgresUrl: process.env.POSTGRES_URL ?? "",
    confirmedProject: process.env.SUPABASE_CONFIRM_PROJECT,
  });
  const db = new PostgresDatabase();
  try {
    console.log(
      JSON.stringify({ projectRef, ...(await createProjectRepositoryImports(db).once(100)) }),
    );
  } finally {
    await db.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch {
    console.error(
      "Project repository import could not complete; no connection or source data is logged.",
    );
    process.exitCode = 1;
  }
}
