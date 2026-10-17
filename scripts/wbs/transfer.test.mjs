import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createWbsTransferOperatorDatabase,
  parseTransferArgs,
  runWbsTransferOperator,
  verifyWbsTransferReleaseEvidence,
  wbsTransferOperatorConfig,
} from "./transfer.mjs";

const SHA = "a".repeat(40);
const OTHER_SHA = "b".repeat(40);
const PROJECT_REF = "nmssogphayjymjpbnrxv";
const TRANSFER_ID = "123e4567-e89b-42d3-a456-426614174000";

function operatorEnv(overrides = {}) {
  return {
    GITHUB_ACTIONS: "true",
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_REF: "refs/heads/main",
    GITHUB_REPOSITORY: "963sup/Line_Bot_v1",
    GITHUB_SHA: SHA,
    GITHUB_TOKEN: "github-token",
    POSTGRES_URL_NON_POOLING: `postgresql://postgres:password@db.${PROJECT_REF}.supabase.co:5432/postgres`,
    SUPABASE_ACCESS_TOKEN: "supabase-token",
    SUPABASE_CONFIRM_PROJECT: PROJECT_REF,
    SUPABASE_RELEASE_SHA: SHA,
    SUPABASE_REMOTE_MUTATION_CONTEXT: "validated-main",
    SUPABASE_URL: `https://${PROJECT_REF}.supabase.co`,
    ...overrides,
  };
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

function releaseFetch({ sha = SHA, conclusion = "success" } = {}) {
  return async (url) => {
    if (url.includes("/actions/workflows/release.yml/runs?")) {
      return json({
        workflow_runs: [
          {
            id: 17,
            path: ".github/workflows/release.yml",
            event: "push",
            head_branch: "main",
            head_sha: sha,
            status: "completed",
            conclusion,
            display_title: `Release ${sha}`,
          },
        ],
      });
    }
    if (url.includes("/actions/runs/17/jobs?")) {
      return json({
        jobs: [
          { id: 1, name: "validation / validate", conclusion: "success" },
          { id: 2, name: "supabase", conclusion: "success" },
          { id: 3, name: "deployment", conclusion: "success" },
        ],
      });
    }
    throw new Error(`unexpected URL: ${url}`);
  };
}

function operatorDependencies(runtime) {
  const client = {
    query: async (text) => {
      if (text.includes("current_database()")) {
        return {
          rows: [{ database_name: "postgres", user_name: "postgres", app_private_exists: true }],
        };
      }
      return { rows: [] };
    },
  };
  return {
    runtime: {
      readActive: runtime.readActive ?? (async () => null),
      execute: runtime.execute,
    },
    releaseReadback: async () => ({ releaseSha: SHA, deploymentSha: SHA }),
    recoveryReadback: async () => ({ projectRef: PROJECT_REF, completedBackupCount: 1 }),
    currentMainReadback: async () => ({ sha: SHA }),
    withPostgresImpl: async (_url, _options, work) => work(client),
    runWithLock: async (_client, work) => work(),
    now: () => 500,
  };
}

test("WBS transfer accepts only one transferId input", () => {
  assert.deepEqual(parseTransferArgs(["--transfer-id", TRANSFER_ID]), {
    transferId: TRANSFER_ID,
  });
  assert.throws(
    () => parseTransferArgs(["--transfer-id", TRANSFER_ID, "--actor", "user-1"]),
    /Usage/,
  );
});

test("WBS transfer Release evidence rejects a different SHA", async () => {
  await assert.rejects(
    verifyWbsTransferReleaseEvidence({
      sha: SHA,
      repository: "963sup/Line_Bot_v1",
      token: "token",
      fetchImpl: releaseFetch({ sha: OTHER_SHA }),
    }),
    /Exact-SHA successful Release evidence was not found/,
  );
});

test("WBS transfer Release evidence binds successful validation, schema and deployment jobs", async () => {
  const evidence = await verifyWbsTransferReleaseEvidence({
    sha: SHA,
    repository: "963sup/Line_Bot_v1",
    token: "token",
    fetchImpl: releaseFetch(),
  });
  assert.deepEqual(evidence, {
    releaseSha: SHA,
    deploymentSha: SHA,
    releaseRunId: 17,
    jobIds: {
      "validation / validate": 1,
      supabase: 2,
      deployment: 3,
    },
  });
});

test("WBS transfer rejects a different confirmed Supabase target", () => {
  assert.throws(
    () => wbsTransferOperatorConfig(operatorEnv({ SUPABASE_CONFIRM_PROJECT: "other-project" })),
    /must exactly match target project/,
  );
});

test("WBS transfer rejects caller-faked mutation context", async () => {
  let executed = false;
  await assert.rejects(
    runWbsTransferOperator({
      transferId: TRANSFER_ID,
      env: operatorEnv({
        GITHUB_ACTIONS: "false",
        PROVIDER_RECOVERY_READY: "true",
        DEPLOYED_SHA: SHA,
      }),
      ...operatorDependencies({
        execute: async () => {
          executed = true;
        },
      }),
    }),
    /GitHub Actions/,
  );
  assert.equal(executed, false);
});

test("ACTIVE retry verifies stored mapping on later current main without Release or recovery gates", async () => {
  let executed = false;
  const dependencies = operatorDependencies({
    readActive: async () => ({
      id: TRANSFER_ID,
      state: "ACTIVE",
      sourceVersion: 3,
      revisionCount: 3,
      commandCount: 3,
      sourceHash: "c".repeat(64),
      releaseSha: SHA,
    }),
    execute: async () => {
      executed = true;
    },
  });
  dependencies.currentMainReadback = async () => ({ sha: OTHER_SHA });
  dependencies.releaseReadback = async () => {
    throw new Error("later docs-only Release jobs were skipped");
  };
  dependencies.recoveryReadback = async () => {
    throw new Error("recovery must not run for verified ACTIVE readback");
  };

  const result = await runWbsTransferOperator({
    transferId: TRANSFER_ID,
    env: operatorEnv({ GITHUB_SHA: OTHER_SHA, SUPABASE_RELEASE_SHA: OTHER_SHA }),
    ...dependencies,
  });

  assert.deepEqual(result, {
    state: "ACTIVE",
    sourceVersion: 3,
    revisionCount: 3,
    commandCount: 3,
    sourceHash: "c".repeat(64),
    releaseSha: SHA,
  });
  assert.equal(executed, false);
});

test("REQUESTED transfer remains blocked when the current Release deployment evidence is absent", async () => {
  let executed = false;
  const dependencies = operatorDependencies({
    readActive: async () => null,
    execute: async () => {
      executed = true;
    },
  });
  dependencies.releaseReadback = async () => {
    throw new Error("successful deployment job evidence is absent");
  };

  await assert.rejects(
    runWbsTransferOperator({
      transferId: TRANSFER_ID,
      env: operatorEnv(),
      ...dependencies,
    }),
    /deployment job evidence is absent/,
  );
  assert.equal(executed, false);
});

test("CANCELLED transfer cannot be reactivated through the Release operator", async () => {
  const durable = {
    id: TRANSFER_ID,
    repositoryId: "repository-1",
    projectId: "project-1",
    actorUserId: "user-1",
    requestId: "request-1",
    state: "CANCELLED",
    sourceVersion: 3,
    sourceHeadRevisionId: "revision-3",
    revisionCount: 3,
    commandCount: 3,
    sourceHash: "c".repeat(64),
    requestedAt: 100,
    activatedAt: null,
    releaseSha: null,
    cancelledAt: 400,
    cancelRequestId: "cancel-request-1",
  };
  const cancelled = Object.assign(new Error("已撤回的 WBS 移轉不能啟用。"), { status: 409 });
  const calls = { readActive: 0, execute: 0, release: 0, recovery: 0 };
  let imported = false;
  const dependencies = operatorDependencies({
    readActive: async () => {
      calls.readActive += 1;
      return durable.state === "ACTIVE" ? durable : null;
    },
    execute: async ({ transferId, command }) => {
      calls.execute += 1;
      assert.equal(transferId, TRANSFER_ID);
      assert.deepEqual(command, {
        transferId: TRANSFER_ID,
        currentMainSha: SHA,
        deployedSha: SHA,
        providerRecoveryReady: true,
      });
      if (durable.state === "CANCELLED") throw cancelled;
      imported = true;
    },
  });
  dependencies.releaseReadback = async () => {
    calls.release += 1;
    return { releaseSha: SHA, deploymentSha: SHA };
  };
  dependencies.recoveryReadback = async () => {
    calls.recovery += 1;
    return { projectRef: PROJECT_REF, completedBackupCount: 1 };
  };

  const error = await runWbsTransferOperator({
    transferId: TRANSFER_ID,
    env: operatorEnv(),
    ...dependencies,
  }).catch((caught) => caught);

  assert.equal(error, cancelled);
  assert.deepEqual(calls, { readActive: 1, execute: 1, release: 1, recovery: 1 });
  assert.equal(imported, false);
});

test("WBS transfer fails closed when provider recovery readback fails", async () => {
  let executed = false;
  const dependencies = operatorDependencies({
    execute: async () => {
      executed = true;
    },
  });
  dependencies.recoveryReadback = async () => {
    throw new Error("provider recovery unavailable");
  };
  await assert.rejects(
    runWbsTransferOperator({
      transferId: TRANSFER_ID,
      env: operatorEnv(),
      ...dependencies,
    }),
    /provider recovery unavailable/,
  );
  assert.equal(executed, false);
});

test("WBS transfer delegates unknown-result recovery to the same durable transferId", async () => {
  const commands = [];
  let attempts = 0;
  const runtime = {
    async execute({ transferId, command }) {
      commands.push({ transferId, command });
      attempts += 1;
      if (attempts === 1) {
        throw new Error("database result unknown after connection loss");
      }
      return {
        id: TRANSFER_ID,
        state: "ACTIVE",
        sourceVersion: 3,
        revisionCount: 3,
        commandCount: 3,
        sourceHash: "c".repeat(64),
        releaseSha: SHA,
      };
    },
  };
  const first = runWbsTransferOperator({
    transferId: TRANSFER_ID,
    env: operatorEnv(),
    ...operatorDependencies(runtime),
  });
  await assert.rejects(first, /result unknown/);
  const recovered = await runWbsTransferOperator({
    transferId: TRANSFER_ID,
    env: operatorEnv(),
    ...operatorDependencies(runtime),
  });

  assert.equal(recovered.state, "ACTIVE");
  assert.equal(commands.length, 2);
  assert.equal(commands[0].transferId, TRANSFER_ID);
  assert.deepEqual(commands[1].command, commands[0].command);
  assert.deepEqual(commands[1].command, {
    transferId: TRANSFER_ID,
    currentMainSha: SHA,
    deployedSha: SHA,
    providerRecoveryReady: true,
  });
});

test("operator Database never lowers the privileged connection to line_app", async () => {
  const queries = [];
  let authorizations = 0;
  const client = {
    async query(text) {
      queries.push(text);
      return { rows: [], rowCount: 0 };
    },
  };
  const database = createWbsTransferOperatorDatabase(
    client,
    (execute) => ({ query: execute }),
    async () => {
      authorizations += 1;
    },
  );
  await database.transaction(async (sql) => {
    await sql.query("SELECT 1");
    return "done";
  });
  assert.deepEqual(queries, [
    "BEGIN",
    "SET LOCAL search_path = app_private, pg_catalog",
    "SET LOCAL statement_timeout = '120s'",
    "SELECT 1",
    "COMMIT",
  ]);
  assert.equal(
    queries.some((query) => query.includes("SET LOCAL ROLE")),
    false,
  );
  assert.equal(authorizations, 2);
});

test("operator Database rolls back without COMMIT when main advances before a write", async () => {
  const queries = [];
  let authorizations = 0;
  const client = {
    async query(text) {
      queries.push(text);
      return { rows: [], rowCount: 0 };
    },
  };
  const database = createWbsTransferOperatorDatabase(
    client,
    (execute) => ({ query: execute }),
    async () => {
      authorizations += 1;
      if (authorizations === 2) throw new Error("current main advanced");
    },
  );

  await assert.rejects(
    database.transaction(async (sql) => {
      await sql.query("SELECT 1");
      await sql.query("INSERT INTO project_wbs(project_id) VALUES($1)", ["project-1"]);
    }),
    /current main advanced/,
  );
  assert.deepEqual(queries, [
    "BEGIN",
    "SET LOCAL search_path = app_private, pg_catalog",
    "SET LOCAL statement_timeout = '120s'",
    "SELECT 1",
    "ROLLBACK",
  ]);
  assert.equal(queries.includes("COMMIT"), false);
});

test("operator ACTIVE readback uses a read-only transaction and never commits", async () => {
  const queries = [];
  const client = {
    async query(text) {
      queries.push(text);
      return { rows: [], rowCount: 0 };
    },
  };
  const database = createWbsTransferOperatorDatabase(
    client,
    (execute) => ({ query: execute }),
    async () => ({ sha: SHA }),
    { readOnly: true },
  );

  await database.transaction((sql) => sql.query("SELECT 1"));
  assert.deepEqual(queries, [
    "BEGIN READ ONLY",
    "SET LOCAL search_path = app_private, pg_catalog",
    "SET LOCAL statement_timeout = '120s'",
    "SELECT 1",
    "ROLLBACK",
  ]);
  assert.equal(queries.includes("COMMIT"), false);
  await assert.rejects(
    database.transaction((sql) => sql.query("UPDATE wbs_scope_transfers SET state='ACTIVE'")),
    /attempted a database write/,
  );
});

test("current-main write authorization failure does not expose operator secrets", async () => {
  let checks = 0;
  const dependencies = operatorDependencies({
    async execute({ authorizeWrite }) {
      await authorizeWrite();
      throw new Error("unreachable");
    },
  });
  dependencies.currentMainReadback = async () => {
    checks += 1;
    return { sha: checks < 4 ? SHA : OTHER_SHA };
  };

  const error = await runWbsTransferOperator({
    transferId: TRANSFER_ID,
    env: operatorEnv(),
    ...dependencies,
  }).catch((caught) => caught);
  assert.match(error.message, /current-main readback changed/);
  for (const secret of ["github-token", "supabase-token", "password"]) {
    assert.equal(error.message.includes(secret), false);
  }
});
