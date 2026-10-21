import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createContentPlans } from "@line_bot_v1/content/application/use-cases/plans";
import { createPostgresContentPlanDependencies } from "@line_bot_v1/content/composition/bootstrap/plans";
import { createContracts } from "@line_bot_v1/contract/application/use-cases/contracts";
import { createPostgresContractDependencies } from "@line_bot_v1/contract/composition/bootstrap/contracts";
import { postgresSessions } from "@line_bot_v1/platform/testing/postgres-sessions";
import { createExecutions } from "../src/application/use-cases/executions.js";
import { createPostgresExecutionDependencies } from "../src/composition/bootstrap/executions.js";

const url = process.env.CAPABILITY_TEST_DATABASE_URL;
test("independent PostgreSQL sessions serialize replay, competing reviews and Contract close against submit", {
  skip: !url && !process.env.CI,
}, async (t) => {
  assert.ok(url, "CI requires its disposable PostgreSQL service");
  const { pool, db, close } = await postgresSessions(url);
  t.after(close);
  await db.transaction(async (sql) => {
    await sql.query(
      `INSERT INTO users(id,status,status_version,"createdAt") VALUES('owner','active',1,1)`,
    );
    await sql.query("SELECT claim_account_login('owner','USER','owner',1)");
  });
  await pool.query(
    "SELECT * FROM app_private.provision_repository('repo','owner','owner','USER','Execution','private')",
  );

  const ids = {
    measure: randomUUID(),
    subject: randomUUID(),
    object: randomUUID(),
    subobject: randomUUID(),
    work: randomUUID(),
    task: randomUUID(),
  };
  const plans = createContentPlans({
    ...createPostgresContentPlanDependencies(db),
    now: () => 1,
  });
  const plan = await plans.execute("owner", {
    action: "initialize",
    repositoryId: "repo",
    requestId: randomUUID(),
    expectedVersion: 0,
    document: {
      schemaVersion: 1,
      measures: [{ id: ids.measure, name: "Count", subject: "Installed", unit: "pcs" }],
      nodes: [
        {
          id: ids.subject,
          parentId: null,
          position: 0,
          kind: "SUBJECT",
          title: "Project",
          body: "",
          plannedQuantity: null,
        },
        {
          id: ids.object,
          parentId: ids.subject,
          position: 0,
          kind: "OBJECT",
          title: "Building",
          body: "",
          plannedQuantity: null,
        },
        {
          id: ids.subobject,
          parentId: ids.object,
          position: 0,
          kind: "SUBOBJECT",
          title: "Floor",
          body: "",
          plannedQuantity: null,
        },
        {
          id: ids.work,
          parentId: ids.subobject,
          position: 0,
          kind: "WORK",
          title: "Install",
          body: "",
          plannedQuantity: { measureId: ids.measure, value: "10" },
        },
        {
          id: ids.task,
          parentId: ids.work,
          position: 0,
          kind: "TASK",
          title: "Fix unit",
          body: "",
          plannedQuantity: { measureId: ids.measure, value: "1" },
        },
      ],
      resourcePins: [],
    },
  });
  const contracts = createContracts({
    ...createPostgresContractDependencies(db),
    now: () => 2,
  });
  const contractId = randomUUID();
  const lineId = randomUUID();
  await contracts.execute("owner", {
    action: "create",
    repositoryId: "repo",
    contractId,
    requestId: randomUUID(),
    expectedVersion: 0,
    title: "Installation",
    body: "",
    lines: [
      {
        lineId,
        planRevisionId: plan.revision.revisionId,
        nodeId: ids.task,
        agreedQuantity: "10",
      },
    ],
  });
  const active = await contracts.execute("owner", {
    action: "activate",
    repositoryId: "repo",
    contractId,
    requestId: randomUUID(),
    expectedVersion: 1,
  });

  const executions = createExecutions({
    ...createPostgresExecutionDependencies(db),
    now: () => 3,
  });
  const command = {
    action: "submit" as const,
    repositoryId: "repo",
    executionId: randomUUID(),
    requestId: randomUUID(),
    expectedVersion: 0,
    contractId,
    contractRevisionId: active.revision.revisionId,
    lineId,
    task: { planRevisionId: plan.revision.revisionId, nodeId: ids.task },
    resources: [],
    observedDependencyVersion: 0,
    quantity: "1",
    note: "done",
  };
  const [first, replay] = await Promise.all([
    executions.execute("owner", command),
    executions.execute("owner", command),
  ]);
  assert.deepEqual(first, replay);

  const reviews = await Promise.allSettled([
    executions.execute("owner", {
      action: "accept",
      repositoryId: "repo",
      executionId: command.executionId,
      requestId: randomUUID(),
      expectedVersion: 1,
    }),
    executions.execute("owner", {
      action: "reject",
      repositoryId: "repo",
      executionId: command.executionId,
      requestId: randomUUID(),
      expectedVersion: 1,
      reason: "competing review",
    }),
  ]);
  assert.equal(reviews.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(reviews.filter((result) => result.status === "rejected").length, 1);

  const late = { ...command, executionId: randomUUID(), requestId: randomUUID() };
  const [closed, submitted] = await Promise.allSettled([
    contracts.execute("owner", {
      action: "close",
      repositoryId: "repo",
      contractId,
      requestId: randomUUID(),
      expectedVersion: 2,
    }),
    executions.execute("owner", late),
  ]);
  assert.equal(closed.status, "fulfilled");
  if (submitted.status === "fulfilled") {
    assert.equal(submitted.value.revision.state, "SUBMITTED");
  } else {
    await assert.rejects(
      executions.read("owner", { repositoryId: "repo", executionId: late.executionId }),
    );
  }
  await assert.rejects(
    executions.execute("owner", {
      ...late,
      executionId: randomUUID(),
      requestId: randomUUID(),
    }),
  );
});
