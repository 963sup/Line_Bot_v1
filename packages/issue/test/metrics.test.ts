import assert from "node:assert/strict";
import { test } from "node:test";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { createPostgresIssueMetrics } from "../src/composition/bootstrap/metrics.js";

test("Issue metrics count [from,to) events and retain separate local completed state", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  await db.transaction(async (sql) => {
    await sql.query(
      "INSERT INTO users(id,status,status_version,\"createdAt\") VALUES('owner','active',1,1)",
    );
    await sql.query("SELECT claim_account_login('owner','USER','owner',1)");
  });
  await pg.query(
    "SELECT * FROM app_private.provision_repository('repo','owner','owner','USER','Metrics','private')",
  );
  await pg.query(
    "INSERT INTO app_private.issues(id,repository_id,number,publisher,title,body,criteria,state,workflow_status,version,created_at,updated_at) VALUES('i','repo',1,'owner','Issue','','','OPEN','completed',3,10,30)",
  );
  await pg.query(
    "INSERT INTO app_private.issue_events(issue_id,version,actor,action,note,data,at) VALUES('i',1,'owner','create','','{}',10),('i',2,'owner','close','','{\"state\":\"CLOSED\"}',20),('i',3,'owner','reopen','','{\"state\":\"OPEN\"}',30)",
  );
  const query = createPostgresIssueMetrics(db);
  const view = await query.read("owner", "repo", 10, 30);
  assert.equal(view.created, 1);
  assert.equal(view.closed, 1);
  assert.equal(view.reopened, 0);
  assert.equal(view.workflow.completed, 1);
  assert.equal(view.coverage.stateChanges, "recorded-events-only");
  assert.equal(view.coverage.unstructuredEvents, 1);
  assert.equal((await query.read("owner", "repo", 30, 31)).reopened, 1);
  await assert.rejects(query.read("unknown", "repo", 10, 30));
});
