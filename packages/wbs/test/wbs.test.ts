import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { numberValue, record } from "@line_bot_v1/platform/validation";
import { parseWbsCommand } from "../src/application/commands/content.js";
import { createWbs, executeWbsCommand } from "../src/application/use-cases/content.js";
import { createPostgresWbsStore } from "../src/composition/bootstrap/store.js";
import { applyWbsEdit, parseWbsDocument, WbsError, type WbsNode } from "../src/domain/document.js";

function node(
  id: string,
  parentId: string | null = null,
  kind: WbsNode["kind"] = "WORK_PACKAGE",
): WbsNode {
  return {
    id,
    parentId,
    kind,
    position: 0,
    title: id,
    description: "",
    deliverable: "",
    acceptanceCriteria: "",
  };
}
function command<Edit extends Parameters<typeof applyWbsEdit>[1]>(
  edit: Edit,
  version: number,
  repositoryId = "repo",
) {
  return { ...edit, repositoryId, requestId: randomUUID(), expectedVersion: version };
}

test("WBS rejects cycles, missing parents, duplicate IDs and work-package children", () => {
  for (const nodes of [
    [node("a", "b", "DELIVERABLE"), node("b", "a", "DELIVERABLE")],
    [node("a", "missing")],
    [node("a"), node("a")],
    [node("a"), node("b", "a")],
  ])
    assert.throws(() => parseWbsDocument({ schemaVersion: 1, nodes }), WbsError);
  const initial = parseWbsDocument({
    schemaVersion: 1,
    nodes: [node("a", null, "DELIVERABLE"), node("b", "a"), node("c")],
  });
  const moved = applyWbsEdit(initial, {
    action: "move-node",
    nodeId: "b",
    parentId: null,
    position: 0,
  });
  assert.equal(moved.nodes.find((n) => n.id === "b")?.parentId, null);
  assert.equal(moved.nodes.find((n) => n.id === "b")?.position, 0);
  assert.deepEqual(
    applyWbsEdit(initial, { action: "delete-subtree", nodeId: "a" }).nodes.map((n) => n.id),
    ["c"],
  );
  assert.equal(initial.nodes.length, 3);
  assert.throws(
    () => parseWbsCommand({ ...command({ action: "initialize" }, 0), actor: "injected" }),
    WbsError,
  );
  const deep = Array.from({ length: 33 }, (_, i) =>
    node(`depth-${i}`, i === 0 ? null : `depth-${i - 1}`, "DELIVERABLE"),
  );
  assert.throws(() => parseWbsDocument({ schemaVersion: 1, nodes: deep }), WbsError);
  assert.equal(parseWbsDocument({ schemaVersion: 1, nodes: deep.slice(0, 32) }).nodes.length, 32);
});

