import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { githubJson, requireRepository } from "./api.mjs";
import { requireCurrentMain } from "./current-main.mjs";

const OWNER_JOBS = Object.freeze({
  supabase: new Set(["supabase"]),
  deployment: new Set(["deployment"]),
  richMenu: new Set(["rich_menu", "rich_menu_direct", "rich_menu_after_deployment"]),
  scheduler: new Set(["attendance_scheduler"]),
});

const PUBLICATION_ONLY_SOURCES = [
  /^assets\/line\/rich-menu\//,
  /^scripts\/line\/rich-menu\/.*\.(?:ts|mjs)$/,
  /^apps\/web\/src\/modules\/assistant\/rich-menu\/(definition|desired-state\.server)\.ts$/,
];
const RICH_MENU_SOURCES = [
  ...PUBLICATION_ONLY_SOURCES,
  /^apps\/web\/src\/modules\/assistant\/rich-menu\/.*\.ts$/,
  /^packages\/line\/src\/mini-app\/(?:index|registration)\.ts$/,
  /^apps\/web\/src\/shared\/presentation\/entry-route\.ts$/,
  /^packages\/line\/src\/rich-menu\/(?:index|client|image)\.ts$/,
  /^scripts\/runtime\/load-env\.mjs$/,
  /^(?:pnpm-lock\.yaml|package\.json|apps\/web\/package\.json|packages\/line\/package\.json)$/,
];

function executableSource(file) {
  return !/\.(?:test|spec)\.[^/]+$/.test(file);
}

export function schedulerChanged(files) {
  return files.some(
    (file) => executableSource(file) && /^scripts\/attendance\/.*\.mjs$/.test(file),
  );
}

function exactSha(value) {
  if (!/^[0-9a-f]{40}$/.test(value ?? "")) throw new Error("Exact commit SHA is required.");
  return value;
}

export function releaseSha(displayTitle) {
  const match = /^Release ([0-9a-f]{40})$/.exec(displayTitle ?? "");
  return match?.[1] ?? null;
}

export function schemaChanged(files) {
  return files.some((file) => /^supabase\/schemas\/[^/]+\.sql$/.test(file));
}

export function richMenuChanged(files) {
  return files.some(
    (file) => executableSource(file) && RICH_MENU_SOURCES.some((pattern) => pattern.test(file)),
  );
}

export function publicationOnlyRichMenuSource(file) {
  return executableSource(file) && PUBLICATION_ONLY_SOURCES.some((pattern) => pattern.test(file));
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
        run("git", ["hash-object", "-t", "tree", "--stdin"], {
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
          "@line_bot_v1/web",
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

async function releaseRuns({ repository, token, fetchImpl }) {
  const runs = [];
  for (let page = 1; ; page++) {
    const body = await githubJson(
      `/repos/${repository}/actions/workflows/release.yml/runs?branch=main&per_page=100&page=${page}`,
      { token, fetchImpl },
    );
    if (!Array.isArray(body.workflow_runs))
      throw new Error("GitHub Release run evidence is invalid.");
    runs.push(...body.workflow_runs);
    if (body.workflow_runs.length < 100) return runs;
  }
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
    if (!candidate) continue;
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

  const runs = await releaseRuns({
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

  const [supabaseBaseline, deploymentBaseline, richMenuBaseline, schedulerBaseline] =
    await Promise.all([
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
      findOwnerBaseline({
        owner: "scheduler",
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
  const schedulerFiles = git.changedFiles(schedulerBaseline, targetSha);

  const schema = schemaChanged(supabaseFiles);
  const richMenu = richMenuChanged(richMenuFiles);
  const pendingWeb = (files, baseline) =>
    files.some((file) => !publicationOnlyRichMenuSource(file)) &&
    turbo.webBuildAffected(baseline, targetSha);
  const web = pendingWeb(deploymentFiles, deploymentBaseline);

  return {
    head_sha: targetSha,
    schema_changed: schema,
    web_affected: web,
    rich_menu_changed: richMenu,
    scheduler_changed:
      schedulerChanged(schedulerFiles) ||
      schemaChanged(schedulerFiles) ||
      pendingWeb(schedulerFiles, schedulerBaseline),
    baselines: {
      supabase: supabaseBaseline,
      deployment: deploymentBaseline,
      rich_menu: richMenuBaseline,
      scheduler: schedulerBaseline,
    },
  };
}

export function githubOutputLines(plan) {
  return [
    `head_sha=${plan.head_sha}`,
    `schema_changed=${plan.schema_changed}`,
    `web_affected=${plan.web_affected}`,
    `rich_menu_changed=${plan.rich_menu_changed}`,
    `scheduler_changed=${plan.scheduler_changed}`,
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
