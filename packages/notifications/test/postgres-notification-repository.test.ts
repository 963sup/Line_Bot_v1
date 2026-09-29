import assert from "node:assert/strict";
import { test } from "node:test";
import type { Database, Sql } from "@line_bot_v1/platform/postgres";
import { PostgresNotificationRepository } from "../src/adapters/outbound/persistence/postgres-notification-repository.js";

const id = "11111111-1111-4111-8111-111111111111";

type TestNotificationRow = {
  id: string;
  recipient: string;
  source_type: string;
  source_id: string;
  source_version: string;
  kind: "issue";
  title: string;
  body: string;
  created_at: string;
  read_at: number | null;
  version: number;
};

const row: TestNotificationRow = {
  id,
  recipient: "user-1",
  source_type: "issue",
  source_id: "issue-1",
  source_version: "3",
  kind: "issue",
  title: "Issue updated",
  body: "A referenced issue changed.",
  created_at: "1",
  read_at: null,
  version: 1,
};

function database(query: Sql["query"]): Database {
  return { transaction: (work) => work({ query }) };
}

test("read adapter maps rows and scopes the query to the recipient", async () => {
  const repository = new PostgresNotificationRepository(
    database(async (text, values) => {
      assert.match(text, /WHERE recipient=\$1/);
      assert.match(text, /read_at IS NULL/);
      assert.match(text, /LIMIT 100/);
      assert.deepEqual(values, ["user-1", id, true]);
      return { rows: [row] };
    }),
  );
  const page = await repository.read("user-1", { id, unreadOnly: true });
  assert.equal(page.items[0]?.createdAt, 1);
  assert.equal(page.items[0]?.sourceVersion, "3");
  assert.equal(page.items[0]?.readAt, null);
});

test("mark-read locks before transition, writes once, then replays the committed state", async () => {
  let current = { ...row };
  const statements: string[] = [];
  const repository = new PostgresNotificationRepository(
    database(async (text, values) => {
      statements.push(text);
      assert.match(text, /WHERE id=\$1::uuid AND recipient=\$2/);
      if (text.includes("FOR UPDATE")) {
        assert.deepEqual(values, [id, "user-1"]);
        return { rows: [{ ...current }] };
      }
      assert.match(text, /SET read_at=\$3,version=version\+1/);
      assert.deepEqual(values, [id, "user-1", 10]);
      current = { ...current, read_at: 10, version: 2 };
      return { rows: [{ ...current }] };
    }),
  );
  const first = await repository.markRead("user-1", id, 10);
  const replay = await repository.markRead("user-1", id, 20);
  assert.deepEqual(replay, first);
  assert.equal(first?.readAt, 10);
  assert.equal(first?.version, 2);
  assert.equal(statements.length, 3);
  assert.match(statements[0] ?? "", /FOR UPDATE/);
  assert.match(statements[1] ?? "", /UPDATE notifications/);
  assert.match(statements[2] ?? "", /FOR UPDATE/);
});

test("missing or foreign recipients never reach a write", async () => {
  let queries = 0;
  const repository = new PostgresNotificationRepository(
    database(async (text, values) => {
      queries++;
      assert.match(text, /FOR UPDATE/);
      assert.deepEqual(values, [id, "other-user"]);
      return { rows: [] };
    }),
  );
  assert.equal(await repository.markRead("other-user", id, 10), null);
  assert.equal(queries, 1);
});

test("invalid provider rows fail closed instead of entering the domain", async () => {
  const repository = new PostgresNotificationRepository(
    database(async () => ({ rows: [{ ...row, version: "1" }] })),
  );
  await assert.rejects(repository.read("user-1", {}), /invalid data/);
});

test("transaction failure is propagated, not converted to missing data", async () => {
  const unavailable = new Error("transaction failed");
  const repository = new PostgresNotificationRepository({
    transaction: async () => {
      throw unavailable;
    },
  });
  await assert.rejects(repository.read("user-1", {}), (error) => error === unavailable);
  await assert.rejects(repository.markRead("user-1", id, 10), (error) => error === unavailable);
});
