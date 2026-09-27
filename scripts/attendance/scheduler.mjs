import { pathToFileURL } from "node:url";
import { withPostgres } from "../supabase/postgres.mjs";
import {
  assertConfirmedProject,
  assertRemoteMutationContext,
  assertRemoteTarget,
} from "../supabase/remote.mjs";
import { VERCEL_PRODUCTION_TARGET } from "../vercel/deploy-production.mjs";

export const ATTENDANCE_SCHEDULER = Object.freeze({
  jobName: "attendance-maintenance",
  schedule: "* * * * *",
  vaultSecretName: "attendance_worker_secret",
  endpoint: `https://${VERCEL_PRODUCTION_TARGET.productionAlias}/api/internal/attendance-maintenance`,
});

export function parseSchedulerArgs(argv) {
  const [action, ...rest] = argv;
  if (!["verify", "reconcile"].includes(action)) {
    throw new Error(
      "Usage: pnpm attendance:scheduler <verify|reconcile> --live --sha <40-hex-sha>",
    );
  }
  let live = false;
  let sha = "";
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === "--live") {
      live = true;
      continue;
    }
    if (arg === "--sha") {
      sha = rest[index + 1] ?? "";
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  if (!live)
    throw new Error(
      "Attendance scheduler production access requires explicit --live authorization.",
    );
  if (!/^[0-9a-f]{40}$/.test(sha))
    throw new Error("Attendance scheduler requires an exact commit SHA.");
  return { action, sha };
}

export function assertSchedulerMutationContext(action, env = process.env) {
  if (action === "reconcile") assertRemoteMutationContext("sync", env);
}

export function schedulerCommand() {
  return `SELECT net.http_post(
    url := '${ATTENDANCE_SCHEDULER.endpoint}',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret
        FROM vault.decrypted_secrets
        WHERE name = '${ATTENDANCE_SCHEDULER.vaultSecretName}'
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  )
  WHERE EXISTS (
    SELECT 1 FROM app_private.attendance_menu_outbox
    WHERE available_at <= extract(epoch FROM clock_timestamp()) * 1000
      AND (lease_until IS NULL OR lease_until < extract(epoch FROM clock_timestamp()) * 1000)
  ) OR EXISTS (
    SELECT 1 FROM app_private.attendance_notification_outbox
    WHERE status = 'pending'
      AND available_at <= extract(epoch FROM clock_timestamp()) * 1000
      AND (lease_until IS NULL OR lease_until < extract(epoch FROM clock_timestamp()) * 1000)
  );`;
}

export async function verifyWorkerEndpoint({
  secret,
  fetchImpl = fetch,
  endpoint = ATTENDANCE_SCHEDULER.endpoint,
}) {
  if (!secret || secret.length < 32)
    throw new Error("ATTENDANCE_WORKER_SECRET must contain at least 32 characters.");
  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: "GET",
      headers: { authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new Error("Attendance scheduler Web preflight failed.");
  }
  if (response.status !== 204) {
    throw new Error(`Attendance scheduler Web preflight returned HTTP ${response.status}.`);
  }
}

export async function readSchedulerState(client) {
  const extensions = await client.query(
    "select extname from pg_extension where extname in ('pg_cron','pg_net') order by extname",
  );
  const secret = await client.query("select id from vault.secrets where name=$1", [
    ATTENDANCE_SCHEDULER.vaultSecretName,
  ]);
  let jobs = { rows: [] };
  if (extensions.rows.some((row) => row.extname === "pg_cron")) {
    jobs = await client.query(
      "select jobid,jobname,schedule,command,active from cron.job where jobname=$1",
      [ATTENDANCE_SCHEDULER.jobName],
    );
  }
  return {
    extensions: extensions.rows.map((row) => row.extname),
    secretConfigured: secret.rows.length === 1,
    jobs: jobs.rows,
  };
}

export function assertSchedulerState(state) {
  if (!state.extensions.includes("pg_cron") || !state.extensions.includes("pg_net")) {
    throw new Error("Attendance scheduler extensions are not converged.");
  }
  if (!state.secretConfigured)
    throw new Error("Attendance scheduler Vault binding is not configured.");
  if (state.jobs.length !== 1)
    throw new Error("Attendance scheduler job is not uniquely configured.");
  const job = state.jobs[0];
  if (
    job.jobname !== ATTENDANCE_SCHEDULER.jobName ||
    job.schedule !== ATTENDANCE_SCHEDULER.schedule ||
    job.active !== true ||
    job.command.trim() !== schedulerCommand().trim()
  ) {
    throw new Error("Attendance scheduler job does not match repository desired state.");
  }
  return {
    jobId: Number(job.jobid),
    schedule: job.schedule,
    active: true,
    endpoint: ATTENDANCE_SCHEDULER.endpoint,
  };
}

export async function verifyAttendanceScheduler({ client, secret, fetchImpl = fetch }) {
  await verifyWorkerEndpoint({ secret, fetchImpl });
  return assertSchedulerState(await readSchedulerState(client));
}

async function upsertVaultSecret(client, secret) {
  const existing = await client.query("select id from vault.secrets where name=$1", [
    ATTENDANCE_SCHEDULER.vaultSecretName,
  ]);
  if (existing.rows.length > 1) throw new Error("Attendance scheduler Vault binding is ambiguous.");
  if (existing.rows.length === 1) {
    await client.query("select vault.update_secret($1::uuid,$2,$3,$4)", [
      existing.rows[0].id,
      secret,
      ATTENDANCE_SCHEDULER.vaultSecretName,
      "Attendance maintenance worker credential",
    ]);
  } else {
    await client.query("select vault.create_secret($1,$2,$3)", [
      secret,
      ATTENDANCE_SCHEDULER.vaultSecretName,
      "Attendance maintenance worker credential",
    ]);
  }
}

export async function reconcileAttendanceScheduler({ client, secret, fetchImpl = fetch }) {
  await verifyWorkerEndpoint({ secret, fetchImpl });
  await client.query("BEGIN");
  try {
    await client.query("create extension if not exists pg_cron");
    await client.query("create extension if not exists pg_net with schema extensions");
    await upsertVaultSecret(client, secret);
    await client.query("select cron.schedule($1,$2,$3)", [
      ATTENDANCE_SCHEDULER.jobName,
      ATTENDANCE_SCHEDULER.schedule,
      schedulerCommand(),
    ]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  }
  return assertSchedulerState(await readSchedulerState(client));
}

async function main() {
  const { action, sha } = parseSchedulerArgs(process.argv.slice(2));
  assertSchedulerMutationContext(action);
  const postgresUrl = process.env.POSTGRES_URL_NON_POOLING ?? "";
  const supabaseUrl = process.env.SUPABASE_URL ?? "";
  const projectRef = assertRemoteTarget(supabaseUrl, postgresUrl);
  assertConfirmedProject(projectRef, process.env.SUPABASE_CONFIRM_PROJECT);
  const secret = process.env.ATTENDANCE_WORKER_SECRET ?? "";
  const result = await withPostgres(postgresUrl, { remote: true }, async (client) =>
    action === "reconcile"
      ? reconcileAttendanceScheduler({ client, secret })
      : verifyAttendanceScheduler({ client, secret }),
  );
  console.log(JSON.stringify({ ...result, sha, projectRef }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
