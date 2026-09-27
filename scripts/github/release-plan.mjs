import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { githubJson, requireRepository } from "./api.mjs";
import { requireCurrentMain } from "./current-main.mjs";

const OWNER_JOBS = Object.freeze({
  supabase: new Set(["supabase"]),
  deployment: new Set(["deployment"]),
  richMenu: new Set(["rich_menu", "rich_menu_direct", "rich_menu_after_deployment"]),
});

const RICH_MENU_SOURCES = [
  /^assets\/line\/rich-menu\//,
  /^apps\/web\/src\/modules\/assistant\/rich-menu\/(definition|desired-state\.server)\.ts$/,
];

function exactSha(value) {
  if (!/^[0-9a-f]{40}$/.test(value ?? "")) throw new Error("Exact commit SHA is required.");
  return value;
}

export function releaseSha(displayTitle) {
  const match = /^Release ([0-9a-f]{40})$/.exec(displayTitle ?? "");
  return match?.[1] ?? null;
}

export function schemaChanged(files) {
  return files.some((file) => /^supabase\/schemas\/.*\.sql$/.test(file));
}

export function richMenuChanged(files) {
  return files.some((file) => RICH_MENU_SOURCES.some((pattern) => pattern.test(file)));
}

export function webRuntimeCandidate(file) {
  if (
    file.startsWith("docs/") ||
    file.startsWith(".github/") ||
    file.startsWith(".agents/") ||
    file.startsWith(".codex/") ||
    file.startsWith("architecture/") ||
    file.startsWith("scripts/") ||
    file.startsWith("supabase/") ||
    file.startsWith("assets/line/rich-menu/") ||
    file.startsWith("apps/web/test/") ||
    /^packages\/[^/]+\/test\//.test(file) ||
    /(^|\/)AGENTS\.md$/.test(file) ||
    /(^|\/)README\.md$/.test(file) ||
    /^apps\/web\/src\/modules\/assistant\/rich-menu\/(definition|desired-state\.server)\.ts$/.test(
      file,
    )
  ) {
    return false;
  }
  return true;
}

