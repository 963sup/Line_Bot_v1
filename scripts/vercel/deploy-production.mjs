import { pathToFileURL } from "node:url";

const API_ORIGIN = "https://api.vercel.com";
const GITHUB_API_ORIGIN = "https://api.github.com";
const RELEASE_WORKFLOW_PATH = ".github/workflows/release.yml";
const ACTIVE_DEPLOYMENT_STATES = new Set(["QUEUED", "BUILDING", "INITIALIZING"]);

export const VERCEL_PRODUCTION_TARGET = Object.freeze({
  teamId: "team_X20QRhf0INK1oNiIT8q0MWXx",
  projectId: "prj_lUi6hNUFkhRpeeSatNg2ftsDqHCE",
  projectName: "mini-app-line",
  productionAlias: "mini-app-line.vercel.app",
  gitOrg: "963sup",
  gitRepo: "Line_Bot_v1",
});

export function parseProductionDeployArgs(argv) {
  let live = false;
  let sha = "";
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--live") {
      live = true;
      continue;
    }
    if (arg === "--sha") {
      sha = argv[index + 1] ?? "";
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  if (!live) throw new Error("Production deployment requires explicit --live authorization.");
  if (!/^[0-9a-f]{40}$/.test(sha))
    throw new Error("Production deployment requires an exact commit SHA.");
  return { sha };
}

