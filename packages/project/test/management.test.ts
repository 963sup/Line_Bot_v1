import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import type { Database } from "@line_bot_v1/platform/postgres";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { PostgresProjectManagementStore } from "../src/adapters/outbound/persistence/postgres-project-management-store.js";
import {
  parseProjectManagementCommand,
  parseProjectManagementReceipt,
  parseProjectManagementView,
} from "../src/application/management.js";
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
  await pg.transaction(async (tx) => {
    await tx.query("select app_private.claim_scoped_namespace_name($1,$2,$3,$4,$5,$6,$7)", [
      "repository-name",
      "OWNER_ACCOUNT",
      "owner",
      "REPOSITORY",
      "repo",
      "Repo",
      2,
    ]);
    await tx.query(
      "insert into repositories(id,owner_account_id,owner_account_kind,name,visibility,version) values('repo','owner','USER','Repo','private',1)",
    );
  });
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
  assert.deepEqual(parseProjectManagementCommand(create), create);
  assert.throws(
    () => parseProjectManagementCommand({ ...create, action: "unknown-project-action" }),
    (error: unknown) => error instanceof ProjectError && error.status === 400,
  );
  const created = await store.execute(owner, create, 10);
  assert.deepEqual(parseProjectManagementReceipt(created), created);
  assert.throws(
    () => parseProjectManagementReceipt({ ...created, data: [] }),
    (error: unknown) => error instanceof ProjectError && error.status === 503,
  );
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
  const draftItemId = draft.resourceId;

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
  const fieldId = field.resourceId;
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
  assert.deepEqual(parseProjectManagementView(full), full);
  assert.throws(
    () =>
      parseProjectManagementView({
        ...full,
        fields: full.fields.map((entry, index) =>
          index === 0
            ? {
                ...entry,
                options: entry.options.map((option, optionIndex) =>
                  optionIndex === 0 ? { ...option, color: "INVISIBLE" } : option,
                ),
              }
            : entry,
        ),
      }),
    (error: unknown) => error instanceof ProjectError && error.status === 503,
  );
  assert.equal(full.project.version, 9);
  assert.equal(full.items.length, 1);
  assert.equal(full.items[0]?.id, draftItemId);
  assert.equal(full.items[0]?.kind, "ISSUE");
  assert.equal(full.items[0]?.issue?.id, issueId);
  assert.equal(full.fieldValues[0]?.value.type, "SINGLE_SELECT");
  assert.deepEqual(full.views[0]?.visibleFieldIds, [fieldId]);
  assert.equal(full.views[0]?.number, 1);
  assert.equal(full.statusUpdates[0]?.status, "ON_TRACK");

  const hiddenSource = await store.view(reader, created.projectId);
  assert.equal(hiddenSource.role, "READ");
  assert.deepEqual(hiddenSource.items, []);
  assert.deepEqual(hiddenSource.fieldValues, []);

  const byNumber = await store.viewByNumber(reader, "owner", 1);
  assert.equal(byNumber.project.id, created.projectId);
  assert.equal(byNumber.project.number, 1);

  const high = full.fields[0]?.options.find((option) => option.name === "High");
  const low = full.fields[0]?.options.find((option) => option.name === "Low");
  assert.ok(high);
  assert.ok(low);
  await store.execute(
    writer,
    {
      action: "update-field",
      requestId: randomUUID(),
      projectId: created.projectId,
      expectedVersion: 9,
      fieldId,
      fieldVersion: 1,
      name: "Severity",
      options: [
        { id: high.id, name: high.name, color: high.color, description: high.description },
        { name: "Medium", color: "ORANGE", description: "" },
      ],
    },
    20,
  );
  const afterFirstOptionReplacement = await store.view(writer, created.projectId);
  const retainedHigh = afterFirstOptionReplacement.fields[0]?.options.find(
    (option) => option.name === "High",
  );
  assert.equal(retainedHigh?.id, high.id);
  await store.execute(
    writer,
    {
      action: "update-field",
      requestId: randomUUID(),
      projectId: created.projectId,
      expectedVersion: 10,
      fieldId,
      fieldVersion: 2,
      options: [
        { id: high.id, name: high.name, color: high.color, description: high.description },
        { name: low.name, color: low.color, description: low.description },
      ],
    },
    21,
  );
  const beforeSwap = await store.view(writer, created.projectId);
  const recreatedLow = beforeSwap.fields[0]?.options.find((option) => option.name === "Low");
  assert.ok(recreatedLow);
  await store.execute(
    writer,
    {
      action: "update-field",
      requestId: randomUUID(),
      projectId: created.projectId,
      expectedVersion: 11,
      fieldId,
      fieldVersion: 3,
      options: [
        { id: recreatedLow.id, name: "High", color: recreatedLow.color, description: "" },
        { id: high.id, name: "Low", color: high.color, description: "" },
      ],
    },
    22,
  );
  const afterSwap = await store.view(writer, created.projectId);
  assert.equal(afterSwap.fields[0]?.options[0]?.id, recreatedLow.id);
  assert.equal(afterSwap.fields[0]?.options[0]?.name, "High");
  assert.equal(afterSwap.fields[0]?.options[1]?.id, high.id);
  assert.equal(afterSwap.fields[0]?.options[1]?.name, "Low");

  const secondView = await store.execute(
    writer,
    {
      action: "create-view",
      requestId: randomUUID(),
      projectId: created.projectId,
      expectedVersion: 12,
      name: "Timeline",
      layout: "ROADMAP_LAYOUT",
      visibleFieldIds: [],
    },
    24,
  );
  assert.equal(secondView.data.number, 2);
  assert.ok(secondView.resourceId);
  await store.execute(
    writer,
    {
      action: "update-view",
      requestId: randomUUID(),
      projectId: created.projectId,
      expectedVersion: 13,
      viewId: secondView.resourceId,
      viewVersion: 1,
      name: "Roadmap",
    },
    25,
  );
  await store.execute(
    writer,
    {
      action: "delete-view",
      requestId: randomUUID(),
      projectId: created.projectId,
      expectedVersion: 14,
      viewId: secondView.resourceId,
      viewVersion: 2,
    },
    26,
  );
  const replacementView = await store.execute(
    writer,
    {
      action: "create-view",
      requestId: randomUUID(),
      projectId: created.projectId,
      expectedVersion: 15,
      name: "Roadmap",
      layout: "TABLE_LAYOUT",
      visibleFieldIds: [],
    },
    27,
  );
  assert.equal(replacementView.data.number, 3);
  assert.deepEqual(
    (
      await pg.query(
        `select number::int as number,resource_id
         from app_private.number_allocations
         where family='project-view' and scope_kind='PROJECT' and scope_id=$1
         order by number`,
        [created.projectId],
      )
    ).rows,
    [
      { number: 1, resource_id: view.resourceId },
      { number: 2, resource_id: secondView.resourceId },
      { number: 3, resource_id: replacementView.resourceId },
    ],
  );

  await store.execute(
    owner,
    {
      action: "close-project",
      requestId: randomUUID(),
      projectId: created.projectId,
      expectedVersion: 16,
    },
    28,
  );
  await assert.rejects(
    store.execute(
      writer,
      {
        action: "add-draft-item",
        requestId: randomUUID(),
        projectId: created.projectId,
        expectedVersion: 17,
        title: "Closed",
        body: "",
        assigneeIds: [],
      },
      29,
    ),
    (error) => error instanceof ProjectError && error.status === 409,
  );
});

