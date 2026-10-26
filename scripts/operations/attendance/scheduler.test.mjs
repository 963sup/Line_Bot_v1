import assert from "node:assert/strict";
import test from "node:test";
import {
  ATTENDANCE_SCHEDULER,
  assertSchedulerMutationContext,
  assertSchedulerState,
  parseSchedulerArgs,
  reconcileAttendanceScheduler,
  schedulerCommand,
  verifyWorkerEndpoint,
} from "./scheduler.mjs";

const SHA = "a".repeat(40);

test("scheduler CLI requires explicit production authorization and exact SHA", () => {
  assert.deepEqual(parseSchedulerArgs(["verify", "--live", "--sha", SHA]), {
    action: "verify",
    sha: SHA,
  });
  assert.deepEqual(parseSchedulerArgs(["reconcile", "--live", "--sha", SHA]), {
    action: "reconcile",
    sha: SHA,
  });
  assert.throws(() => parseSchedulerArgs(["verify", "--sha", SHA]), /--live/);
  assert.throws(
    () => parseSchedulerArgs(["reconcile", "--live", "--sha", "short"]),
    /exact commit SHA/,
  );
});

test("scheduler mutation is restricted to the validated-main GitHub Actions path", () => {
  assert.doesNotThrow(() => assertSchedulerMutationContext("verify", {}));
  assert.throws(
    () => assertSchedulerMutationContext("reconcile", {}),
    /GitHub Actions current-main reconciliation path/,
  );
  assert.doesNotThrow(() =>
    assertSchedulerMutationContext("reconcile", {
      GITHUB_ACTIONS: "true",
      SUPABASE_REMOTE_MUTATION_CONTEXT: "validated-main",
    }),
  );
});

test("scheduler command uses the canonical production endpoint and runtime Vault lookup", () => {
  const command = schedulerCommand();
  assert.ok(command.includes(ATTENDANCE_SCHEDULER.endpoint));
  assert.match(command, /vault\.decrypted_secrets/);
  assert.match(command, /attendance_menu_outbox/);
  assert.match(command, /attendance_notification_outbox/);
  assert.ok(!command.includes("test-only"));
});

test("worker preflight is read-only and rejects mismatched runtime credential", async () => {
  const secret = "x".repeat(32);
  const calls = [];
  await verifyWorkerEndpoint({
    secret,
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), method: init?.method, auth: init?.headers?.authorization });
      return new Response(null, { status: 204 });
    },
  });
  assert.deepEqual(calls, [
    {
      url: ATTENDANCE_SCHEDULER.endpoint,
      method: "GET",
      auth: "Bearer " + secret,
    },
  ]);
  await assert.rejects(
    verifyWorkerEndpoint({
      secret,
      fetchImpl: async () => new Response(null, { status: 401 }),
    }),
    /HTTP 401/,
  );
});

test("scheduler state requires extensions, one Vault binding and exact active cron desired state", () => {
  const valid = {
    extensions: ["pg_cron", "pg_net"],
    secretConfigured: true,
    jobs: [
      {
        jobid: "9",
        jobname: ATTENDANCE_SCHEDULER.jobName,
        schedule: ATTENDANCE_SCHEDULER.schedule,
        command: schedulerCommand(),
        active: true,
      },
    ],
  };
  assert.deepEqual(assertSchedulerState(valid), {
    jobId: 9,
    schedule: "* * * * *",
    active: true,
    endpoint: ATTENDANCE_SCHEDULER.endpoint,
  });
  assert.throws(
    () => assertSchedulerState({ ...valid, extensions: ["pg_net"] }),
    /extensions are not converged/,
  );
  assert.throws(
    () => assertSchedulerState({ ...valid, secretConfigured: false }),
    /Vault binding is not configured/,
  );
  assert.throws(
    () =>
      assertSchedulerState({
        ...valid,
        jobs: [{ ...valid.jobs[0], command: "select 1" }],
      }),
    /does not match repository desired state/,
  );
});

test("reconcile preflights Web before database mutation and parameterizes the worker secret", async () => {
  const secret = "s".repeat(32);
  const calls = [];
  let secretStored = false;
  const client = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (sql.startsWith("select extname")) {
        return { rows: [{ extname: "pg_cron" }, { extname: "pg_net" }] };
      }
      if (sql.startsWith("select id from vault.secrets")) {
        if (!secretStored) return { rows: [] };
        return { rows: [{ id: "00000000-0000-0000-0000-000000000001" }] };
      }
      if (sql.startsWith("select vault.create_secret")) {
        assert.equal(params[0], secret);
        secretStored = true;
        return { rows: [{}] };
      }
      if (sql.startsWith("select jobid")) {
        return {
          rows: [
            {
              jobid: "7",
              jobname: ATTENDANCE_SCHEDULER.jobName,
              schedule: ATTENDANCE_SCHEDULER.schedule,
              command: schedulerCommand(),
              active: true,
            },
          ],
        };
      }
      return { rows: [] };
    },
  };
  const result = await reconcileAttendanceScheduler({
    client,
    secret,
    fetchImpl: async () => new Response(null, { status: 204 }),
  });
  assert.equal(result.jobId, 7);
  assert.equal(calls[0].sql, "BEGIN");
  assert.ok(calls.some((call) => call.sql.startsWith("select cron.schedule")));
  assert.ok(calls.every((call) => !call.sql.includes(secret)));
});
