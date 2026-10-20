import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { PostgresProjectLifecycle } from "../src/adapters/outbound/persistence/postgres-project-lifecycle.js";
import { PostgresProjectManagementStore } from "../src/adapters/outbound/persistence/postgres-project-management-store.js";
import { createProjectManagement } from "../src/application/management.js";
import { ProjectError } from "../src/domain.js";

const fails = (status: number, message: string) => (error: unknown) =>
  error instanceof ProjectError && error.status === status && error.message === message;

test("Project lifecycle preserves transitions, replay authority, error precedence and rollback", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  for (const id of ["owner", "admin", "reader"]) {
    await db.transaction(async (sql) => {
      await sql.query(
        "INSERT INTO users(id,status,status_version,\"createdAt\") VALUES($1,'active',1,1)",
        [id],
      );
      await sql.query("SELECT app_private.claim_account_login($1,'USER',$2,1)", [
        id,
        `lifecycle-${id}`,
      ]);
    });
  }
  let now = 10;
  const store = new PostgresProjectManagementStore(db);
  const management = createProjectManagement({
    activeUser: async (subject) => ({ id: subject }),
    store: () => store,
    lifecycle: () => new PostgresProjectLifecycle(db),
    now: () => now,
  });
  const created = await management.command("owner", {
    action: "create-project",
    requestId: randomUUID(),
    ownerAccountId: "owner",
    ownerKind: "USER",
    expectedVersion: 0,
    title: "Lifecycle",
    public: false,
    repositoryId: null,
    teamId: null,
  });
  const projectId = created.projectId;
  await pg.query(
    "INSERT INTO project_user_access(project_id,user_id,role,version,created_at,updated_at) VALUES($1,'admin','ADMIN',1,10,10),($1,'reader','READ',1,10,10)",
    [projectId],
  );
  const close = { action: "close-project", requestId: randomUUID(), projectId, expectedVersion: 1 };
  now = 20;
  const closed = await management.command("admin", close);
  assert.deepEqual(closed, {
    requestId: close.requestId,
    action: close.action,
    projectId,
    resourceId: null,
    version: 2,
    at: 20,
    data: { closed: true },
  });
  const readState = async () => (await store.view({ userId: "owner" }, projectId)).project;
  assert.equal((await readState()).closedAt, 20);
  now = 30;
  assert.deepEqual(await management.command("admin", close), closed);
  await assert.rejects(
    management.command("admin", { ...close, expectedVersion: 2 }),
    fails(409, "此請求編號已用於不同 Project 操作。"),
  );
  await assert.rejects(
    management.command("owner", { ...close, requestId: randomUUID(), expectedVersion: 2 }),
    fails(409, "Project 已關閉，目前 planning facts 為唯讀。"),
  );
  await assert.rejects(
    management.command("reader", { ...close, requestId: randomUUID(), expectedVersion: 1 }),
    fails(409, "Project 已更新，請重新讀取後再操作。"),
  );
  await assert.rejects(
    management.command("reader", { ...close, requestId: randomUUID(), expectedVersion: 2 }),
    fails(403, "目前 Project access 不允許此操作。"),
  );

  await pg.query(
    "UPDATE project_user_access SET role='READ',version=version+1 WHERE project_id=$1 AND user_id='admin'",
    [projectId],
  );
  assert.deepEqual(await management.command("admin", close), closed);
  await pg.query("DELETE FROM project_user_access WHERE project_id=$1 AND user_id='admin'", [
    projectId,
  ]);
  await assert.rejects(management.command("admin", close), fails(404, "找不到可存取的 Project。"));
  const reopen = {
    action: "reopen-project",
    requestId: randomUUID(),
    projectId,
    expectedVersion: 2,
  };
  const reopened = await management.command("owner", reopen);
  assert.deepEqual(reopened.data, { closed: false });
  assert.equal(reopened.version, 3);
  assert.equal((await readState()).closedAt, null);
  assert.deepEqual(await management.command("owner", reopen), reopened);
  await assert.rejects(
    management.command("owner", { ...reopen, requestId: randomUUID(), expectedVersion: 3 }),
    fails(409, "Project 已開啟。"),
  );
  assert.equal(
    (await pg.query("SELECT * FROM project_events WHERE project_id=$1", [projectId])).rows.length,
    3,
  );
  assert.equal((await pg.query("SELECT * FROM project_commands")).rows.length, 3);

  const rollback = await management.command("owner", {
    action: "create-project",
    requestId: randomUUID(),
    ownerAccountId: "owner",
    ownerKind: "USER",
    expectedVersion: 0,
    title: "Rollback",
    public: false,
    repositoryId: null,
    teamId: null,
  });
  await pg.query(
    "INSERT INTO project_events(project_id,version,actor,action,data,at) VALUES($1,2,'owner','collision','{}',30)",
    [rollback.projectId],
  );
  const failedRequest = randomUUID();
  await assert.rejects(
    management.command("owner", {
      action: "close-project",
      requestId: failedRequest,
      projectId: rollback.projectId,
      expectedVersion: 1,
    }),
  );
  const afterFailure = (await store.view({ userId: "owner" }, rollback.projectId)).project;
  assert.equal(afterFailure.closed, false);
  assert.equal(afterFailure.closedAt, null);
  assert.equal(afterFailure.version, 1);
  assert.deepEqual(
    (await pg.query("SELECT * FROM project_commands WHERE request_id=$1", [failedRequest])).rows,
    [],
  );
});
