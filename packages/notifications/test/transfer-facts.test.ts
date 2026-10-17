import assert from "node:assert/strict";
import { test } from "node:test";
import { createSql } from "@line_bot_v1/platform/postgres";
import { createPostgresNotificationTransferFacts } from "../src/composition/bootstrap/transfer-facts.js";

test("Notifications transfer preflight counts only Repository WBS source rows", async () => {
  let statement = "";
  const sql = createSql(async (text) => {
    statement = text;
    return { rows: [{ count: "3" }] };
  });
  assert.equal(await createPostgresNotificationTransferFacts(sql).read(), 3);
  assert.match(statement, /FROM notifications/);
  assert.match(statement, /source_type='wbs-baseline'/);
  assert.doesNotMatch(statement, /project-wbs-baseline/);
});