function run(command, args, { cwd, env = process.env } = {}) {
  const result = spawnSync(command, args, { cwd, env, encoding: "utf8" });
  if (result.error || result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed.`);
  }
  return result.stdout.trim();
}

function gitAdapter(cwd) {
  return {
    hasCommit(sha) {
      const result = spawnSync("git", ["cat-file", "-e", `${sha}^{commit}`], { cwd });
      return !result.error && result.status === 0;
    },
    isAncestor(candidate, target) {
      const result = spawnSync("git", ["merge-base", "--is-ancestor", candidate, target], { cwd });
      return !result.error && result.status === 0;
    },
    changedFiles(baseline, target) {
      const from =
        baseline ||
        run("git", ["hash-object", "-t", "tree", "/dev/null"], {
          cwd,
        });
      const output = run("git", ["diff", "--name-only", from, target], { cwd });
      return output ? output.split(/\r?\n/).filter(Boolean) : [];
    },
  };
}

function turboAdapter(cwd) {
  return {
    webBuildAffected(baseline, target) {
      if (!baseline) return true;
      const pnpmExecPath = process.env.npm_execpath;
      if (!pnpmExecPath) throw new Error("Release planning must run through pnpm.");
      const output = run(
        process.execPath,
        [
          pnpmExecPath,
          "exec",
          "turbo",
          "query",
          "affected",
          "--tasks",
          "build",
          "--packages",
          "@line-work/web",
        ],
        {
          cwd,
          env: {
            ...process.env,
            TURBO_SCM_BASE: baseline,
            TURBO_SCM_HEAD: target,
          },
        },
      );
      const parsed = JSON.parse(output);
      return Number(parsed?.data?.affectedTasks?.length ?? 0) > 0;
    },
  };
}

async function completedReleaseRuns({ repository, token, fetchImpl }) {
  const body = await githubJson(
    `/repos/${repository}/actions/workflows/release.yml/runs?branch=main&event=workflow_run&status=completed&per_page=100`,
    { token, fetchImpl },
  );
  if (!Array.isArray(body.workflow_runs))
    throw new Error("GitHub Release run evidence is invalid.");
  return body.workflow_runs;
}

async function jobsForRun({ repository, runId, token, fetchImpl }) {
  const body = await githubJson(
    `/repos/${repository}/actions/runs/${runId}/jobs?filter=latest&per_page=100`,
    { token, fetchImpl },
  );
  if (!Array.isArray(body.jobs)) throw new Error("GitHub Release job evidence is invalid.");
  return body.jobs;
}

export async function findOwnerBaseline({
  owner,
  runs,
  targetSha,
  repository,
  token,
  fetchImpl,
  git,
  loadJobs = ({ runId }) => jobsForRun({ repository, runId, token, fetchImpl }),
}) {
  const acceptedJobs = OWNER_JOBS[owner];
  if (!acceptedJobs) throw new Error(`Unknown release owner: ${owner}`);

  for (const runEvidence of runs) {
    const candidate = releaseSha(runEvidence?.display_title);
    if (!candidate || candidate === targetSha) continue;
    if (!git.hasCommit(candidate) || !git.isAncestor(candidate, targetSha)) continue;
    const jobs = await loadJobs({ runId: runEvidence.id });
    if (jobs.some((job) => acceptedJobs.has(job?.name) && job?.conclusion === "success")) {
      return candidate;
    }
  }
  return null;
}

export async function planRelease({
  sha,
  repository,
  token,
  fetchImpl = fetch,
  cwd = process.cwd(),
  git = gitAdapter(cwd),
  turbo = turboAdapter(cwd),
}) {
  const targetSha = exactSha(sha);
  const targetRepository = requireRepository(repository);
  await requireCurrentMain({
    sha: targetSha,
    repository: targetRepository,
    token,
    fetchImpl,
  });

  const runs = await completedReleaseRuns({
    repository: targetRepository,
    token,
    fetchImpl,
  });

  const jobsCache = new Map();
  const loadJobs = async ({ runId }) => {
    if (!jobsCache.has(runId)) {
      jobsCache.set(
        runId,
        jobsForRun({
          repository: targetRepository,
          runId,
          token,
          fetchImpl,
        }),
      );
    }
    return jobsCache.get(runId);
  };

  const [supabaseBaseline, deploymentBaseline, richMenuBaseline] = await Promise.all([
    findOwnerBaseline({
      owner: "supabase",
      runs,
      targetSha,
      repository: targetRepository,
      token,
      fetchImpl,
      git,
      loadJobs,
    }),
    findOwnerBaseline({
      owner: "deployment",
      runs,
      targetSha,
      repository: targetRepository,
      token,
      fetchImpl,
      git,
      loadJobs,
    }),
    findOwnerBaseline({
      owner: "richMenu",
      runs,
      targetSha,
      repository: targetRepository,
      token,
      fetchImpl,
      git,
      loadJobs,
    }),
  ]);

  const supabaseFiles = git.changedFiles(supabaseBaseline, targetSha);
  const deploymentFiles = git.changedFiles(deploymentBaseline, targetSha);
  const richMenuFiles = git.changedFiles(richMenuBaseline, targetSha);

  const schema = schemaChanged(supabaseFiles);
  const richMenu = richMenuChanged(richMenuFiles);
  const webCandidates = deploymentFiles.filter(webRuntimeCandidate);
  const web = webCandidates.length > 0 && turbo.webBuildAffected(deploymentBaseline, targetSha);

  return {
    head_sha: targetSha,
    schema_changed: schema,
    web_affected: web,
    rich_menu_changed: richMenu,
    rich_menu_requires_web: richMenu && web,
    baselines: {
      supabase: supabaseBaseline,
      deployment: deploymentBaseline,
      rich_menu: richMenuBaseline,
    },
  };
}

export function githubOutputLines(plan) {
  return [
    `head_sha=${plan.head_sha}`,
    `schema_changed=${plan.schema_changed}`,
    `web_affected=${plan.web_affected}`,
    `rich_menu_changed=${plan.rich_menu_changed}`,
    `rich_menu_requires_web=${plan.rich_menu_requires_web}`,
  ];
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== "--sha") {
    throw new Error("Usage: pnpm github:release-plan --sha <40-hex-sha>");
  }
  const plan = await planRelease({
    sha: args[1],
    repository: process.env.GITHUB_REPOSITORY,
    token: process.env.GITHUB_TOKEN,
  });
  if (process.env.GITHUB_OUTPUT) {
    const { appendFileSync } = await import("node:fs");
    appendFileSync(process.env.GITHUB_OUTPUT, `${githubOutputLines(plan).join("\n")}\n`);
  }
  console.log(JSON.stringify(plan, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
