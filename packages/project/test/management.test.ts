import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import type { Database } from "@line_bot_v1/platform/postgres";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { PostgresProjectManagementStore } from "../src/adapters/outbound/persistence/postgres-project-management-store.js";
import { ProjectError } from "../src/domain.js";

async function activeUser(db: Database, id: string) {
  await db.transaction(async (sql) => {
    await sql.query('insert into users(id,status,status_version,"createdAt") values($1,$2,1,$3)', [
      id,
      "active",
      1,
    ]);
    await sql.query("select app_private.claim_account_login($1,'USER',$2,$3)", [id, id, 1]);
  });
}

test("Project management composes access, draft conversion, typed fields, views and status updates", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());

  for (const userId of ["owner", "writer", "reader"]) {
    await activeUser(db, userId);
  }
  await pg.query(
    "insert into repositories(id,owner_account_id,owner_account_kind,name,visibility,version) values('repo','owner','USER','Repo','private',1)",
  );
  await pg.query(
    "insert into repository_access(repository_id,principal_id,capability,version) values('repo','writer','write',1)",
  );

  const store = new PostgresProjectManagementStore(db);
  const owner = { userId: "owner" };
  const writer = { userId: "writer" };
  const reader = { userId: "reader" };

  const create = {
    action: "create-project" as const,
    requestId: randomUUID(),
    ownerAccountId: "owner",
    ownerKind: "USER" as const,
    expectedVersion: 0 as const,
    title: "Plan",
    public: false,
    repositoryId: null,
    teamId: null,
  };
  const created = await store.execute(owner, create, 10);
  assert.equal(created.version, 1);
  assert.deepEqual(await store.execute(owner, create, 10), created);

  const initial = await store.view(owner, created.projectId);
  assert.equal(initial.project.number, 1);
  assert.equal(initial.role, "ADMIN");
  await assert.rejects(
    store.view(reader, created.projectId),
    (error) => error instanceof ProjectError && error.status === 404,
  );

  await store.execute(
    owner,
    {
      action: "update-collaborators",
      requestId: randomUUID(),
      projectId: created.projectId,
      expectedVersion: 1,
      collaborators: [{ role: "WRITER", userId: "writer" }],
    },
    11,
  );
  assert.equal((await store.view(writer, created.projectId)).role, "WRITE");

  await store.execute(
    owner,
    {
      action: "update-project",
      requestId: randomUUID(),
      projectId: created.projectId,
      expectedVersion: 2,
      public: true,
    },
    12,
  );
  assert.equal((await store.view(reader, created.projectId)).role, "READ");
  await assert.rejects(
    store.execute(
      reader,
      {
        action: "add-draft-item",
        requestId: randomUUID(),
        projectId: created.projectId,
        expectedVersion: 3,
        title: "No write",
        body: "",
        assigneeIds: [],
      },
      13,
    ),
    (error) => error instanceof ProjectError && error.status === 403,
  );

  const draft = await store.execute(
    writer,
    {
      action: "add-draft-item",
      requestId: randomUUID(),
      projectId: created.projectId,
      expectedVersion: 3,
      title: "Draft work",
      body: "Draft body",
      assigneeIds: [],
    },
    14,
  );
  assert.ok(draft.resourceId);
  const draftItemId = draft.resourceId!;

  const converted = await store.execute(
    writer,
    {
      action: "convert-draft-item",
      requestId: randomUUID(),
      projectId: created.projectId,
      expectedVersion: 4,
      itemId: draftItemId,
      itemVersion: 1,
      repositoryId: "repo",
    },
    15,
  );
  assert.equal(converted.resourceId, draftItemId);
  const issueId = converted.data.issueId;
  assert.equal(typeof issueId, "string");
  const issueRows = await pg.query(
    "select id,title,state,version from issues where repository_id='repo'",
  );
  assert.deepEqual(issueRows.rows, [
    { id: issueId, title: "Draft work", state: "OPEN", version: 1 },
  ]);

  const field = await store.execute(
    writer,
    {
      action: "create-field",
      requestId: randomUUID(),
      projectId: created.projectId,
      expectedVersion: 5,
      name: "Priority",
      dataType: "SINGLE_SELECT",
      options: [
        { name: "High", color: "RED", description: "" },
        { name: "Low", color: "GREEN", description: "" },
      ],
      iterations: [],
    },
    16,
  );
  assert.ok(field.resourceId);
  const fieldId = field.resourceId!;
  const beforeValue = await store.view(writer, created.projectId);
  const optionId = beforeValue.fields
    .find((item) => item.id === fieldId)
    ?.options.find((item) => item.name === "High")?.id;
  assert.ok(optionId);

  await store.execute(
    writer,
    {
      action: "set-field-value",
      requestId: randomUUID(),
      projectId: created.projectId,
      expectedVersion: 6,
      itemId: draftItemId,
      fieldId,
      value: { type: "SINGLE_SELECT", optionId },
    },
    17,
  );

  const view = await store.execute(
    writer,
    {
      action: "create-view",
      requestId: randomUUID(),
      projectId: created.projectId,
      expectedVersion: 7,
      name: "Board",
      layout: "BOARD_LAYOUT",
      visibleFieldIds: [fieldId],
    },
    18,
  );
  assert.ok(view.resourceId);

  const status = await store.execute(
    writer,
    {
      action: "create-status-update",
      requestId: randomUUID(),
      projectId: created.projectId,
      expectedVersion: 8,
      body: "On schedule",
      status: "ON_TRACK",
      startDate: "2026-10-01",
      targetDate: "2026-10-31",
    },
    19,
  );
  assert.ok(status.resourceId);

  const full = await store.view(writer, created.projectId);
  assert.equal(full.project.version, 9);
  assert.equal(full.items.length, 1);
  assert.equal(full.items[0]?.id, draftItemId);
  assert.equal(full.items[0]?.kind, "ISSUE");
  assert.equal(full.items[0]?.issue?.id, issueId);
  assert.equal(full.fieldValues[0]?.value.type, "SINGLE_SELECT");
  assert.deepEqual(full.views[0]?.visibleFieldIds, [fieldId]);
  assert.equal(full.statusUpdates[0]?.status, "ON_TRACK");

  const hiddenSource = await store.view(reader, created.projectId);
  assert.equal(hiddenSource.role, "READ");
  assert.deepEqual(hiddenSource.items, []);
  assert.deepEqual(hiddenSource.fieldValues, []);

  const byNumber = await store.viewByNumber(reader, "owner", 1);
  assert.equal(byNumber.project.id, created.projectId);
  assert.equal(byNumber.project.number, 1);

  await store.execute(
    owner,
    {
      action: "close-project",
      requestId: randomUUID(),
      projectId: created.projectId,
      expectedVersion: 9,
    },
    20,
  );
  await assert.rejects(
    store.execute(
      writer,
      {
        action: "add-draft-item",
        requestId: randomUUID(),
        projectId: created.projectId,
        expectedVersion: 10,
        title: "Closed",
        body: "",
        assigneeIds: [],
      },
      21,
    ),
    (error) => error instanceof ProjectError && error.status === 409,
  );
});

