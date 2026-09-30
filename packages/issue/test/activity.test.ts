import assert from "node:assert/strict";
import { test } from "node:test";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { PostgresIssueActivityStore } from "../src/adapters/postgres/activity.js";

test("Issue activity projects only Issues in currently accessible Repositories", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());

  await db.transaction(async (sql) => {
    for (const [id, login, at] of [
      ["viewer", "viewer", 1],
      ["owner", "acme", 2],
    ] as const) {
      await sql.query('insert into users(id,status,"createdAt") values($1,$2,$3)', [
        id,
        "active",
        at,
      ]);
      await sql.query("select app_private.claim_account_login($1,'USER',$2,$3)", [id, login, at]);
    }
  });

  await pg.query(
    "insert into app_private.repositories(id,owner_account_id,owner_account_kind,name,visibility,version) values($1,$2,'USER',$3,'private',1)",
    ["repository-a", "owner", "Operations"],
  );
  await pg.query(
    "insert into app_private.repository_access(repository_id,principal_id,capability,version) values($1,$2,'read',1)",
    ["repository-a", "viewer"],
  );
  await pg.query(
    `insert into app_private.issues(
       id,repository_id,number,publisher,assignee,title,criteria,status,version,created_at,updated_at
     ) values($1,$2,1,$3,$4,$5,$6,'pending',1,90,90)`,
    ["issue-a", "repository-a", "owner", "viewer", "Prepare payroll", "Complete review"],
  );
  await pg.query(
    "insert into app_private.issue_events(issue_id,version,actor,action,note,at) values($1,1,$2,'create','',96)",
    ["issue-a", "owner"],
  );

  const store = new PostgresIssueActivityStore(db);
  assert.deepEqual(await store.activity("viewer", 1), [
    {
      id: "issue-a:1",
      occurredAt: 96,
      actorLogin: "acme",
      action: "create",
      repository: {
        id: "repository-a",
        ownerLogin: "acme",
        name: "Operations",
      },
      issue: {
        number: 1,
        title: "Prepare payroll",
      },
    },
  ]);

  await pg.query(
    "delete from app_private.repository_access where repository_id=$1 and principal_id=$2",
    ["repository-a", "viewer"],
  );
  assert.deepEqual(await store.activity("viewer", 20), []);
});
