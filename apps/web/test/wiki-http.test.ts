import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { repositoryContentScope } from "@line_bot_v1/repository/postgres/content-scope";
import { createWikiHistory } from "@line_bot_v1/wiki/application/use-cases/history";
import { createWiki } from "@line_bot_v1/wiki/application/use-cases/pages";
import { createPostgresWikiDependencies } from "@line_bot_v1/wiki/composition/bootstrap/wiki-pages";
import {
  wikiComparison,
  wikiHistory,
  wikiPages,
  wikiRevision,
} from "@line_bot_v1/wiki/contracts/parse-response";
import { canEditWiki } from "@line_bot_v1/wiki/domain/policies/wiki-access";
import { type WikiWebRuntime, wikiRequest } from "../src/modules/repository/wiki-http.server";
import { RequestIdentityError } from "../src/shared/server/request-identity-error";

test("Wiki HTTP preserves URL scope, immutable history, exact retry, restore and current authorization", async (t) => {
  const previous = process.env.APP_ORIGIN;
  process.env.APP_ORIGIN = "https://example.test";
  t.after(() => {
    if (previous === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = previous;
  });
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  await db.transaction(async (sql) => {
    for (const id of ["owner", "reader"]) {
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
    "INSERT INTO app_private.repository_access(repository_id,principal_id,capability,version) VALUES('repo','reader','read',1)",
  );
  const store = createPostgresWikiDependencies(db),
    pages = createWiki({ ...store, now: () => 100 }),
    history = createWikiHistory(store.reads);
  let actor = "owner";
  const runtime: WikiWebRuntime = {
    async scope(subject, selector) {
      assert.equal(subject, "verified-subject");
      const scope = await db.transaction((sql) => repositoryContentScope(sql, actor, selector));
      return {
        actorUserId: actor,
        repository: {
          id: scope.repository.id,
          ownerLogin: selector.ownerLogin,
          name: scope.repository.name,
        },
        archived: scope.archived,
        canEdit: !scope.archived && canEditWiki(scope.repository.permissions),
        canManageRepository: scope.repository.permissions.includes("admin"),
      };
    },
    pages: () => pages,
    history: () => history,
  };
  const base = "https://example.test/api/repository-wiki?owner=owner&name=Wiki";
  const identity = async () => "verified-subject";
  const read = (suffix = "") => wikiRequest(new Request(base + suffix), runtime, identity);
  const write = (command: unknown, origin = "https://example.test") =>
    wikiRequest(
      new Request(base, {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify(command),
      }),
      runtime,
      identity,
    );
  assert.equal(
    (
      await wikiRequest(new Request(base), runtime, async () => {
        throw new RequestIdentityError(401, "login");
      })
    ).status,
    401,
  );
  assert.equal(wikiPages(await (await read()).json()).pages.length, 0);
  const pageId = randomUUID();
  const command = {
    action: "create",
    repositoryId: "repo",
    pageId,
    requestId: randomUUID(),
    expectedVersion: 0,
    title: "Guide",
    body: "# Original\n<script>unsafe()</script>",
  };
  assert.equal((await write(command, "https://attacker.test")).status, 403);
  assert.equal((await write({ ...command, repositoryId: "other" })).status, 400);
  assert.equal((await write({ ...command, role: "admin" })).status, 400);
  const created = await write(command);
  assert.equal(created.status, 200);
  const receipt: unknown = await created.json();
  assert.deepEqual(await (await write(command)).json(), receipt);
  const first = wikiRevision((await (await read(`&pageId=${pageId}`)).json()).revision);
  assert.equal(first.body, command.body);
  const edited = await write({
    ...command,
    action: "edit",
    requestId: randomUUID(),
    expectedVersion: 1,
    title: "Renamed",
    body: "new",
  });
  assert.equal(edited.status, 200);
  assert.equal(
    (await write({ ...command, action: "edit", requestId: randomUUID(), expectedVersion: 1 }))
      .status,
    409,
  );
  const revisions = wikiHistory(await (await read(`&view=history&pageId=${pageId}`)).json());
  assert.deepEqual(
    revisions.revisions.map((r) => r.version),
    [2, 1],
  );
  const diff = wikiComparison(
    await (
      await read(
        `&view=compare&pageId=${pageId}&beforeId=${first.id}&afterId=${revisions.revisions[0]?.id}`,
      )
    ).json(),
  );
  assert.deepEqual(
    diff.map((d) => d.field),
    ["title", "body"],
  );
  assert.equal(
    (
      await write({
        action: "restore",
        repositoryId: "repo",
        pageId,
        requestId: randomUUID(),
        expectedVersion: 2,
        revisionId: first.id,
      })
    ).status,
    200,
  );
  const restored = wikiRevision((await (await read(`&pageId=${pageId}`)).json()).revision);
  assert.equal(restored.version, 3);
  assert.equal(restored.body, first.body);
  assert.notEqual(restored.id, first.id);
  actor = "reader";
  assert.equal((await read(`&pageId=${pageId}&revisionId=${first.id}`)).status, 200);
  assert.equal(
    (await write({ ...command, requestId: randomUUID(), pageId: randomUUID() })).status,
    403,
  );
  await pg.query("DELETE FROM app_private.repository_access WHERE principal_id='reader'");
  assert.equal((await read(`&pageId=${pageId}&revisionId=${first.id}`)).status, 404);
  actor = "owner";
  await pg.query("UPDATE app_private.repositories SET is_archived=true WHERE id='repo'");
  assert.equal((await read(`&pageId=${pageId}`)).status, 200);
  assert.equal(
    (await write({ ...command, requestId: randomUUID(), pageId: randomUUID() })).status,
    409,
  );
});
