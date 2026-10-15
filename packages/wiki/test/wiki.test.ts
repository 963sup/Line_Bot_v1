import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { createWikiHistory } from "../src/application/use-cases/history.js";
import { createWiki } from "../src/application/use-cases/pages.js";
import { createPostgresWikiDependencies } from "../src/composition/bootstrap/wiki-pages.js";
import { WikiError } from "../src/domain/wiki-error.js";
import { reviseWikiPage } from "../src/domain/wiki-page.js";

test("Wiki page transitions preserve identity and restore creates a new revision", () => {
  const context = {
    id: randomUUID(),
    pageId: randomUUID(),
    repositoryId: "repo",
    actorUserId: "owner",
    at: 1,
  };
  const first = reviseWikiPage(
    null,
    0,
    { action: "create", title: "Guide", body: "original" },
    context,
  );
  const archived = reviseWikiPage(
    first,
    1,
    { action: "archive" },
    { ...context, id: randomUUID() },
  );
  assert.throws(
    () => reviseWikiPage(archived, 2, { action: "rename", title: "No" }, context),
    WikiError,
  );
  const restored = reviseWikiPage(
    archived,
    2,
    { action: "restore", revisionId: first.id },
    { ...context, id: randomUUID() },
    first,
  );
  assert.equal(restored.version, 3);
  assert.equal(restored.pageId, first.pageId);
  assert.equal(restored.archived, false);
  assert.equal(archived.archived, true);
  assert.equal(first.version, 1);
  assert.throws(() => reviseWikiPage(first, 0, { action: "archive" }, context), WikiError);
});

test("Wiki persistence keeps scope, replay, atomic head and immutable historical content", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  await db.transaction(async (sql) => {
    for (const id of ["owner", "viewer"]) {
      await sql.query(
        "INSERT INTO users(id,status,status_version,\"createdAt\") VALUES($1,'active',1,1)",
        [id],
      );
      await sql.query("SELECT claim_account_login($1,'USER',$1,1)", [id]);
    }
  });
  await pg.query(
    "SELECT * FROM app_private.provision_repository('repo','owner','owner','USER','Wiki','private')",
  );
  await pg.query(
    "SELECT * FROM app_private.provision_repository('other','owner','owner','USER','Other','private')",
  );
  const store = createPostgresWikiDependencies(db),
    wiki = createWiki({ ...store, now: () => 100 }),
    history = createWikiHistory(store.reads);
  const pageId = randomUUID();
  const command = {
    action: "create",
    repositoryId: "repo",
    pageId,
    requestId: randomUUID(),
    expectedVersion: 0,
    title: "Guide",
    body: "original",
  };
  assert.deepEqual((await wiki.list("owner", "repo")).pages, []);
  const first = await wiki.execute("owner", command);
  assert.deepEqual(await wiki.execute("owner", command), first);
  await assert.rejects(
    wiki.execute("owner", { ...command, title: "changed" }),
    (e) => e instanceof WikiError && e.status === 409,
  );
  await assert.rejects(
    wiki.execute("owner", { ...command, actorUserId: "viewer" }),
    (e) => e instanceof WikiError && e.status === 400,
  );
  await assert.rejects(wiki.read("viewer", { repositoryId: "repo", pageId }));
  await assert.rejects(
    wiki.read("owner", { repositoryId: "other", pageId, revisionId: first.revision.id }),
  );
  const edit = await wiki.execute("owner", {
    ...command,
    action: "edit",
    requestId: randomUUID(),
    expectedVersion: 1,
    body: "new",
  });
  await assert.rejects(
    wiki.execute("owner", {
      ...command,
      action: "rename",
      requestId: randomUUID(),
      expectedVersion: 1,
      title: "stale",
      body: undefined,
    }),
  );
  const difference = await history.compare(
    "owner",
    { repositoryId: "repo", pageId },
    first.revision.id,
    edit.revision.id,
  );
  assert.deepEqual(
    difference.differences.map((x) => x.field),
    ["body"],
  );
  const restored = await wiki.execute("owner", {
    action: "restore",
    repositoryId: "repo",
    pageId,
    requestId: randomUUID(),
    expectedVersion: 2,
    revisionId: first.revision.id,
  });
  assert.equal(restored.revision.body, "original");
  assert.equal(restored.revision.version, 3);
  assert.equal(
    (await history.history("owner", { repositoryId: "repo", pageId })).revisions.length,
    3,
  );
  await assert.rejects(
    db.transaction((sql) =>
      sql.query("UPDATE wiki_revisions SET body='tampered' WHERE id=$1", [first.revision.id]),
    ),
  );
  // A durable receipt failure must roll back an already saved head and revision.
  await assert.rejects(
    store.transactions.transact(
      "owner",
      { repositoryId: "repo", pageId },
      { requestId: command.requestId, payload: JSON.stringify(command) },
      async (tx) => {
        const next = reviseWikiPage(
          await tx.pages.load(),
          3,
          { action: "rename", title: "must roll back" },
          { id: tx.nextId(), pageId, repositoryId: "repo", actorUserId: "owner", at: 101 },
        );
        await tx.pages.save(next, 3);
        await tx.record(next);
      },
    ),
  );
  assert.equal((await wiki.read("owner", { repositoryId: "repo", pageId })).version, 3);
  assert.equal(
    (await history.history("owner", { repositoryId: "repo", pageId })).revisions.length,
    3,
  );
  assert.deepEqual(await wiki.execute("owner", command), first);
  await pg.query("UPDATE app_private.repositories SET is_archived=true WHERE id='repo'");
  assert.deepEqual(await wiki.execute("owner", command), first);
  await assert.rejects(
    wiki.execute("owner", {
      action: "archive",
      repositoryId: "repo",
      pageId,
      requestId: randomUUID(),
      expectedVersion: 3,
    }),
  );
  assert.equal((await wiki.read("owner", { repositoryId: "repo", pageId })).version, 3);
  await pg.query(
    "UPDATE app_private.users SET status='paused',status_version=status_version+1 WHERE id='owner'",
  );
  await assert.rejects(
    wiki.read("owner", { repositoryId: "repo", pageId, revisionId: first.revision.id }),
  );
  await assert.rejects(wiki.execute("owner", command));
});
