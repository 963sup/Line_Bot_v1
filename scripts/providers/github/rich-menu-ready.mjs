import { pathToFileURL } from "node:url";
import { githubJson, readLatestRunJobs, requireRepository } from "./api.mjs";
import { parseExactSha, requireCurrentMain } from "./current-main.mjs";

const sleepFor = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Read-only Release fence. It does not authorize or retry any provider mutation.
export async function requireRichMenuWebReady({
  sha,
  repository,
  runId,
  runAttempt,
  token,
  fetchImpl = fetch,
  sleep = sleepFor,
  // Bounded 100-minute window for upstream Schema/Storage/Web/Activation.
  pollMs = 30_000,
  maxPolls = 200,
}) {
  const target = requireRepository(repository);
  if (!/^[a-f0-9]{40}$/.test(sha ?? "")) throw new Error("An exact SHA is required.");
  if (!Number.isSafeInteger(runId) || runId <= 0) throw new Error("Release run ID is invalid.");
  if (!Number.isSafeInteger(runAttempt) || runAttempt <= 0)
    throw new Error("Release attempt is invalid.");
  if (!Number.isSafeInteger(maxPolls) || maxPolls < 1 || maxPolls > 200)
    throw new Error("Invalid readiness poll bound.");

  await requireCurrentMain({ sha, repository: target, token, fetchImpl });
  const run = await githubJson("/repos/" + target + "/actions/runs/" + runId, {
    token,
    fetchImpl,
  });
  if (
    run?.id !== runId ||
    run.head_sha !== sha ||
    run.head_branch !== "main" ||
    run.path !== ".github/workflows/release.yml" ||
    run.event !== "push" ||
    run.run_attempt !== runAttempt ||
    !["queued", "in_progress"].includes(run.status)
  )
    throw new Error("Rich Menu Web readiness has an invalid Release identity.");

  for (let i = 0; i < maxPolls; i++) {
    await requireCurrentMain({ sha, repository: target, token, fetchImpl });
    const jobs = await readLatestRunJobs({
      repository: target,
      runId,
      maxAttempt: runAttempt,
      token,
      fetchImpl,
    });
    const deployment = jobs.find((job) => job.name === "deployment");
    const activation = jobs.find((job) => job.name === "identifier_runtime_activation");
    if (
      [deployment, activation].some(
        (job) =>
          job?.conclusion !== undefined && job?.conclusion !== null && job.conclusion !== "success",
      )
    )
      throw new Error("Compatible Web runtime publication was not successful.");
    if (deployment?.conclusion === "success" && activation?.conclusion === "success") {
      await requireCurrentMain({ sha, repository: target, token, fetchImpl });
      // The original run may have been cancelled after its jobs were read.
      // Do not start a provider mutation using evidence from a terminal Release.
      const currentRun = await githubJson("/repos/" + target + "/actions/runs/" + runId, {
        token,
        fetchImpl,
      });
      if (
        currentRun?.id !== runId ||
        currentRun.head_sha !== sha ||
        currentRun.head_branch !== "main" ||
        currentRun.run_attempt !== runAttempt ||
        !["queued", "in_progress"].includes(currentRun.status)
      )
        throw new Error("Rich Menu runtime readiness has no active matching Release.");
      return { sha, run_id: runId, attempt: runAttempt, ready: true };
    }
    if (i + 1 < maxPolls) await sleep(pollMs);
  }
  throw new Error("Compatible Web runtime readiness is still unknown.");
}

async function main() {
  const sha = parseExactSha(process.argv.slice(2));
  const result = await requireRichMenuWebReady({
    sha,
    repository: process.env.GITHUB_REPOSITORY,
    token: process.env.GITHUB_TOKEN,
    runId: Number(process.env.GITHUB_RUN_ID),
    runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT),
  });
  console.log(JSON.stringify(result));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Rich Menu Web readiness unavailable.");
    process.exitCode = 1;
  });
}
