import assert from "node:assert/strict";
import { test } from "node:test";
import { createSql } from "@line_bot_v1/platform/postgres";
import { createPostgresActionTransferFacts } from "../src/composition/bootstrap/transfer-facts.js";

test("Actions transfer preflight counts all old rows and only the target Project rows", async () => {
  let statement = "";
  let values: readonly unknown[] | undefined;
  const sql = createSql(async (text, params) => {
    statement = text;
    values = params;
    return { rows: [{ count: "12" }] };
  });
  assert.equal(await createPostgresActionTransferFacts(sql).read("target-project"), 12);
  assert.deepEqual(values, ["target-project"]);
  for (const relation of [
    "action_rules",
    "action_rule_versions",
    "action_events",
    "action_runs",
    "action_attempts",
    "action_commands",
    "project_action_rules",
    "project_action_rule_versions",
    "project_action_events",
    "project_action_runs",
    "project_action_attempts",
    "project_action_commands",
  ])
    assert.match(statement, new RegExp(`\\b${relation}\\b`));
  assert.match(statement, /project_action_rules WHERE project_id=\$1/);
  assert.match(statement, /project_action_commands WHERE result->'rule'->>'projectId'=\$1/);
});
