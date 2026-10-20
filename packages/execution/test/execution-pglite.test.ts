import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createContracts } from "@line_bot_v1/contract/application/use-cases/contracts";
import { createPostgresContractDependencies } from "@line_bot_v1/contract/composition/bootstrap/contracts";
import type { Database, Sql } from "@line_bot_v1/platform/postgres";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { createObjects } from "@line_bot_v1/resources/application/use-cases/objects";
import { createPostgresObjectDependencies } from "@line_bot_v1/resources/composition/bootstrap/objects";
import { createExecutions } from "../src/application/use-cases/executions.js";
import { createPostgresExecutionDependencies } from "../src/composition/bootstrap/executions.js";
import { ExecutionError } from "../src/domain/error.js";
import { reviseExecution } from "../src/domain/execution.js";

const contractId = "11111111-1111-4111-8111-111111111111";
const draftId = "22222222-2222-4222-8222-222222222222";
const activeId = "33333333-3333-4333-8333-333333333333";
const lineId = "44444444-4444-4444-8444-444444444444";
const resourceId = "55555555-5555-4555-8555-555555555555";
const resourceRevisionId = "66666666-6666-4666-8666-666666666666";

const line = {
  lineId,
  resource: {
    resourceId,
    resourceRevisionId,
    resourceVersion: 1,
    name: "Concrete",
    measure: { id: "length", name: "Length", subject: "work", unit: "m" as const },
    sourceQuantity: "10",
  },
  agreedQuantity: "2",
};

async function seedContract(sql: Sql) {
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
}

async function setup(db: Database, provision: (sql: string) => Promise<unknown>) {
  await db.transaction(async (sql) => {
    for (const id of ["owner", "viewer"]) {
      await sql.query(
        "INSERT INTO users(id,status,status_version,\"createdAt\") VALUES($1,'active',1,1)",
        [id],
      );
      await sql.query("SELECT claim_account_login($1,'USER',$1,1)", [id]);
    }
  });
  await provision(
    "SELECT * FROM app_private.provision_repository('repo','owner','owner','USER','Execution','private')",
  );
  await provision(
    "SELECT * FROM app_private.provision_repository('other','owner','owner','USER','Other','private')",
  );
  await db.transaction(seedContract);
}

function submit(executionId: string, requestId = randomUUID()) {
  return {
    action: "submit" as const,
    repositoryId: "repo",
    executionId,
    requestId,
    expectedVersion: 0,
    contractId,
    contractRevisionId: activeId,
    lineId,
    quantity: "5.125",
    note: "installed",
  };
}

test("Execution Postgres transaction preserves scope, exact replay, source lifecycle and rollback", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  await setup(db, (sql) => pg.query(sql));
  const dependencies = createPostgresExecutionDependencies(db);
  const executions = createExecutions({ ...dependencies, now: () => 100 });
  const executionId = randomUUID();
  const command = submit(executionId);
  const first = await executions.execute("owner", command);
  assert.deepEqual(await executions.execute("owner", command), first);
  await assert.rejects(
    executions.execute("owner", { ...command, quantity: "6" }),
    (error) => error instanceof ExecutionError && error.code === "CONFLICT",
  );
  await assert.rejects(executions.read("viewer", { repositoryId: "repo", executionId }));
  await assert.rejects(
    executions.read("owner", {
      repositoryId: "other",
      executionId,
      revisionId: first.revision.revisionId,
    }),
  );
  const accepted = await executions.execute("owner", {
    action: "accept",
    repositoryId: "repo",
    executionId,
    requestId: randomUUID(),
    expectedVersion: 1,
  });
  assert.equal(accepted.revision.state, "ACCEPTED");
  assert.equal(accepted.revision.quantity, first.revision.quantity);
  assert.deepEqual(accepted.revision.basis, first.revision.basis);
  await assert.rejects(
    executions.execute("owner", {
      action: "void",
      repositoryId: "repo",
      executionId,
      requestId: randomUUID(),
      expectedVersion: 1,
      reason: "stale",
    }),
    (error) => error instanceof ExecutionError && error.code === "CONFLICT",
  );

  const closeId = randomUUID();
  await db.transaction(async (sql) => {
    await sql.query(
      `INSERT INTO engineering_contract_revisions(
         id,contract_id,repository_id,version,parent_revision_id,actor_user_id,at,action,state,title,body,lines
       ) VALUES($1,$2,'repo',3,$3,'owner',3,'close','CLOSED','Contract','body',$4::jsonb)`,
      [closeId, contractId, activeId, JSON.stringify([line])],
    );
    await sql.query(
      "UPDATE engineering_contracts SET version=3,head_revision_id=$2 WHERE repository_id='repo' AND id=$1",
      [contractId, closeId],
    );
  });
  const voided = await executions.execute("owner", {
    action: "void",
    repositoryId: "repo",
    executionId,
    requestId: randomUUID(),
    expectedVersion: 2,
    reason: "duplicate",
  });
  assert.equal(voided.revision.state, "VOIDED");
  await assert.rejects(
    executions.execute("owner", submit(randomUUID())),
    (error) => error instanceof ExecutionError && error.code === "CONFLICT",
  );

  const rollbackId = randomUUID();
  await assert.rejects(
    dependencies.transactions.transact(
      "owner",
      { repositoryId: "repo", executionId: rollbackId },
      { requestId: command.requestId, payload: JSON.stringify(command) },
      async (tx) => {
        const basis = await tx.references.verifyLine(
          "owner",
          "repo",
          { contractId, contractRevisionId: activeId, lineId },
          { requireActive: false },
        );
        const next = reviseExecution(
          null,
          0,
          { action: "submit", quantity: "1", note: "rollback" },
          {
            id: tx.nextId(),
            executionId: rollbackId,
            repositoryId: "repo",
            actorUserId: "owner",
            at: 101,
          },
          basis,
        );
        await tx.executions.save(next, 0);
        await tx.record(next);
      },
    ),
  );
  await assert.rejects(executions.read("owner", { repositoryId: "repo", executionId: rollbackId }));
  assert.equal(
    (await executions.history("owner", { repositoryId: "repo", executionId })).revisions.length,
    3,
  );
  await assert.rejects(
    db.transaction((sql) =>
      sql.query("UPDATE engineering_execution_revisions SET note='tampered' WHERE id=$1", [
        first.revision.revisionId,
      ]),
    ),
  );
  await assert.rejects(
    db.transaction((sql) =>
      sql.query(
        `INSERT INTO engineering_execution_revisions(
           id,execution_id,repository_id,version,parent_revision_id,actor_user_id,at,action,state,
           contract_id,contract_revision_id,contract_revision_state,line_id,basis,quantity,note,reason
         ) SELECT $1,execution_id,repository_id,4,$2,actor_user_id,at,'void','VOIDED',
                  contract_id,$3,'ACTIVE',line_id,basis,quantity,note,'bad source'
             FROM engineering_execution_revisions WHERE id=$2`,
        [randomUUID(), voided.revision.revisionId, randomUUID()],
      ),
    ),
  );
  await pg.query("UPDATE app_private.repositories SET is_archived=true WHERE id='repo'");
  assert.deepEqual(await executions.execute("owner", command), first);
  await assert.rejects(
    executions.execute("owner", {
      action: "void",
      repositoryId: "repo",
      executionId,
      requestId: randomUUID(),
      expectedVersion: 3,
      reason: "archived",
    }),
  );
});

