import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { withPostgres } from "../../providers/supabase/postgres.mjs";
import {
  runWithRemoteReconciliationLock,
  supabaseManagementRecoveryConfig,
  verifySupabaseRecoveryReadback,
} from "../../providers/supabase/remote.mjs";
import {
  assertValidatedMainMutationContext,
  remoteMutationRevision,
  requireMutationAdjacentCurrentMain,
} from "../../providers/supabase/remote-authorization.mjs";
import {
  assertConfirmedProject,
  assertRemoteTarget,
  projectRefFromSupabaseUrl,
} from "../../providers/supabase/remote-target.mjs";

const githubApiOrigin = "https://api.github.com";
const releaseWorkflowPath = ".github/workflows/release.yml";
const expectedRepository = "963sup/Line_Bot_v1";
const transferIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseTransferArgs(argv) {
  if (argv.length !== 2 || argv[0] !== "--transfer-id" || !transferIdPattern.test(argv[1] ?? "")) {
    throw new Error("Usage: wbs:transfer --transfer-id <uuid>");
  }
  return { transferId: argv[1].toLowerCase() };
}

function required(value, name) {
  if (!value) throw new Error(`${name} is required for the WBS transfer operator.`);
  return value;
}

export function wbsTransferOperatorConfig(env = process.env) {
  const target = wbsTransferOperatorTargetConfig(env);
  assertValidatedMainMutationContext(env);
  const recovery = supabaseManagementRecoveryConfig(env);
  if (recovery.projectRef !== target.projectRef) {
    throw new Error("WBS transfer recovery target does not match the database target.");
  }

  return { ...target, recovery };
}

function wbsTransferOperatorTargetConfig(env = process.env) {
  if (env.GITHUB_ACTIONS !== "true") {
    throw new Error("WBS transfer is allowed only from GitHub Actions.");
  }
  if (env.GITHUB_EVENT_NAME !== "workflow_dispatch") {
    throw new Error("WBS transfer is allowed only from its workflow_dispatch operator path.");
  }

  const releaseSha = remoteMutationRevision(env);
  if (env.GITHUB_REF !== "refs/heads/main" || env.GITHUB_SHA !== releaseSha) {
    throw new Error("WBS transfer checkout is not the exact main Release SHA.");
  }
  const supabaseUrl = required(env.SUPABASE_URL, "SUPABASE_URL");
  const postgresUrl = required(env.POSTGRES_URL_NON_POOLING, "POSTGRES_URL_NON_POOLING");
  const projectRef = projectRefFromSupabaseUrl(supabaseUrl);
  assertConfirmedProject(projectRef, env.SUPABASE_CONFIRM_PROJECT);
  if (assertRemoteTarget(supabaseUrl, postgresUrl) !== projectRef) {
    throw new Error("WBS transfer target identity is inconsistent.");
  }

  return {
    releaseSha,
    projectRef,
    postgresUrl,
    github: {
      repository: required(env.GITHUB_REPOSITORY, "GITHUB_REPOSITORY"),
      token: required(env.GITHUB_TOKEN, "GITHUB_TOKEN"),
    },
  };
}