test("Project translates Namespace collisions and rolls back allocation and replay state", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());

  await activeUser(db, "owner");
  const store = new PostgresProjectManagementStore(db);
  const identity = { userId: "owner" };
  const project = await store.execute(
    identity,
    {
      action: "create-project",
      requestId: randomUUID(),
      ownerAccountId: "owner",
      ownerKind: "USER",
      expectedVersion: 0,
      title: "Plan",
      public: false,
      repositoryId: null,
      teamId: null,
    },
    10,
  );
  await store.execute(
    identity,
    {
      action: "create-field",
      requestId: randomUUID(),
      projectId: project.projectId,
      expectedVersion: 1,
      name: "Priority",
      dataType: "TEXT",
      options: [],
      iterations: [],
    },
    11,
  );

  const duplicateFieldRequestId = randomUUID();
  const duplicateField = {
    action: "create-field" as const,
    requestId: duplicateFieldRequestId,
    projectId: project.projectId,
    expectedVersion: 2,
    name: "Priority",
    dataType: "TEXT" as const,
    options: [],
    iterations: [],
  };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await assert.rejects(
      store.execute(identity, duplicateField, 12),
      (error) => error instanceof ProjectError && error.status === 409,
    );
  }

  await store.execute(
    identity,
    {
      action: "create-view",
      requestId: randomUUID(),
      projectId: project.projectId,
      expectedVersion: 2,
      name: "Board",
      layout: "BOARD_LAYOUT",
      visibleFieldIds: [],
    },
    13,
  );
  const duplicateViewRequestId = randomUUID();
  const duplicateView = {
    action: "create-view" as const,
    requestId: duplicateViewRequestId,
    projectId: project.projectId,
    expectedVersion: 3,
    name: "Board",
    layout: "TABLE_LAYOUT" as const,
    visibleFieldIds: [],
  };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await assert.rejects(
      store.execute(identity, duplicateView, 14),
      (error) => error instanceof ProjectError && error.status === 409,
    );
  }
  const nextView = await store.execute(
    identity,
    {
      ...duplicateView,
      requestId: randomUUID(),
      name: "Timeline",
    },
    15,
  );
  assert.equal(nextView.data.number, 2);
  assert.deepEqual(
    (
      await pg.query(
        "select request_id from app_private.project_commands where request_id in ($1,$2) order by request_id",
        [duplicateFieldRequestId, duplicateViewRequestId],
      )
    ).rows,
    [],
  );
});