test("Organization FPT ADMIN can create an Organization-owned Project while MEMBER cannot", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());

  await activeUser(db, "owner");
  await activeUser(db, "org-admin");
  await activeUser(db, "member");
  await pg.query("select * from app_private.provision_organization_scope($1,$2,$3,$4,$5)", [
    "org",
    "owner",
    "acme",
    "Acme",
    2,
  ]);
  await pg.query(
    "insert into app_private.organization_memberships(organization_account_id,user_id,status,version,created_at) values('org','org-admin','active',1,3),('org','member','active',1,3)",
  );
  await pg.query(
    "insert into app_private.organization_member_role_assignments(organization_account_id,user_id,role,status,version,user_status_version,membership_version,granted_at) values('org','org-admin','ADMIN','active',1,1,1,4)",
  );

  const store = new PostgresProjectManagementStore(db);
  const command = {
    action: "create-project" as const,
    requestId: randomUUID(),
    ownerAccountId: "org",
    ownerKind: "ORGANIZATION" as const,
    expectedVersion: 0 as const,
    title: "Admin Plan",
    public: false,
    repositoryId: null,
    teamId: null,
  };
  const created = await store.execute({ userId: "org-admin" }, command, 10);
  assert.equal(created.version, 1);

  await assert.rejects(
    store.execute(
      { userId: "member" },
      { ...command, requestId: randomUUID(), title: "Denied Plan" },
      11,
    ),
    (error) => error instanceof ProjectError && error.status === 403,
  );
});
