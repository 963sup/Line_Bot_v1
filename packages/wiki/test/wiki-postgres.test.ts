import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { postgresSessions } from "@line_bot_v1/platform/testing/postgres-sessions";
import { createWiki } from "../src/application/use-cases/pages.js";
import { createPostgresWikiStore } from "../src/composition/bootstrap/wiki-pages.js";

const url = process.env.CAPABILITY_TEST_DATABASE_URL;
test("independent PostgreSQL sessions serialize Wiki edits and exact concurrent replay", {
  skip: !url && !process.env.CI,
}, async (t) => {
  assert.ok(url, "CI requires its disposable PostgreSQL service");
  const { pool, db, close } = await postgresSessions(url);
  t.after(close);
  await db.transaction(async (sql) => {
    await sql.query(
      "INSERT INTO users(id,status,status_version,\"createdAt\") VALUES('owner','active',1,1)",
    );
    await sql.query("SELECT claim_account_login('owner','USER','owner',1)");
  });
  await pool.query(
    "SELECT * FROM app_private.provision_repository('repo','owner','owner','USER','Wiki','private')",
  );
  const wiki = createWiki({ store: createPostgresWikiStore(db), now: () => 1 });
  const command = {
    repositoryId: "repo",
    pageId: randomUUID(),
    requestId: randomUUID(),
    expectedVersion: 0,
    action: "create",
    title: "A",
    body: "body",
  };
  const [first, replay] = await Promise.all([
    wiki.execute("owner", command),
    wiki.execute("owner", command),
  ]);
  assert.deepEqual(first, replay);
  const competing = await Promise.allSettled(
    ["B", "C"].map((title) =>
      wiki.execute("owner", {
        ...command,
        requestId: randomUUID(),
        expectedVersion: 1,
        action: "edit",
        title,
      }),
    ),
  );
  assert.equal(competing.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(competing.filter((x) => x.status === "rejected").length, 1);
  assert.equal(
    (await wiki.read("owner", { repositoryId: "repo", pageId: command.pageId })).version,
    2,
  );
});