test("Project option replacement avoids collisions with valid staging-like names", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());

  await activeUser(db, "owner");
  const store = new PostgresProjectManagementStore(db);
  const identity = { userId: "owner" };
  const project = await store.execute(
    identity,
    {
      action: "create-project",
      requestId: randomUUID(),
      ownerAccountId: "owner",
      ownerKind: "USER",
      expectedVersion: 0,
      title: "Plan",
      public: false,
      repositoryId: null,
      teamId: null,
    },
    10,
  );
  const field = await store.execute(
    identity,
    {
      action: "create-field",
      requestId: randomUUID(),
      projectId: project.projectId,
      expectedVersion: 1,
      name: "Priority",
      dataType: "SINGLE_SELECT",
      options: [
        { name: "First", color: "BLUE", description: "" },
        { name: "Second", color: "GREEN", description: "" },
      ],
      iterations: [],
    },
    11,
  );
  assert.ok(field.resourceId);
  const initial = await store.view(identity, project.projectId);
  const byId = [...(initial.fields[0]?.options ?? [])].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const lowerId = byId[0];
  const higherId = byId[1];
  assert.ok(lowerId);
  assert.ok(higherId);

  await store.execute(
    identity,
    {
      action: "update-field",
      requestId: randomUUID(),
      projectId: project.projectId,
      expectedVersion: 2,
      fieldId: field.resourceId,
      fieldVersion: 1,
      options: [
        { id: lowerId.id, name: "Lower", color: lowerId.color, description: "" },
        {
          id: higherId.id,
          name: "__namespace_stage_0",
          color: higherId.color,
          description: "",
        },
      ],
    },
    12,
  );
  await store.execute(
    identity,
    {
      action: "update-field",
      requestId: randomUUID(),
      projectId: project.projectId,
      expectedVersion: 3,
      fieldId: field.resourceId,
      fieldVersion: 2,
      options: [
        { id: higherId.id, name: "Lower", color: higherId.color, description: "" },
        {
          id: lowerId.id,
          name: "__namespace_stage_0",
          color: lowerId.color,
          description: "",
        },
      ],
    },
    13,
  );

  const updated = await store.view(identity, project.projectId);
  assert.deepEqual(
    updated.fields[0]?.options.map((option) => ({ id: option.id, name: option.name })),
    [
      { id: higherId.id, name: "Lower" },
      { id: lowerId.id, name: "__namespace_stage_0" },
    ],
  );
});