async function githubJson(fetchImpl, path, token, label) {
  let response;
  try {
    response = await fetchImpl(`${githubApiOrigin}${path}`, {
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
  if (!response.ok) throw new Error(`${label}: GitHub request failed (${response.status}).`);
  try {
    return await response.json();
  } catch {
    throw new Error(`${label}: GitHub returned invalid JSON.`);
  }
}

export async function verifyWbsTransferReleaseEvidence({
  sha,
  repository,
  token,
  fetchImpl = globalThis.fetch,
}) {
  if (!/^[0-9a-f]{40}$/.test(sha ?? "")) {
    throw new Error("WBS transfer Release evidence requires an exact lowercase commit SHA.");
  }
  if (repository !== expectedRepository) {
    throw new Error("WBS transfer GitHub repository does not match the production owner.");
  }
  const query = new URLSearchParams({
    branch: "main",
    event: "push",
    status: "completed",
    per_page: "100",
  });
  const runs = await githubJson(
    fetchImpl,
    `/repos/${repository}/actions/workflows/release.yml/runs?${query}`,
    token,
    "WBS transfer Release readback",
  );
  if (!Array.isArray(runs.workflow_runs)) {
    throw new Error("WBS transfer Release readback is invalid.");
  }
  const run = runs.workflow_runs.find(
    (candidate) =>
      candidate?.path === releaseWorkflowPath &&
      candidate.event === "push" &&
      candidate.head_branch === "main" &&
      candidate.head_sha === sha &&
      candidate.status === "completed" &&
      candidate.conclusion === "success" &&
      candidate.display_title === `Release ${sha}`,
  );
  if (!run || !Number.isSafeInteger(run.id)) {
    throw new Error("Exact-SHA successful Release evidence was not found.");
  }
  const jobs = await githubJson(
    fetchImpl,
    `/repos/${repository}/actions/runs/${run.id}/jobs?filter=latest&per_page=100`,
    token,
    "WBS transfer Release job readback",
  );
  if (!Array.isArray(jobs.jobs)) throw new Error("WBS transfer Release job readback is invalid.");
  const requiredJobs = ["release_plan", "validation / validate", "deployment"];
  const jobIds = {};
  for (const name of requiredJobs) {
    const job = jobs.jobs.find(
      (candidate) => candidate?.name === name && candidate.conclusion === "success",
    );
    if (!job || !Number.isSafeInteger(job.id)) {
      throw new Error(`WBS transfer requires successful ${name} Release job evidence.`);
    }
    jobIds[name] = job.id;
  }
  // The exact-SHA release.yml permits deployment after skipped Supabase only
  // when its successful release_plan reports no schema change.
  const supabase = jobs.jobs.find((candidate) => candidate?.name === "supabase");
  if (
    !supabase ||
    !Number.isSafeInteger(supabase.id) ||
    !["success", "skipped"].includes(supabase.conclusion)
  ) {
    throw new Error(
      "WBS transfer requires successful or intentionally skipped supabase Release job evidence.",
    );
  }
  jobIds.supabase = supabase.id;
  return {
    releaseSha: run.head_sha,
    deploymentSha: run.head_sha,
    releaseRunId: run.id,
    jobIds,
  };
}

export async function assertOperatorConnectionIdentity(client) {
  const { rows } = await client.query(
    `select current_database() as database_name,
            current_user as user_name,
            to_regnamespace('app_private') is not null as app_private_exists`,
  );
  const identity = rows[0];
  if (
    identity?.database_name !== "postgres" ||
    identity.user_name !== "postgres" ||
    identity.app_private_exists !== true
  ) {
    throw new Error("WBS transfer PostgreSQL connection identity is not the production operator.");
  }
  return { database: identity.database_name, role: identity.user_name };
}

function isDurableWriteStatement(text) {
  return /(?:^|\b)(?:insert|update|delete|merge)\b/i.test(text);
}

export function createWbsTransferOperatorDatabase(
  client,
  createSql,
  authorizeWrite,
  { readOnly = false } = {},
) {
  if (typeof authorizeWrite !== "function") {
    throw new Error("WBS transfer operator Database requires adjacent write authorization.");
  }
  return {
    async transaction(work) {
      await authorizeWrite();
      await client.query(readOnly ? "BEGIN READ ONLY" : "BEGIN");
      try {
        await client.query("SET LOCAL search_path = app_private, pg_catalog");
        await client.query("SET LOCAL statement_timeout = '120s'");
        const sql = createSql(async (text, values) => {
          if (readOnly && isDurableWriteStatement(text)) {
            throw new Error("WBS transfer ACTIVE readback attempted a database write.");
          }
          if (isDurableWriteStatement(text)) await authorizeWrite();
          const result = await client.query(text, values);
          return { rows: result.rows, rowCount: result.rowCount };
        });
        const value = await work(sql);
        if (readOnly) {
          await client.query("ROLLBACK");
          return value;
        }
        await authorizeWrite();
        await client.query("COMMIT");
        return value;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      }
    },
  };
}

function evidenceHash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function transferResultSummary(result, recoveryEvidence, transferId) {
  if (
    result.id !== transferId ||
    result.state !== "ACTIVE" ||
    !/^[0-9a-f]{40}$/.test(result.releaseSha ?? "") ||
    !Number.isSafeInteger(result.sourceVersion) ||
    !Number.isSafeInteger(result.revisionCount) ||
    !Number.isSafeInteger(result.commandCount) ||
    !/^[0-9a-f]{64}$/.test(result.sourceHash ?? "")
  ) {
    throw new Error("WBS transfer ACTIVE mapping readback is invalid.");
  }
  const summary = {
    state: result.state,
    sourceVersion: result.sourceVersion,
    revisionCount: result.revisionCount,
    commandCount: result.commandCount,
    sourceHash: result.sourceHash,
    releaseSha: result.releaseSha,
  };
  if (recoveryEvidence !== undefined) summary.recoveryHash = evidenceHash(recoveryEvidence);
  return summary;
}

export async function runWbsTransferOperator({
  transferId,
  env = process.env,
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  withPostgresImpl = withPostgres,
  runWithLock = runWithRemoteReconciliationLock,
  releaseReadback = verifyWbsTransferReleaseEvidence,
  recoveryReadback = verifySupabaseRecoveryReadback,
  currentMainReadback = requireMutationAdjacentCurrentMain,
  runtime,
}) {
  const target = wbsTransferOperatorTargetConfig(env);
  const authorizeWrite = async () => {
    const current = await currentMainReadback(env, fetchImpl);
    if (current.sha !== target.releaseSha) {
      throw new Error("WBS transfer current-main readback changed before a database write.");
    }
    return current;
  };
  await authorizeWrite();

  return withPostgresImpl(target.postgresUrl, { remote: true }, async (client) => {
    await assertOperatorConnectionIdentity(client);
    const active = await runtime.readActive({ client, transferId, authorizeWrite });
    if (active) return transferResultSummary(active, undefined, transferId);

    const config = wbsTransferOperatorConfig(env);
    const release = await releaseReadback({
      sha: config.releaseSha,
      repository: config.github.repository,
      token: config.github.token,
      fetchImpl,
    });
    if (release.releaseSha !== config.releaseSha || release.deploymentSha !== config.releaseSha) {
      throw new Error("WBS transfer Release/deployment readback does not match the operator SHA.");
    }
    const recovery = await recoveryReadback(config.recovery, fetchImpl);
    if (recovery.projectRef !== config.projectRef) {
      throw new Error("WBS transfer recovery readback does not match the database target.");
    }
    await authorizeWrite();
    return runWithLock(client, async () => {
      const current = await authorizeWrite();
      const result = await runtime.execute({
        client,
        transferId,
        authorizeWrite,
        command: {
          transferId,
          currentMainSha: current.sha,
          deployedSha: release.deploymentSha,
          providerRecoveryReady: true,
        },
        activatedAt: now(),
      });
      return transferResultSummary(result, recovery, transferId);
    });
  });
}

async function loadRuntime() {
  const [
    { createSql },
    { createPostgresProjectContentScope },
    { createPostgresActionTransferFacts },
    { createPostgresNotificationTransferFacts },
    wbsTransfer,
    wbsUseCase,
  ] = await Promise.all([
    import("@line_bot_v1/platform/postgres"),
    import("@line_bot_v1/project/composition/bootstrap/project-content-scope"),
    import("@line_bot_v1/actions/composition/bootstrap/transfer-facts"),
    import("@line_bot_v1/notifications/composition/bootstrap/transfer-facts"),
    import("@line_bot_v1/wbs/composition/bootstrap/transfer"),
    import("@line_bot_v1/wbs/application/use-cases/transfer"),
  ]);
  const requestDatabase = {
    transaction() {
      throw new Error("The Release operator cannot create WBS transfer intents.");
    },
  };
  const createStore = (client, authorizeWrite, readOnly) =>
    wbsTransfer.createPostgresWbsScopeTransferStore(
      requestDatabase,
      (sql) => ({
        project: async (userId, projectId) => {
          const scope = await createPostgresProjectContentScope(sql).read(userId, projectId);
          return {
            projectId: scope.project.id,
            ownerAccountId: scope.project.ownerAccountId,
            ownerKind: scope.project.ownerKind,
            role: scope.role,
            public: scope.project.public,
            hasCollaboratorGrants: scope.project.hasCollaboratorGrants,
            closed: scope.closed,
          };
        },
        dependents: async (_actorUserId, _repositoryId, projectId) => {
          const [actionRows, notificationRows] = await Promise.all([
            createPostgresActionTransferFacts(sql).read(projectId),
            createPostgresNotificationTransferFacts(sql).read(),
          ]);
          return { actionRows, notificationRows };
        },
      }),
      createWbsTransferOperatorDatabase(client, createSql, authorizeWrite, { readOnly }),
    );
  return {
    readActive({ client, transferId, authorizeWrite }) {
      return wbsUseCase.readActiveWbsScopeTransfer(
        createStore(client, authorizeWrite, true),
        transferId,
      );
    },
    async execute({ client, command, activatedAt, authorizeWrite }) {
      return wbsUseCase.executeWbsScopeTransfer(
        createStore(client, authorizeWrite, false),
        command,
        activatedAt,
      );
    },
  };
}

async function main() {
  const { transferId } = parseTransferArgs(process.argv.slice(2));
  const result = await runWbsTransferOperator({ transferId, runtime: await loadRuntime() });
  console.log(JSON.stringify(result));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