async function requestJson(fetchImpl, path, token, label, init = {}, mutation = false) {
  let response;
  try {
    response = await fetchImpl(`${API_ORIGIN}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new Error(
      mutation
        ? `${label}: request outcome unknown; reconcile provider state before retrying.`
        : `${label}: provider read failed.`,
    );
  }

  const text = await response.text();
  let body = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(`${label}: provider returned non-JSON response (${response.status}).`);
    }
  }
  if (!response.ok) throw new Error(`${label}: provider request failed (${response.status}).`);
  return body;
}

async function requestGitHubJson(fetchImpl, path, token, label) {
  let response;
  try {
    response = await fetchImpl(`${GITHUB_API_ORIGIN}${path}`, {
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "x-github-api-version": "2022-11-28",
      },
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new Error(`${label}: GitHub evidence read failed.`);
  }
  const text = await response.text();
  let body = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(`${label}: GitHub returned non-JSON response (${response.status}).`);
    }
  }
  if (!response.ok) throw new Error(`${label}: GitHub request failed (${response.status}).`);
  return body;
}

export async function verifyProductionReleaseAuthorization({
  token,
  runId,
  sha,
  repository,
  fetchImpl = fetch,
}) {
  const expectedRepository = `${VERCEL_PRODUCTION_TARGET.gitOrg}/${VERCEL_PRODUCTION_TARGET.gitRepo}`;
  if (!token) throw new Error("Production deployment requires GitHub Release evidence.");
  if (!/^\d+$/.test(runId ?? "")) throw new Error("Production deployment requires GITHUB_RUN_ID.");
  if (repository !== expectedRepository) {
    throw new Error("Production deployment GitHub repository does not match the production owner.");
  }
  const run = await requestGitHubJson(
    fetchImpl,
    `/repos/${expectedRepository}/actions/runs/${runId}`,
    token,
    "Production Release run preflight",
  );
  if (
    String(run.id) !== runId ||
    run.path !== RELEASE_WORKFLOW_PATH ||
    run.event !== "workflow_run" ||
    run.head_branch !== "main" ||
    run.head_sha !== sha ||
    run.status !== "in_progress"
  ) {
    throw new Error("Production deployment is not running inside the current authorized Release.");
  }

  const jobs = await requestGitHubJson(
    fetchImpl,
    `/repos/${expectedRepository}/actions/runs/${runId}/jobs?filter=latest&per_page=100`,
    token,
    "Production Release job preflight",
  );
  if (!Array.isArray(jobs.jobs)) {
    throw new Error("Production Release job evidence is invalid.");
  }
  const succeeded = (name) =>
    jobs.jobs.some((job) => job?.name === name && job?.conclusion === "success");
  if (!succeeded("gate") || !succeeded("supabase")) {
    throw new Error("Production deployment requires successful gate and Supabase convergence.");
  }
}

const deploymentId = (deployment) => deployment?.id ?? deployment?.uid ?? "";
const deploymentState = (deployment) =>
  deployment?.readyState ?? deployment?.state ?? deployment?.status ?? "";

function assertDeploymentIdentity(deployment, sha) {
  if (deployment.target !== "production") {
    throw new Error("Vercel readback is not a production deployment.");
  }
  if (deployment.meta?.githubCommitSha !== sha) {
    throw new Error("Vercel readback commit does not match the validated SHA.");
  }
}

function readyResult(deployment, sha) {
  const id = deploymentId(deployment);
  if (!id.startsWith("dpl_")) throw new Error("Vercel readback did not return a deployment ID.");
  assertDeploymentIdentity(deployment, sha);
  if (!(deployment.alias ?? []).includes(VERCEL_PRODUCTION_TARGET.productionAlias)) return null;
  return {
    deploymentId: id,
    url: deployment.url,
    sha,
    target: "production",
  };
}

async function pollProductionDeployment({
  deploymentId: id,
  token,
  sha,
  fetchImpl,
  sleep,
  maxPolls,
  pollMilliseconds,
}) {
  const target = VERCEL_PRODUCTION_TARGET;
  const teamQuery = `?teamId=${encodeURIComponent(target.teamId)}`;
  for (let attempt = 0; attempt < maxPolls; attempt += 1) {
    const current = await requestJson(
      fetchImpl,
      `/v13/deployments/${id}${teamQuery}`,
      token,
      "Vercel production readback",
    );
    const state = deploymentState(current);
    if (state === "ERROR" || state === "CANCELED") {
      throw new Error(`Vercel production deployment ended in ${state}.`);
    }
    if (state === "READY") {
      const result = readyResult(current, sha);
      if (result) return result;
    }
    await sleep(pollMilliseconds);
  }
  throw new Error(
    `Vercel deployment ${id} result is unknown after readback timeout; inspect before retrying.`,
  );
}

async function recoverExistingProduction({
  token,
  sha,
  fetchImpl,
  sleep,
  maxPolls,
  pollMilliseconds,
}) {
  const target = VERCEL_PRODUCTION_TARGET;
  const query = new URLSearchParams({
    projectId: target.projectId,
    target: "production",
    sha,
    limit: "20",
    teamId: target.teamId,
  });
  const listed = await requestJson(
    fetchImpl,
    `/v7/deployments?${query}`,
    token,
    "Vercel production recovery lookup",
  );
  if (!Array.isArray(listed.deployments)) {
    throw new Error("Vercel production recovery lookup returned an invalid deployment list.");
  }

  for (const candidate of listed.deployments) {
    const id = deploymentId(candidate);
    if (
      !id.startsWith("dpl_") ||
      candidate.target !== "production" ||
      candidate.meta?.githubCommitSha !== sha
    ) {
      continue;
    }

    const state = deploymentState(candidate);
    if (state === "READY") {
      const current = await requestJson(
        fetchImpl,
        `/v13/deployments/${id}?teamId=${encodeURIComponent(target.teamId)}`,
        token,
        "Vercel production recovery readback",
      );
      if (deploymentState(current) !== "READY") {
        if (ACTIVE_DEPLOYMENT_STATES.has(deploymentState(current))) {
          return pollProductionDeployment({
            deploymentId: id,
            token,
            sha,
            fetchImpl,
            sleep,
            maxPolls,
            pollMilliseconds,
          });
        }
        continue;
      }
      const result = readyResult(current, sha);
      if (result) return result;
      continue;
    }

    if (ACTIVE_DEPLOYMENT_STATES.has(state)) {
      return pollProductionDeployment({
        deploymentId: id,
        token,
        sha,
        fetchImpl,
        sleep,
        maxPolls,
        pollMilliseconds,
      });
    }
  }
  return null;
}

export async function deployProduction({
  token,
  sha,
  fetchImpl = fetch,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  maxPolls = 120,
  pollMilliseconds = 5_000,
}) {
  if (!token) throw new Error("VERCEL_TOKEN is required for production deployment.");
  if (!/^[0-9a-f]{40}$/.test(sha))
    throw new Error("Production deployment requires an exact commit SHA.");

  const target = VERCEL_PRODUCTION_TARGET;
  const teamQuery = `?teamId=${encodeURIComponent(target.teamId)}`;
  const project = await requestJson(
    fetchImpl,
    `/v9/projects/${target.projectId}${teamQuery}`,
    token,
    "Vercel project preflight",
  );
  if (project.id !== target.projectId || project.name !== target.projectName) {
    throw new Error("Vercel project preflight resolved a different production target.");
  }

  const recovered = await recoverExistingProduction({
    token,
    sha,
    fetchImpl,
    sleep,
    maxPolls,
    pollMilliseconds,
  });
  if (recovered) return recovered;

  const deployment = await requestJson(
    fetchImpl,
    `/v13/deployments${teamQuery}`,
    token,
    "Vercel production deployment",
    {
      method: "POST",
      body: JSON.stringify({
        name: target.projectName,
        project: target.projectId,
        target: "production",
        gitSource: {
          type: "github",
          org: target.gitOrg,
          repo: target.gitRepo,
          ref: sha,
        },
        gitMetadata: {
          commitRef: "main",
          commitSha: sha,
          ci: true,
          ciType: "github-actions",
        },
      }),
    },
    true,
  );
  const id = deploymentId(deployment);
  if (!id.startsWith("dpl_")) {
    throw new Error("Vercel production deployment did not return a deployment ID.");
  }

  return pollProductionDeployment({
    deploymentId: id,
    token,
    sha,
    fetchImpl,
    sleep,
    maxPolls,
    pollMilliseconds,
  });
}

async function main() {
  const { sha } = parseProductionDeployArgs(process.argv.slice(2));
  await verifyProductionReleaseAuthorization({
    token: process.env.GITHUB_TOKEN,
    runId: process.env.GITHUB_RUN_ID,
    sha,
    repository: process.env.GITHUB_REPOSITORY,
  });
  const result = await deployProduction({ token: process.env.VERCEL_TOKEN, sha });
  console.log(JSON.stringify(result));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