test("Organization members create ProjectV2 by default and Owner policy can restrict them", async (t) => {
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
  assert.equal(created.data.number, 1);

  const memberCommand = { ...command, requestId: randomUUID(), title: "Member Plan" };
  const memberIdentity = { userId: "member" };
  const memberCreated = await store.execute(memberIdentity, memberCommand, 11);
  assert.equal(memberCreated.version, 1);
  assert.equal(memberCreated.data.number, 2);
  assert.equal((await store.view(memberIdentity, memberCreated.projectId)).role, "ADMIN");
  assert.deepEqual(await store.execute(memberIdentity, memberCommand, 11), memberCreated);
  assert.deepEqual(
    (
      await pg.query(
        "select role from app_private.project_user_access where project_id=$1 and user_id='member'",
        [memberCreated.projectId],
      )
    ).rows,
    [{ role: "ADMIN" }],
  );

  await pg.query(
    "update app_private.organizations set member_can_create_project_v2=false,version=version+1 where account_id='org'",
  );
  await assert.rejects(
    store.execute(
      { userId: "org-admin" },
      { ...command, requestId: randomUUID(), title: "Restricted Plan" },
      12,
    ),
    (error) => error instanceof ProjectError && error.status === 403,
  );
  const ownerCreated = await store.execute(
    { userId: "owner" },
    { ...command, requestId: randomUUID(), title: "Owner Plan" },
    13,
  );
  assert.equal(ownerCreated.version, 1);
  assert.equal(ownerCreated.data.number, 3);
  assert.deepEqual(
    (
      await pg.query(
        "select role from app_private.project_user_access where project_id=$1 and user_id='owner'",
        [ownerCreated.projectId],
      )
    ).rows,
    [],
  );
});

test("Project numbering is stable across replay, copy, adoption and rollback", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());

  await activeUser(db, "owner");
  const store = new PostgresProjectManagementStore(db);
  const identity = { userId: "owner" };
  const create = {
    action: "create-project" as const,
    requestId: randomUUID(),
    ownerAccountId: "owner",
    ownerKind: "USER" as const,
    expectedVersion: 0 as const,
    title: "Source",
    public: false,
    repositoryId: null,
    teamId: null,
  };
  const source = await store.execute(identity, create, 10);
  assert.equal(source.data.number, 1);
  assert.deepEqual(await store.execute(identity, create, 10), source);

  const copy = await store.execute(
    identity,
    {
      action: "copy-project",
      requestId: randomUUID(),
      sourceProjectId: source.projectId,
      sourceExpectedVersion: 1,
      ownerAccountId: "owner",
      ownerKind: "USER",
      expectedVersion: 0,
      title: "Copy",
      includeDraftIssues: false,
    },
    11,
  );
  assert.equal(copy.data.number, 2);

  const legacyProjectId = randomUUID();
  await pg.query(
    `insert into app_private.projects(
       id,owner_account_id,owner_account_kind,number,creator,name,
       short_description,readme,is_public,closed,closed_at,deleted_at,
       version,created_at,updated_at
     ) values($1,'owner','USER',null,'owner','Legacy','','',false,false,null,null,1,12,12)`,
    [legacyProjectId],
  );
  const adopted = await store.execute(
    identity,
    {
      action: "adopt-project",
      requestId: randomUUID(),
      projectId: legacyProjectId,
      expectedVersion: 1,
    },
    13,
  );
  assert.equal(adopted.data.number, 3);

  await assert.rejects(
    store.execute(
      identity,
      {
        ...create,
        requestId: randomUUID(),
        title: "x".repeat(161),
      },
      14,
    ),
  );
  const afterRollback = await store.execute(
    identity,
    { ...create, requestId: randomUUID(), title: "After rollback" },
    15,
  );
  assert.equal(afterRollback.data.number, 4);
  assert.deepEqual(
    (
      await pg.query(
        `select number::int as number,resource_id
         from app_private.number_allocations
         where family='account-project' and scope_kind='USER' and scope_id='owner'
         order by number`,
      )
    ).rows,
    [
      { number: 1, resource_id: source.projectId },
      { number: 2, resource_id: copy.projectId },
      { number: 3, resource_id: legacyProjectId },
      { number: 4, resource_id: afterRollback.projectId },
    ],
  );
});
