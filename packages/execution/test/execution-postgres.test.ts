import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createContracts } from "@line_bot_v1/contract/application/use-cases/contracts";
import { createPostgresContractDependencies } from "@line_bot_v1/contract/composition/bootstrap/contracts";
import { postgresSessions } from "@line_bot_v1/platform/testing/postgres-sessions";
import { createExecutions } from "../src/application/use-cases/executions.js";
import { createPostgresExecutionDependencies } from "../src/composition/bootstrap/executions.js";

const url = process.env.CAPABILITY_TEST_DATABASE_URL;
test("independent PostgreSQL sessions serialize Execution replay, reviews and Contract close", {
  skip: !url && !process.env.CI,
}, async (t) => {
  assert.ok(url, "CI requires its disposable PostgreSQL service");
  const { pool, db, close } = await postgresSessions(url);
  t.after(close);
  await db.transaction(async (sql) => {
    await sql.query(
      "INSERT INTO users(id,status,status_version,\"createdAt\") VALUES('owner','active',1,1)",
    );
    await sql.query("SELECT claim_account_login('owner','USER','owner',1)");
  });
  await pool.query(
    "SELECT * FROM app_private.provision_repository('repo','owner','owner','USER','Execution','private')",
  );
  const contractId = randomUUID();
  const draftId = randomUUID();
  const activeId = randomUUID();
  const lineId = randomUUID();
  const line = {
    lineId,
    resource: {
      resourceId: randomUUID(),
      resourceRevisionId: randomUUID(),
      resourceVersion: 1,
      name: "Concrete",
      measure: { id: "length", name: "Length", subject: "work", unit: "m" },
      sourceQuantity: "10",
    },
    agreedQuantity: "2",
  };
  await db.transaction(async (sql) => {
    await sql.query(
      "INSERT INTO engineering_contracts(id,repository_id,version,head_revision_id) VALUES($1,'repo',2,$2)",
      [contractId, activeId],
    );
    await sql.query(
      `INSERT INTO engineering_contract_revisions(
         id,contract_id,repository_id,version,parent_revision_id,actor_user_id,at,action,state,title,body,lines
       ) VALUES($1,$2,'repo',1,NULL,'owner',1,'create','DRAFT','Contract','body',$3::jsonb),
               ($4,$2,'repo',2,$1,'owner',2,'activate','ACTIVE','Contract','body',$3::jsonb)`,
      [draftId, contractId, JSON.stringify([line]), activeId],
    );
  });
  const executions = createExecutions({
    ...createPostgresExecutionDependencies(db),
    now: () => 10,
  });
  const command = {
    action: "submit" as const,
    repositoryId: "repo",
    executionId: randomUUID(),
    requestId: randomUUID(),
    expectedVersion: 0,
    contractId,
    contractRevisionId: activeId,
    lineId,
    quantity: "3",
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

  const closeCommand = {
    action: "close" as const,
    repositoryId: "repo",
    contractId,
    requestId: randomUUID(),
    expectedVersion: 2,
  };
  const contract = createContracts({ ...createPostgresContractDependencies(db), now: () => 20 });
  const late = { ...command, executionId: randomUUID(), requestId: randomUUID() };
  const [closed, submitted] = await Promise.allSettled([
    contract.execute("owner", closeCommand),
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
