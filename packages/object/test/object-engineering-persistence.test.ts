import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { createObjects } from "../src/application/use-cases/objects.js";
import { createPostgresObjectDependencies } from "../src/composition/bootstrap/objects.js";
import type { ObjectCommandReceipt, Quantity } from "../src/contracts/dto/objects.js";
import { ObjectError } from "../src/domain/error.js";

test("engineering persistence preserves atomic budgets, exact replay, history and full-root projections", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  await db.transaction(async (sql) => {
    await sql.query(
      `INSERT INTO users(id,status,status_version,"createdAt") VALUES('owner','active',1,1)`,
    );
    await sql.query("SELECT claim_account_login(id,'USER',id,1) FROM users");
  });
  await pg.query(
    "SELECT * FROM app_private.provision_repository('repo','owner','owner','USER','Engineering','private')",
  );
  await pg.query(
    "SELECT * FROM app_private.provision_repository('other','owner','owner','USER','Other','private')",
  );
  let clock = 100;
  const app = createObjects({ ...createPostgresObjectDependencies(db), now: () => clock++ });
  const typeId = randomUUID();
  const envelope = () => ({ repositoryId: "repo", requestId: randomUUID(), expectedVersion: 0 });
  await app.executeType("owner", {
    ...envelope(),
    action: "create",
    typeId,
    name: "敷設",
    description: "",
  });
  const measureId = randomUUID();
  const measureCommand = {
    ...envelope(),
    action: "create-measure",
    measureId,
    name: "光纖",
    subject: "沿光纖路徑計量",
    unit: "m",
  };
  const measureReceipt = await app.executeEngineering("owner", measureCommand);
  assert.deepEqual(await app.executeEngineering("owner", measureCommand), measureReceipt);
  const quantity = (
    value: string,
    purpose: Quantity["purpose"] = "PLANNED",
    id = measureId,
  ): Quantity => ({ measureId: id, value, purpose, sourceReference: null });
  const create = async (name: string) => {
    const objectId = randomUUID();
    const command = { ...envelope(), action: "create", objectId, typeId, name, content: "" };
    const receipt = await app.executeObject("owner", command);
    assert.ok("objectId" in receipt.result);
    return { objectId, command, receipt, revisionId: receipt.result.id };
  };
  const root = await create("A 光纖工程");
  const structure = (parentId?: string, after?: string) =>
    app.structure("owner", {
      repositoryId: "repo",
      rootId: root.objectId,
      ...(parentId ? { parentId } : {}),
      ...(after ? { after } : {}),
    });
  type Observation = Awaited<ReturnType<typeof structure>>["observed"];
  const observations = async (...objectIds: string[]): Promise<Observation> => {
    const objects = new Map<string, Observation["objects"][number]>();
    const relationships = new Map<string, Observation["relationships"][number]>();
    for (const rootId of objectIds) {
      const view = await app.structure("owner", { repositoryId: "repo", rootId });
      for (const object of view.observed.objects) objects.set(object.objectId, object);
      for (const edge of view.observed.relationships) relationships.set(edge.relationshipId, edge);
    }
    return { objects: [...objects.values()], relationships: [...relationships.values()] };
  };
  const set = async (changes: readonly { objectId: string; quantity: Quantity | null }[]) => {
    return app.executeEngineering("owner", {
      ...envelope(),
      action: "set-quantities",
      observed: await observations(...changes.map((change) => change.objectId)),
      changes: await Promise.all(
        changes.map(async (change) => ({
          ...change,
          expectedVersion: (
            await app.readObject("owner", { repositoryId: "repo", objectId: change.objectId })
          ).version,
        })),
      ),
    });
  };
  const child = async (
    parentObjectId: string,
    name: string,
    value: string | null,
    kind = "ALLOCATES",
    id = measureId,
  ) => {
    const objectId = randomUUID();
    const command = {
      ...envelope(),
      action: "create-child",
      objectId,
      parentObjectId,
      typeId,
      name,
      content: "",
      quantity: value === null ? null : quantity(value, "PLANNED", id),
      kind,
      relationshipId: randomUUID(),
      observed: await observations(parentObjectId),
    };
    const receipt = await app.executeEngineering("owner", command);
    assert.deepEqual(await app.executeEngineering("owner", command), receipt);
    return { objectId, command, receipt };
  };
  await t.test("version-one replay retains its exact old shape and fingerprint", async () => {
    assert.ok("objectId" in root.receipt.result);
    const { quantity: _quantity, ...legacyResult } = root.receipt.result;
    const legacy: ObjectCommandReceipt = {
      requestId: root.command.requestId,
      kind: "object",
      result: legacyResult,
    };
    await pg.query(
      "UPDATE app_private.object_commands SET result=$1::jsonb WHERE actor_user_id='owner' AND request_id=$2",
      [
        JSON.stringify({ receiptVersion: 1, family: "objects", result: legacy }),
        root.command.requestId,
      ],
    );
    assert.deepEqual(await app.executeObject("owner", root.command), legacy);
    assert.equal("quantity" in (await app.executeObject("owner", root.command)).result, false);
  });
  await set([{ objectId: root.objectId, quantity: quantity("8500", "REFERENCE") }]);
  const b = await child(root.objectId, "B", "2000");
  const c = await child(root.objectId, "C", "1000");
  await child(root.objectId, "D", "3000");
  await child(root.objectId, "E", "2000");
  const b1 = await child(b.objectId, "B1", "1200");
  await child(b.objectId, "B2", "800");
  await t.test(
    "nested decomposition totals and planned/reference purposes stay distinct",
    async () => {
      const view = await structure();
      assert.equal(view.allocated, "8000");
      assert.equal(view.remaining, "500");
      assert.equal(view.groups.find((group) => group.purpose === "PLANNED")?.value, "8000");
      assert.equal(view.nodes.items.length, 4);
      assert.equal((await structure(b.objectId)).nodes.items.length, 2);
    },
  );
  await t.test(
    "invalid parent reduction, clearing, precision and excess allocation roll back heads and receipts",
    async () => {
      const before = await app.readObject("owner", {
        repositoryId: "repo",
        objectId: root.objectId,
      });
      for (const next of [quantity("7999", "REFERENCE"), quantity("8500.0001", "REFERENCE"), null])
        await assert.rejects(set([{ objectId: root.objectId, quantity: next }]));
      await assert.rejects(child(root.objectId, "overflow", "501"));
      assert.deepEqual(
        await app.readObject("owner", { repositoryId: "repo", objectId: root.objectId }),
        before,
      );
      assert.equal((await structure()).nodes.items.length, 4);
    },
  );
  await t.test(
    "one batch transfers sibling budget even when the first standalone edit would exceed the parent",
    async () => {
      await assert.rejects(set([{ objectId: b.objectId, quantity: quantity("2600") }]));
      await set([
        { objectId: b.objectId, quantity: quantity("2600") },
        { objectId: c.objectId, quantity: quantity("400") },
      ]);
      assert.equal((await structure()).allocated, "8000");
      assert.equal(
        (await app.history("owner", { repositoryId: "repo", objectId: b.objectId })).items[0]
          ?.version,
        2,
      );
    },
  );
  await t.test(
    "locations are explicit and reparenting preserves old immutable relationship history",
    async () => {
      const room = await create("電氣室");
      const view = await structure(b.objectId);
      const location = {
        ...envelope(),
        action: "set-location",
        objectId: b1.objectId,
        expectedVersion: 1,
        targetObjectId: room.objectId,
        relationshipId: randomUUID(),
        previousRelationshipId: null,
        kind: "LOCATED_IN",
        observed: await observations(b1.objectId, room.objectId),
      };
      await app.executeEngineering("owner", location);
      const located = (await structure()).groups.find((group) => group.key === room.objectId);
      assert.equal(located?.value, "1200");
      const edge = view.nodes.items.find((node) => node.objectId === b1.objectId)?.relationship;
      assert.ok(edge);
      const move = {
        ...envelope(),
        action: "set-parent",
        objectId: b1.objectId,
        expectedVersion: 1,
        targetObjectId: c.objectId,
        relationshipId: randomUUID(),
        previousRelationshipId: edge.relationshipId,
        kind: "INCLUDES",
        observed: await observations(b1.objectId, c.objectId),
      };
      const moved = await app.executeEngineering("owner", move);
      assert.deepEqual(await app.executeEngineering("owner", move), moved);
      const history = await app.relationshipHistory("owner", {
        repositoryId: "repo",
        relationshipId: edge.relationshipId,
      });
      assert.deepEqual(
        history.items.map((revision) => revision.action),
        ["remove", "create"],
      );
      assert.equal(history.items[0]?.sourceObjectId, b.objectId);
      assert.equal((await structure(c.objectId)).nodes.items[0]?.objectId, b1.objectId);
      await assert.rejects(
        app.executeEngineering("owner", { ...move, requestId: randomUUID() }),
        (error) => error instanceof ObjectError && error.code === "VERSION_CONFLICT",
      );
    },
  );
  await t.test(
    "detaching a scope rejects stale quantity and restoration snapshots without changing Object versions",
    async () => {
      await set([{ objectId: b1.objectId, quantity: quantity("1100") }]);
      const view = await app.structure("owner", { repositoryId: "repo", rootId: b1.objectId });
      assert.ok(view.node.relationship);
      const before = await app.readObject("owner", { repositoryId: "repo", objectId: b1.objectId });
      await app.executeEngineering("owner", {
        ...envelope(),
        action: "set-parent",
        objectId: b1.objectId,
        expectedVersion: before.version,
        targetObjectId: null,
        previousRelationshipId: view.node.relationship.relationshipId,
        relationshipId: randomUUID(),
        kind: "INCLUDES",
        observed: view.observed,
      });
      const stale = {
        ...envelope(),
        action: "set-quantities",
        observed: view.observed,
        changes: [
          { objectId: b1.objectId, expectedVersion: before.version, quantity: quantity("1150") },
        ],
      };
      await assert.rejects(
        app.executeEngineering("owner", stale),
        (error) => error instanceof ObjectError && error.code === "VERSION_CONFLICT",
      );
      const original = b1.receipt.result.objects[0];
      assert.ok(original);
      await assert.rejects(
        app.executeObject("owner", {
          ...envelope(),
          action: "restore",
          objectId: b1.objectId,
          revisionId: original.id,
          expectedVersion: before.version,
          observed: view.observed,
        }),
        (error) => error instanceof ObjectError && error.code === "VERSION_CONFLICT",
      );
      assert.deepEqual(
        await app.readObject("owner", { repositoryId: "repo", objectId: b1.objectId }),
        before,
      );
      await assert.rejects(
        structure(b1.objectId),
        (error) => error instanceof ObjectError && error.code === "STRUCTURE_SCOPE_CHANGED",
      );
    },
  );
  await t.test("archiving keeps budget and removal remains available", async () => {
    const current = await app.readObject("owner", { repositoryId: "repo", objectId: b.objectId });
    await app.executeObject("owner", {
      ...envelope(),
      action: "archive",
      objectId: b.objectId,
      expectedVersion: current.version,
    });
    assert.equal((await structure()).allocated, "8000");
    await assert.rejects(child(root.objectId, "still overflow", "501"));
    const view = await structure(b.objectId);
    await app.executeEngineering("owner", {
      ...envelope(),
      action: "set-parent",
      objectId: b.objectId,
      expectedVersion: current.version + 1,
      targetObjectId: null,
      previousRelationshipId: view.node.relationship?.relationshipId,
      relationshipId: randomUUID(),
      kind: "ALLOCATES",
      observed: view.observed,
    });
    assert.equal((await structure()).allocated, "5400");
  });
  await t.test(
    "measure and precision constraints are enforced by PostgreSQL and runtime grants are immutable",
    async () => {
      await assert.rejects(
        db.transaction((sql) =>
          sql.query("UPDATE object_measures SET name='changed' WHERE id=$1", [measureId]),
        ),
      );
      const pcs = randomUUID();
      await app.executeEngineering("owner", {
        ...measureCommand,
        requestId: randomUUID(),
        measureId: pcs,
        name: "端接",
        unit: "pcs",
      });
      const insertSnapshot = async (id: string, value: string) =>
        db.transaction((sql) =>
          sql.query(
            `INSERT INTO object_revisions(id,object_id,repository_id,version,parent_revision_id,actor_user_id,at,action,type_id,type_name,name,content,archived,measure_id,quantity_value,quantity_purpose)
           SELECT $1,r.object_id,r.repository_id,r.version+1,r.id,'owner',r.at+1,'set-quantity',r.type_id,r.type_name,r.name,r.content,r.archived,$2,$3::numeric,'PLANNED'
           FROM objects o JOIN object_revisions r ON r.id=o.head_revision_id WHERE o.id=$4`,
            [randomUUID(), id, value, root.objectId],
          ),
        );
      await assert.rejects(insertSnapshot(measureId, "1.0001"));
      await assert.rejects(insertSnapshot(pcs, "0.5"));
      await assert.rejects(insertSnapshot(pcs, "1.0"));
      await assert.rejects(child(root.objectId, "fraction", "0.5", "INCLUDES", pcs));
      await assert.rejects(child(root.objectId, "different measure", "8", "ALLOCATES", pcs));
      for (let index = 0; index < 51; index++)
        await child(root.objectId, `端接 ${index}`, "8", "INCLUDES", pcs);
      const first = await structure();
      assert.equal(first.nodes.items.length, 50);
      assert.ok(first.nodes.next);
      const second = await structure(root.objectId, first.nodes.next);
      assert.ok(second.nodes.items.length > 0);
      assert.equal(second.nodes.next, null);
      assert.equal(first.groups.find((group) => group.measureId === pcs)?.value, "408");
      assert.deepEqual(second.groups, first.groups);
    },
  );
  await t.test(
    "restore revalidates quantities and fixed provenance never changes with the source head",
    async () => {
      const source = await create("來源文件");
      const reference = {
        ...quantity("8500", "REFERENCE"),
        sourceReference: { objectId: source.objectId, revisionId: source.revisionId },
      };
      await set([{ objectId: root.objectId, quantity: reference }]);
      await app.executeObject("owner", {
        ...envelope(),
        action: "edit",
        objectId: source.objectId,
        expectedVersion: 1,
        name: "來源新版",
        content: "changed",
      });
      assert.deepEqual(
        (await app.readObject("owner", { repositoryId: "repo", objectId: root.objectId })).quantity
          ?.sourceReference,
        reference.sourceReference,
      );
      const current = await app.readObject("owner", {
        repositoryId: "repo",
        objectId: root.objectId,
      });
      await assert.rejects(
        app.executeObject("owner", {
          ...envelope(),
          action: "restore",
          objectId: root.objectId,
          revisionId: root.revisionId,
          expectedVersion: current.version,
          observed: (await structure()).observed,
        }),
      );
      assert.equal(
        (await app.readObject("owner", { repositoryId: "repo", objectId: root.objectId })).version,
        current.version,
      );
    },
  );
  await t.test(
    "repository tree preserves roots, classification and archived ancestor context with per-level pages",
    async () => {
      const parent = await create("光纖工程");
      const leaf = await child(parent.objectId, "光纖敷設", null, "INCLUDES");
      const nested = await child(leaf.objectId, "A 區", null, "INCLUDES");
      const roots = await app.tree("owner", { repositoryId: "repo" });
      assert.ok(
        roots.nodes.items.some((node) => node.objectId === parent.objectId && node.hasChildren),
      );
      assert.ok(!roots.nodes.items.some((node) => node.objectId === leaf.objectId));
      const first = await app.tree("owner", { repositoryId: "repo", parentId: parent.objectId });
      assert.equal(first.nodes.items[0]?.objectId, leaf.objectId);
      assert.equal(first.nodes.items[0]?.quantity, null);
      assert.equal(first.nodes.items[0]?.typeId, typeId);
      assert.equal(first.nodes.items[0]?.relationship?.kind, "INCLUDES");
      const inlineId = randomUUID();
      await app.executeEngineering("owner", {
        ...envelope(),
        action: "create-child",
        objectId: inlineId,
        parentObjectId: parent.objectId,
        relationshipId: randomUUID(),
        typeId,
        name: "追加工序",
        content: "",
        kind: "INCLUDES",
        quantity: null,
        observed: first.observed,
      });
      await app.executeObject("owner", {
        ...envelope(),
        action: "archive",
        objectId: inlineId,
        expectedVersion: 1,
      });
      assert.ok(!first.observed.objects.some((item) => item.objectId === root.objectId));
      await app.executeObject("owner", {
        ...envelope(),
        action: "archive",
        objectId: parent.objectId,
        expectedVersion: 1,
      });
      assert.ok(
        (await app.tree("owner", { repositoryId: "repo" })).nodes.items.some(
          (node) => node.objectId === parent.objectId && node.archived,
        ),
      );
      await app.executeObject("owner", {
        ...envelope(),
        action: "archive",
        objectId: nested.objectId,
        expectedVersion: 1,
      });
      await app.executeObject("owner", {
        ...envelope(),
        action: "archive",
        objectId: leaf.objectId,
        expectedVersion: 1,
      });
      assert.ok(
        !(await app.tree("owner", { repositoryId: "repo" })).nodes.items.some(
          (node) => node.objectId === parent.objectId,
        ),
      );
      assert.ok(
        (await app.tree("owner", { repositoryId: "repo", includeArchived: true })).nodes.items.some(
          (node) => node.objectId === parent.objectId,
        ),
      );
      const page = await app.tree("owner", {
        repositoryId: "repo",
        parentId: root.objectId,
        includeArchived: true,
      });
      assert.equal(page.nodes.items.length, 50);
      assert.ok(page.nodes.next);
      const next = await app.tree("owner", {
        repositoryId: "repo",
        parentId: root.objectId,
        includeArchived: true,
        after: page.nodes.next,
      });
      assert.ok(next.nodes.items.length);
      assert.ok(
        next.nodes.items.every(
          (node) => !page.nodes.items.some((seen) => seen.objectId === node.objectId),
        ),
      );
      await assert.rejects(app.tree("owner", { repositoryId: "other", parentId: parent.objectId }));
      await assert.rejects(app.tree("other", { repositoryId: "repo" }));
    },
  );
});