test("public Resources, Contract and Execution compositions preserve frozen quantity evidence end to end", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  await db.transaction(async (sql) => {
    await sql.query(
      "INSERT INTO users(id,status,status_version,\"createdAt\") VALUES('owner','active',1,1)",
    );
    await sql.query("SELECT claim_account_login('owner','USER','owner',1)");
  });
  await pg.query(
    "SELECT * FROM app_private.provision_repository('repo','owner','owner','USER','Execution flow','private')",
  );

  const resources = createObjects({ ...createPostgresObjectDependencies(db), now: () => 10 });
  const typeId = randomUUID();
  const measureId = randomUUID();
  const objectId = randomUUID();
  const resourceEnvelope = () => ({
    repositoryId: "repo",
    requestId: randomUUID(),
    expectedVersion: 0,
  });
  await resources.executeType("owner", {
    ...resourceEnvelope(),
    action: "create",
    typeId,
    name: "Installed work",
    description: "",
  });
  await resources.executeEngineering("owner", {
    ...resourceEnvelope(),
    action: "create-measure",
    measureId,
    name: "Installed length",
    subject: "Measured installed route",
    unit: "m",
  });
  await resources.executeObject("owner", {
    ...resourceEnvelope(),
    action: "create",
    objectId,
    typeId,
    name: "Cable run",
    content: "source",
  });
  const observed = (await resources.structure("owner", { repositoryId: "repo", rootId: objectId }))
    .observed;
  const quantity = await resources.executeEngineering("owner", {
    ...resourceEnvelope(),
    action: "set-quantities",
    observed,
    changes: [
      {
        objectId,
        expectedVersion: 1,
        quantity: {
          measureId,
          value: "25.500",
          purpose: "REFERENCE",
          sourceReference: null,
        },
      },
    ],
  });
  const resourceRevision = quantity.result.objects[0];
  assert.ok(resourceRevision);

  const contracts = createContracts({ ...createPostgresContractDependencies(db), now: () => 20 });
  const contractId = randomUUID();
  const lineId = randomUUID();
  await contracts.execute("owner", {
    action: "create",
    repositoryId: "repo",
    contractId,
    requestId: randomUUID(),
    expectedVersion: 0,
    title: "Cable installation",
    body: "terms",
    lines: [
      {
        lineId,
        resourceId: objectId,
        resourceRevisionId: resourceRevision.id,
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
  await resources.executeObject("owner", {
    action: "archive",
    repositoryId: "repo",
    objectId,
    requestId: randomUUID(),
    expectedVersion: 2,
  });

  const executions = createExecutions({
    ...createPostgresExecutionDependencies(db),
    now: () => 30,
  });
  const executionId = randomUUID();
  const submitted = await executions.execute("owner", {
    action: "submit",
    repositoryId: "repo",
    executionId,
    requestId: randomUUID(),
    expectedVersion: 0,
    contractId,
    contractRevisionId: active.revision.revisionId,
    lineId,
    quantity: "12.250",
    note: "installed after source archival",
  });
  assert.equal(submitted.revision.quantity, "12.25");
  assert.equal(submitted.revision.basis.resource.sourceQuantity, "25.5");
  assert.equal(submitted.revision.basis.resource.resourceRevisionId, resourceRevision.id);
  const accepted = await executions.execute("owner", {
    action: "accept",
    repositoryId: "repo",
    executionId,
    requestId: randomUUID(),
    expectedVersion: 1,
  });
  assert.equal(accepted.revision.state, "ACCEPTED");
  assert.deepEqual(accepted.revision.basis, submitted.revision.basis);
});
