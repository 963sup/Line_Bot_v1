import { pathToFileURL } from "node:url";

const API_ORIGIN = "https://api.vercel.com";

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
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error("Production deployment requires an exact commit SHA.");
  return { sha };
}

async function requestJson(fetchImpl, path, token, label, init = {}) {
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
    throw new Error(`${label}: request outcome unknown; do not retry a mutation blindly.`);
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

export async function deployProduction({
  token,
  sha,
  fetchImpl = fetch,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  maxPolls = 120,
  pollMilliseconds = 5_000,
}) {
  if (!token) throw new Error("VERCEL_TOKEN is required for production deployment.");
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error("Production deployment requires an exact commit SHA.");

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
  );
  if (typeof deployment.id !== "string" || !deployment.id.startsWith("dpl_")) {
    throw new Error("Vercel production deployment did not return a deployment ID.");
  }

  for (let attempt = 0; attempt < maxPolls; attempt += 1) {
    const current = await requestJson(
      fetchImpl,
      `/v13/deployments/${deployment.id}${teamQuery}`,
      token,
      "Vercel production readback",
    );
    const state = current.readyState ?? current.state ?? current.status;
    if (state === "ERROR" || state === "CANCELED") {
      throw new Error(`Vercel production deployment ended in ${state}.`);
    }
    if (state === "READY") {
      if (current.target !== "production") {
        throw new Error("Vercel readback is not a production deployment.");
      }
      if (current.meta?.githubCommitSha !== sha) {
        throw new Error("Vercel readback commit does not match the validated SHA.");
      }
      if ((current.alias ?? []).includes(target.productionAlias)) {
        return {
          deploymentId: deployment.id,
          url: current.url,
          sha,
          target: "production",
        };
      }
    }
    await sleep(pollMilliseconds);
  }

  throw new Error(
    `Vercel deployment ${deployment.id} result is unknown after readback timeout; inspect before retrying.`,
  );
}

async function main() {
  const { sha } = parseProductionDeployArgs(process.argv.slice(2));
  const result = await deployProduction({ token: process.env.VERCEL_TOKEN, sha });
  console.log(JSON.stringify(result));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
