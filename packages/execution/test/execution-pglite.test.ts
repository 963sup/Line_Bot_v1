import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createPostgresContentPlanReferenceReader } from "@line_bot_v1/content/composition/bootstrap/plan-references";
import { createPostgresContentPlans } from "@line_bot_v1/content/composition/bootstrap/plans";
import { createPostgresContracts } from "@line_bot_v1/contract/composition/bootstrap/contracts";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { createResources } from "@line_bot_v1/resources/application/use-cases/resources";
import { createPostgresResourceDependencies } from "@line_bot_v1/resources/composition/bootstrap/resources";
import { decodeExecutionRevision } from "../src/adapters/outbound/persistence/executions.js";
import { createExecutions } from "../src/application/use-cases/executions.js";
import { createTaskDependencies } from "../src/application/use-cases/task-dependencies.js";
import { createPostgresExecutionDependencies } from "../src/composition/bootstrap/executions.js";
import { createPostgresTaskDependencyDependencies } from "../src/composition/bootstrap/task-dependencies.js";
import { ExecutionError } from "../src/domain/error.js";

test("public Content, Resource, Contract, dependency and Execution compositions freeze exact evidence", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  await db.transaction(async (sql) => {
    for (const id of ["owner", "viewer"]) {
      await sql.query(
        `INSERT INTO users(id,status,status_version,"createdAt") VALUES($1,'active',1,1)`,
        [id],
      );
      await sql.query("SELECT claim_account_login($1,'USER',$1,1)", [id]);
    }
  });
  await pg.query(
    "SELECT * FROM app_private.provision_repository('repo','owner','owner','USER','Execution','private')",
  );

  const resources = createResources({ ...createPostgresResourceDependencies(db), now: () => 10 });
  const resourceId = randomUUID();
  const resource = await resources.execute("owner", {
    action: "create",
    repositoryId: "repo",
    resourceId,
    requestId: randomUUID(),
    expectedVersion: 0,
    kind: "EQUIPMENT",
    name: "Lift",
    description: "",
  });

  const measureId = randomUUID();
  const objectId = randomUUID();
  const subobjectId = randomUUID();
  const workId = randomUUID();
  const prerequisiteId = randomUUID();
  const taskId = randomUUID();
  const plans = createPostgresContentPlans({
    db,
    now: () => 20,
  });
  const plan = await plans.execute("owner", {
    action: "initialize",
    repositoryId: "repo",
    requestId: randomUUID(),
    expectedVersion: 0,
    document: {
      schemaVersion: 1,
      measures: [{ id: measureId, name: "Length", subject: "Installed", unit: "m" }],
      nodes: [
        {
          id: randomUUID(),
          parentId: null,
          position: 0,
          kind: "SUBJECT",
          title: "Project",
          body: "",
          plannedQuantity: null,
        },
      ],
      resourcePins: [],
    },
  });
  const subjectId = plan.revision.document.nodes[0]?.id;
  assert.ok(subjectId);
  const document = {
    schemaVersion: 1 as const,
    measures: plan.revision.document.measures,
    nodes: [
      ...plan.revision.document.nodes,
      {
        id: objectId,
        parentId: subjectId,
        position: 0,
        kind: "OBJECT" as const,
        title: "Building",
        body: "",
        plannedQuantity: null,
      },
      {
        id: subobjectId,
        parentId: objectId,
        position: 0,
        kind: "SUBOBJECT" as const,
        title: "Floor",
        body: "",
        plannedQuantity: null,
      },
      {
        id: workId,
        parentId: subobjectId,
        position: 0,
        kind: "WORK" as const,
        title: "Install",
        body: "",
        plannedQuantity: { measureId, value: "100" },
      },
      {
        id: prerequisiteId,
        parentId: workId,
        position: 0,
        kind: "TASK" as const,
        title: "Prepare",
        body: "",
        plannedQuantity: { measureId, value: "5" },
      },
      {
        id: taskId,
        parentId: workId,
        position: 1,
        kind: "TASK" as const,
        title: "Install lift",
        body: "",
        plannedQuantity: { measureId, value: "10" },
      },
    ],
    resourcePins: [],
  };
  const planWithTasks = await plans.execute("owner", {
    action: "replace",
    repositoryId: "repo",
    requestId: randomUUID(),
    expectedVersion: 1,
    document,
  });

  const contracts = createPostgresContracts({
    db,
    contentReader: createPostgresContentPlanReferenceReader,
    now: () => 30,
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
        planRevisionId: planWithTasks.revision.revisionId,
        nodeId: workId,
        agreedQuantity: "100",
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

  const dependencies = createTaskDependencies({
    ...createPostgresTaskDependencyDependencies(db),
    now: () => 40,
  });
  assert.equal(
    (
      await dependencies.read("owner", {
        repositoryId: "repo",
        planRevisionId: planWithTasks.revision.revisionId,
      })
    ).version,
    0,
  );
  const missingPlanRevisionId = randomUUID();
  await assert.rejects(
    dependencies.read("owner", {
      repositoryId: "repo",
      planRevisionId: missingPlanRevisionId,
    }),
    (error) => error instanceof ExecutionError && error.code === "NOT_FOUND",
  );
  await assert.rejects(
    dependencies.execute("owner", {
      action: "replace",
      repositoryId: "repo",
      planRevisionId: missingPlanRevisionId,
      requestId: randomUUID(),
      expectedVersion: 0,
      edges: [],
    }),
    (error) => error instanceof ExecutionError && error.code === "NOT_FOUND",
  );
  const dependencyCommand = {
    action: "replace",
    repositoryId: "repo",
    planRevisionId: planWithTasks.revision.revisionId,
    requestId: randomUUID(),
    expectedVersion: 0,
    edges: [{ taskId, prerequisiteTaskId: prerequisiteId }],
  } as const;
  const dependency = await dependencies.execute("owner", dependencyCommand);
  assert.deepEqual(await dependencies.execute("owner", dependencyCommand), dependency);
  await assert.rejects(
    dependencies.execute("viewer", {
      ...dependencyCommand,
      requestId: randomUUID(),
      expectedVersion: 1,
    }),
  );
  await assert.rejects(
    dependencies.execute("owner", {
      ...dependencyCommand,
      requestId: randomUUID(),
      expectedVersion: 0,
    }),
    (error) => error instanceof ExecutionError && error.code === "CONFLICT",
  );

  const executions = createExecutions({
    ...createPostgresExecutionDependencies(db),
    now: () => 50,
  });
  const executionId = randomUUID();
  const command = {
    action: "submit" as const,
    repositoryId: "repo",
    executionId,
    requestId: randomUUID(),
    expectedVersion: 0,
    contractId,
    contractRevisionId: active.revision.revisionId,
    lineId,
    task: { planRevisionId: planWithTasks.revision.revisionId, nodeId: taskId },
    resources: [{ resourceId, resourceRevisionId: resource.revision.revisionId }],
    observedDependencyVersion: dependency.revision.version,
    quantity: "12.250",
    note: "installed",
  };
  const submitted = await executions.execute("owner", command);
  assert.deepEqual(await executions.execute("owner", command), submitted);
  assert.ok("task" in submitted.revision);
  if (!("task" in submitted.revision)) assert.fail("expected Task execution");
  assert.equal(submitted.revision.quantity, "12.25");
  assert.equal(submitted.revision.task.node.id, taskId);
  assert.equal(submitted.revision.resources[0]?.resourceRevisionId, resource.revision.revisionId);
  assert.deepEqual(submitted.revision.dependency.prerequisiteTaskIds, [prerequisiteId]);
  await assert.rejects(
    executions.execute("owner", {
      ...command,
      executionId: randomUUID(),
      requestId: randomUUID(),
      observedDependencyVersion: 0,
    }),
    (error) => error instanceof ExecutionError && error.code === "CONFLICT",
  );
  await assert.rejects(
    executions.read("viewer", { repositoryId: "repo", executionId }),
    (error) => error instanceof ExecutionError && error.code === "FORBIDDEN",
  );

  const accepted = await executions.execute("owner", {
    action: "accept",
    repositoryId: "repo",
    executionId,
    requestId: randomUUID(),
    expectedVersion: 1,
  });
  assert.ok("task" in accepted.revision);
  if (!("task" in accepted.revision)) assert.fail("expected Task execution");
  assert.deepEqual(accepted.revision.dependency, submitted.revision.dependency);

  const reusableRequestId = randomUUID();
  await assert.rejects(
    dependencies.execute("owner", {
      ...dependencyCommand,
      requestId: reusableRequestId,
      expectedVersion: 1,
      edges: [
        { taskId, prerequisiteTaskId: prerequisiteId },
        { taskId: prerequisiteId, prerequisiteTaskId: taskId },
      ],
    }),
    (error) => error instanceof ExecutionError && error.code === "CONFLICT",
  );
  const replaced = await dependencies.execute("owner", {
    ...dependencyCommand,
    requestId: reusableRequestId,
    expectedVersion: 1,
    edges: [],
  });
  assert.equal(replaced.revision.version, 2, "failed graph command leaves no receipt or revision");
  assert.deepEqual(submitted.revision.dependency.prerequisiteTaskIds, [prerequisiteId]);
  await resources.execute("owner", {
    action: "archive",
    repositoryId: "repo",
    resourceId,
    requestId: randomUUID(),
    expectedVersion: 1,
  });
  const reusableExecutionRequestId = randomUUID();
  const retryExecutionId = randomUUID();
  await assert.rejects(
    executions.execute("owner", {
      ...command,
      executionId: retryExecutionId,
      requestId: reusableExecutionRequestId,
      observedDependencyVersion: replaced.revision.version,
    }),
    (error) => error instanceof ExecutionError && error.code === "CONFLICT",
  );
  const retried = await executions.execute("owner", {
    ...command,
    executionId: retryExecutionId,
    requestId: reusableExecutionRequestId,
    resources: [],
    observedDependencyVersion: replaced.revision.version,
  });
  assert.equal(retried.revision.state, "SUBMITTED", "failed submission leaves no receipt or head");

  const retiredExecutionId = randomUUID();
  const retiredRevisionId = randomUUID();
  await assert.rejects(
    db.transaction(async (sql) => {
      await sql.query(
        "INSERT INTO engineering_executions(id,repository_id,contract_id,version,head_revision_id) VALUES($1,'repo',$2,1,$3)",
        [retiredExecutionId, contractId, retiredRevisionId],
      );
      await sql.query(
        `INSERT INTO engineering_execution_revisions(
           id,execution_id,repository_id,version,parent_revision_id,actor_user_id,at,action,state,
           contract_id,contract_revision_id,contract_revision_state,line_id,basis,quantity,note,reason
         ) VALUES($1,$2,'repo',1,NULL,'owner',1,'submit','SUBMITTED',$3,$4,'ACTIVE',$5,$6::jsonb,'1','',NULL)`,
        [
          retiredRevisionId,
          retiredExecutionId,
          contractId,
          active.revision.revisionId,
          lineId,
          JSON.stringify({
            contractId,
            contractRevisionId: active.revision.revisionId,
            lineId,
            agreedQuantity: "100",
            resource: { resourceId, resourceRevisionId: resource.revision.revisionId },
          }),
        ],
      );
    }),
    (error) =>
      Boolean(error && typeof error === "object" && Reflect.get(error, "code") === "23502"),
  );

  const canonicalColumnsResourceBasisId = randomUUID();
  const canonicalColumnsResourceBasisRevisionId = randomUUID();
  const resourceBasis = {
    contractId,
    contractRevisionId: active.revision.revisionId,
    lineId,
    agreedQuantity: "100",
    resource: { resourceId, resourceRevisionId: resource.revision.revisionId },
  };
  await assert.rejects(
    db.transaction(async (sql) => {
      await sql.query(
        "INSERT INTO engineering_executions(id,repository_id,contract_id,version,head_revision_id) VALUES($1,'repo',$2,1,$3)",
        [canonicalColumnsResourceBasisId, contractId, canonicalColumnsResourceBasisRevisionId],
      );
      await sql.query(
        `INSERT INTO engineering_execution_revisions(
           id,execution_id,repository_id,version,parent_revision_id,actor_user_id,at,action,state,
           contract_id,contract_revision_id,contract_revision_state,line_id,basis,
           plan_revision_id,task_id,task,source_resources,
           dependency_version,dependency_revision_id,dependency,quantity,note,reason
         )
         SELECT $1,$2,repository_id,version,parent_revision_id,actor_user_id,at,action,state,
                contract_id,contract_revision_id,contract_revision_state,line_id,$3::jsonb,
                plan_revision_id,task_id,task,source_resources,
                dependency_version,dependency_revision_id,dependency,quantity,note,reason
         FROM engineering_execution_revisions WHERE id=$4`,
        [
          canonicalColumnsResourceBasisRevisionId,
          canonicalColumnsResourceBasisId,
          JSON.stringify(resourceBasis),
          submitted.revision.revisionId,
        ],
      );
    }),
    (error) =>
      Boolean(error && typeof error === "object" && Reflect.get(error, "code") === "23514"),
  );

  const persisted = await db.transaction(async (sql) => {
    const result = await sql.query("SELECT * FROM engineering_execution_revisions WHERE id=$1", [
      submitted.revision.revisionId,
    ]);
    return result.rows[0];
  });
  assert.ok(persisted);
  assert.throws(
    () =>
      decodeExecutionRevision({
        ...persisted,
        basis: resourceBasis,
        task: null,
        source_resources: null,
        dependency: null,
      }),
    TypeError,
  );

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
    executions.execute("owner", {
      ...command,
      executionId: randomUUID(),
      requestId: randomUUID(),
    }),
    (error) => error instanceof ExecutionError && error.code === "CONFLICT",
  );
});
