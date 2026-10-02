import assert from "node:assert/strict";
import { test } from "node:test";
import type { Database } from "@line_bot_v1/platform/postgres";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { PostgresNotificationRepository } from "../src/adapters/outbound/persistence/postgres-notification-repository.js";

async function activeUser(db: Database, id: string) {
  await db.transaction(async (sql) => {
    await sql.query(
      "insert into users(id,status,status_version,\"createdAt\") values($1,'active',1,1)",
      [id],
    );
    await sql.query("select app_private.claim_account_login($1,'USER',$2,1)", [id, id]);
  });
}

test("Repository-backed notifications recheck source access on create and read", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  for (const id of ["owner", "assignee", "viewer", "outsider"]) await activeUser(db, id);

  await pg.query(
    "insert into app_private.repositories(id,owner_account_id,owner_account_kind,name,visibility,version) values('repo','owner','USER','Repo','private',1)",
  );
  await pg.query(
    "insert into app_private.repository_access(repository_id,principal_id,capability,version) values('repo','viewer','read',1)",
  );
  await pg.query(
    `insert into app_private.issues(
       id,repository_id,number,publisher,title,body,criteria,state,state_reason,workflow_status,version,created_at,updated_at
     ) values('issue','repo',1,'owner','Issue','Body','Done','OPEN',NULL,'pending',1,1,1)`,
  );
  await pg.query(
    "insert into app_private.issue_assignees(issue_id,user_id,assigned_at) values('issue','assignee',1)",
  );

  const insertIssueNotification = (id: string, recipient: string, at: number) =>
    pg.query(
      `insert into app_private.notifications(
         id,recipient,source_type,source_id,source_version,kind,title,body,created_at,version
       ) values($1,$2,'issue','issue','1','issue','Issue changed','Read the issue',$3,1)`,
      [id, recipient, at],
    );

  await insertIssueNotification("11111111-1111-4111-8111-111111111111", "viewer", 10);
  const repository = new PostgresNotificationRepository(db);
  assert.equal((await repository.read("viewer", {})).items.length, 1);

  await pg.query(
    "delete from app_private.repository_access where repository_id='repo' and principal_id='viewer'",
  );
  assert.deepEqual(await repository.read("viewer", {}), { items: [] });
  assert.equal(
    await repository.markRead("viewer", "11111111-1111-4111-8111-111111111111", 11),
    null,
  );
  await assert.rejects(
    insertIssueNotification("22222222-2222-4222-8222-222222222222", "viewer", 12),
    (error: unknown) => (error as { code?: string }).code === "42501",
  );

  await pg.query("update app_private.repositories set visibility='public' where id='repo'");
  await insertIssueNotification("33333333-3333-4333-8333-333333333333", "outsider", 13);
  assert.equal((await repository.read("outsider", {})).items.length, 1);

  await pg.query("update app_private.repositories set visibility='private' where id='repo'");
  assert.deepEqual(await repository.read("outsider", {}), { items: [] });

  await pg.query(
    `insert into app_private.notifications(
       id,recipient,source_type,source_id,source_version,kind,title,body,created_at,version
     ) values('44444444-4444-4444-8444-444444444444','outsider','system','maintenance','1','system','System','Message',14,1)`,
  );
  const systemOnly = await repository.read("outsider", {});
  assert.deepEqual(
    systemOnly.items.map((item) => item.sourceType),
    ["system"],
  );
});
