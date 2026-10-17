import assert from "node:assert/strict";
import { test } from "node:test";
import { createSql, type Database, type Sql } from "@line_bot_v1/platform/postgres";
import { createProjectBaselineNotifications } from "../src/application/use-cases/project-baseline-delivery.js";
import { createPostgresProjectBaselineDeliveryStore } from "../src/composition/bootstrap/project-baseline-delivery.js";

test("revoked Project read access prevents baseline Inbox creation", async () => {
  const statements: string[] = [];
  const sql = createSql(async (text) => {
    statements.push(text);
    if (text.includes("notification_receipts WHERE")) return { rows: [] };
    if (text.includes("notification_project_source_access")) return { rows: [] };
    return { rows: [] };
  });
  const db = {
    transaction: <T>(work: (transaction: Sql) => Promise<T>) => work(sql),
  } satisfies Database;
  const store = createPostgresProjectBaselineDeliveryStore(db, "line:primary");
  await store.create(
    {
      key: "project-actions:run:recipient",
      projectId: "project",
      baselineId: "baseline",
      revisionId: "revision",
      recipient: "recipient",
    },
    "payload",
    1,
  );
  assert.equal(
    statements.some((statement) => statement.startsWith("INSERT INTO notifications")),
    false,
  );
  assert.equal(
    statements.some(
      (statement) =>
        statement.includes("source_type='project-wbs-baseline'") &&
        statement.includes("project_id=$3") &&
        statement.includes("user_id=$4"),
    ),
    true,
  );
});

test("Project delivery fences a provider result after the parent lease is lost", async () => {
  let checks = 0;
  let completions = 0;
  const notifications = createProjectBaselineNotifications({
    store: {
      create: async () => {},
      claim: async () => ({
        result: { inbox: "created", notificationId: "notification", line: "unknown", nextAt: null },
        claim: {
          token: "lease",
          key: "intent",
          target: "target",
          payload: "payload",
          retryKey: "retry",
        },
      }),
      complete: async () => {
        completions++;
        throw new Error("stale result must not complete");
      },
      cancel: async () => {},
    },
    send: async () => "accepted",
    inboxUrl: "https://example.test/notifications",
    now: () => 1,
  });
  const result = await notifications.deliver(
    {
      key: "intent",
      projectId: "project",
      baselineId: "baseline",
      revisionId: "revision",
      recipient: "recipient",
    },
    async () => ++checks < 3,
  );
  assert.equal(result.line, "stale");
  assert.equal(completions, 0);
});