test("WBS persistence preserves authority, replay, atomicity and immutable history", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  for (const id of ["owner", "viewer"]) {
    await db.transaction(async (sql) => {
      await sql.query(
        "INSERT INTO app_private.users(id,status,status_version,\"createdAt\") VALUES($1,'active',1,1)",
        [id],
      );
      await sql.query("SELECT app_private.claim_account_login($1,'USER',$1,1)", [id]);
    });
  }
  await pg.query(
    "SELECT * FROM app_private.provision_repository('repo','owner','owner','USER','Alpha','private')",
  );
  await pg.query(
    "SELECT * FROM app_private.provision_repository('other','owner','owner','USER','Other','public')",
  );
  const store = createPostgresWbsStore(db);
  const service = createWbs({
    activeUser: async () => ({ id: "owner" }),
    store: () => store,
    now: () => 100,
  });
  assert.equal((await store.read("owner", { repositoryId: "repo" })).revision, null);
  assert.equal(
    numberValue(
      record((await pg.query("SELECT count(*)::int as n FROM app_private.repository_wbs")).rows[0])
        ?.n,
    ),
    0,
  );
  const init = command({ action: "initialize" }, 0);
  const first = await service.execute("subject", init);
  assert.deepEqual(await service.execute("subject", init), first);
  await assert.rejects(
    executeWbsCommand(store, "owner", { ...init, repositoryId: "other" }, 101),
    (e) => e instanceof WbsError && e.status === 409,
  );
  const create = command({ action: "create-node", node: node("group", null, "DELIVERABLE") }, 1);
  const second = await service.execute("subject", create);
  await assert.rejects(
    executeWbsCommand(store, "owner", { ...create, node: node("different") }, 102),
    (e) => e instanceof WbsError && e.status === 409,
  );
  await assert.rejects(
    executeWbsCommand(
      store,
      "owner",
      command({ action: "create-node", node: node("stale") }, 1),
      102,
    ),
    (e) => e instanceof WbsError && e.status === 409,
  );
  await service.execute(
    "subject",
    command({ action: "create-node", node: node("leaf", "group") }, 2),
  );
  await assert.rejects(
    service.execute(
      "subject",
      command({ action: "update-node", node: node("group", null, "WORK_PACKAGE") }, 3),
    ),
    (e) => e instanceof WbsError && e.status === 400,
  );
  assert.equal((await store.read("owner", { repositoryId: "repo" })).version, 3);
  await service.execute("subject", command({ action: "delete-subtree", nodeId: "group" }, 3));
  assert.equal(
    (await store.read("owner", { repositoryId: "repo" })).revision?.document.nodes.length,
    0,
  );
  assert.equal(
    (await store.read("owner", { repositoryId: "repo" }, second.revision.id)).revision?.document
      .nodes[0]?.id,
    "group",
  );
  await assert.rejects(
    store.read("owner", { repositoryId: "other" }, second.revision.id),
    (e) => e instanceof WbsError && e.status === 404,
  );
  await assert.rejects(store.read("viewer", { repositoryId: "repo" }));
  assert.equal((await store.read("viewer", { repositoryId: "other" })).canEdit, false);
  await assert.rejects(
    executeWbsCommand(store, "viewer", command({ action: "initialize" }, 0, "other"), 100),
    (e) => e instanceof WbsError && e.status === 403,
  );
  const races = await Promise.allSettled([
    executeWbsCommand(store, "owner", command({ action: "create-node", node: node("a") }, 4), 105),
    executeWbsCommand(store, "owner", command({ action: "create-node", node: node("b") }, 4), 105),
  ]);
  assert.equal(races.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal((await store.read("owner", { repositoryId: "repo" })).version, 5);
  // Inject a failure after head/revision writes: all authoritative effects must roll back.
  await pg.exec(
    "CREATE FUNCTION app_private.fail_wbs_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'receipt failure'; END $$; CREATE TRIGGER fail_wbs_receipt BEFORE INSERT ON app_private.repository_wbs_commands FOR EACH ROW EXECUTE FUNCTION app_private.fail_wbs_receipt();",
  );
  await assert.rejects(
    executeWbsCommand(
      store,
      "owner",
      command({ action: "create-node", node: node("rollback") }, 5),
      106,
    ),
  );
  await pg.exec(
    "DROP TRIGGER fail_wbs_receipt ON app_private.repository_wbs_commands; DROP FUNCTION app_private.fail_wbs_receipt();",
  );
  assert.equal((await store.read("owner", { repositoryId: "repo" })).version, 5);
  assert.equal((await store.history("owner", { repositoryId: "repo" })).revisions.length, 5);
  for (let version = 5; version < 26; version++)
    await executeWbsCommand(
      store,
      "owner",
      command({ action: "create-node", node: node(`history-${version}`) }, version),
      106,
    );
  const firstPage = await store.history("owner", { repositoryId: "repo" });
  assert.equal(firstPage.revisions.length, 20);
  assert.equal(firstPage.next, 7);
  const secondPage = await store.history(
    "owner",
    { repositoryId: "repo" },
    firstPage.next ?? undefined,
  );
  assert.equal(secondPage.revisions.length, 6);
  assert.equal(secondPage.next, null);
  assert.equal(
    new Set([...firstPage.revisions, ...secondPage.revisions].map((r) => r.id)).size,
    26,
  );
  await pg.query(
    "INSERT INTO app_private.repository_access(repository_id,principal_id,capability,version) VALUES('repo','viewer','read',1)",
  );
  for (const permission of ["read", "triage", "triage_plus", "write", "maintain"]) {
    await pg.query(
      "UPDATE app_private.repository_access SET capability=$1 WHERE repository_id='repo' AND principal_id='viewer'",
      [permission],
    );
    const canEdit = permission === "write" || permission === "maintain";
    assert.equal((await store.read("viewer", { repositoryId: "repo" })).canEdit, canEdit);
    if (!canEdit)
      await assert.rejects(
        executeWbsCommand(
          store,
          "viewer",
          command({ action: "create-node", node: node("role-denied") }, 26),
          106,
        ),
        (e) => e instanceof WbsError && e.status === 403,
      );
  }
  const viewerCommand = command({ action: "create-node", node: node("maintainer") }, 26);
  await executeWbsCommand(store, "viewer", viewerCommand, 106);
  await pg.query(
    "DELETE FROM app_private.repository_access WHERE repository_id='repo' AND principal_id='viewer'",
  );
  await assert.rejects(executeWbsCommand(store, "viewer", viewerCommand, 107));
  await assert.rejects(
    db.transaction((sql) => sql.query("UPDATE repository_wbs_revisions SET document='{}'")),
  );
  await pg.query("UPDATE app_private.repositories SET is_archived=true WHERE id='repo'");
  await assert.rejects(
    executeWbsCommand(
      store,
      "owner",
      command({ action: "create-node", node: node("blocked") }, 5),
      106,
    ),
    (e) => e instanceof WbsError && e.status === 409,
  );
  assert.equal((await store.read("owner", { repositoryId: "repo" })).canEdit, false);
  assert.deepEqual(await executeWbsCommand(store, "owner", init, 106), first);
  await pg.query("UPDATE app_private.users SET status='suspended' WHERE id='owner'");
  await assert.rejects(executeWbsCommand(store, "owner", init, 107));
  await assert.rejects(store.history("owner", { repositoryId: "repo" }));
});
