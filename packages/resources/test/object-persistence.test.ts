import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { PostgresRepositoryAccessStore } from "@line_bot_v1/repository/postgres/access-management";
import { createObjects } from "../src/application/use-cases/objects.js";
import { createPostgresObjectDependencies } from "../src/composition/bootstrap/objects.js";
import { createPostgresObjectReferenceReader } from "../src/composition/bootstrap/references.js";
import type {
  ObjectCommandReceipt,
  ObjectRelationshipRevisionDto,
  ObjectRevisionDto,
  ObjectTypeDto,
} from "../src/contracts/dto/objects.js";
import { ObjectError } from "../src/domain/error.js";

function typeResult(receipt: ObjectCommandReceipt): ObjectTypeDto {
  assert.equal(receipt.kind, "type");
  assert.ok("enabled" in receipt.result);
  return receipt.result;
}

function objectResult(receipt: ObjectCommandReceipt): ObjectRevisionDto {
  assert.equal(receipt.kind, "object");
  assert.ok("objectId" in receipt.result);
  return receipt.result;
}

function relationshipResult(receipt: ObjectCommandReceipt): ObjectRelationshipRevisionDto {
  assert.equal(receipt.kind, "relationship");
  assert.ok("relationshipId" in receipt.result);
  return receipt.result;
}

function isObjectError(error: unknown, code?: ObjectError["code"]) {
  return error instanceof ObjectError && (code === undefined || error.code === code);
}

test("Object persistence enforces SQL ownership, lifecycle, replay and reference contracts", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  await db.transaction(async (sql) => {
    await sql.query(
      `INSERT INTO users(id,status,status_version,"createdAt")
       VALUES('owner','active',1,1),('member','active',1,1)`,
    );
    await sql.query("SELECT claim_account_login(id,'USER',id,1) FROM users");
  });
  await pg.query(
    "SELECT * FROM app_private.provision_repository('repo','owner','owner','USER','Objects','private')",
  );
  await pg.query(
    "SELECT * FROM app_private.provision_repository('other','owner','owner','USER','Other','private')",
  );

  let clock = 100;
  const persistence = createPostgresObjectDependencies(db);
  const objects = createObjects({ ...persistence, now: () => clock++ });
  const access = new PostgresRepositoryAccessStore(db);

  const createType = async (repositoryId: string, name: string) => {
    const typeId = randomUUID();
    const receipt = await objects.executeType("owner", {
      action: "create",
      repositoryId,
      requestId: randomUUID(),
      expectedVersion: 0,
      typeId,
      name,
      description: "",
    });
    assert.equal(typeResult(receipt).id, typeId);
    return typeId;
  };
  const createObject = async (
    repositoryId: string,
    typeId: string,
    name: string,
    userId = "owner",
  ) => {
    const objectId = randomUUID();
    const receipt = await objects.executeObject(userId, {
      action: "create",
      repositoryId,
      requestId: randomUUID(),
      expectedVersion: 0,
      objectId,
      typeId,
      name,
      content: "",
    });
    return { objectId, revision: objectResult(receipt) };
  };

  const primaryTypeId = await createType("repo", "Document");

  await t.test(
    "classification uniqueness and disabled assignment rules preserve history",
    async () => {
      const duplicateTypeId = randomUUID();
      const duplicateRequestId = randomUUID();
      await assert.rejects(
        objects.executeType("owner", {
          action: "create",
          repositoryId: "repo",
          requestId: duplicateRequestId,
          expectedVersion: 0,
          typeId: duplicateTypeId,
          name: "document",
          description: "case-insensitive duplicate",
        }),
        (error) => isObjectError(error, "TYPE_NAME_CONFLICT"),
      );
      assert.deepEqual(
        (
          await pg.query<{ types: number; receipts: number }>(
            `SELECT
             (SELECT count(*)::int FROM app_private.object_types WHERE id=$1) types,
             (SELECT count(*)::int FROM app_private.object_commands WHERE request_id=$2) receipts`,
            [duplicateTypeId, duplicateRequestId],
          )
        ).rows,
        [{ types: 0, receipts: 0 }],
      );

      const reusedTypeRequest = randomUUID();
      await assert.rejects(
        objects.executeType("owner", {
          action: "create",
          repositoryId: "repo",
          requestId: reusedTypeRequest,
          expectedVersion: 0,
          typeId: primaryTypeId,
          name: "Different supplied Type ID",
          description: "",
        }),
        (error) => error instanceof ObjectError && error.status === 409,
      );
      assert.equal(
        (
          await pg.query<{ count: number }>(
            "SELECT count(*)::int count FROM app_private.object_commands WHERE request_id=$1",
            [reusedTypeRequest],
          )
        ).rows[0]?.count,
        0,
      );

      const original = await createObject("repo", primaryTypeId, "Existing");
      const reusedObjectRequest = randomUUID();
      await assert.rejects(
        objects.executeObject("owner", {
          action: "create",
          repositoryId: "repo",
          requestId: reusedObjectRequest,
          expectedVersion: 0,
          objectId: original.objectId,
          typeId: primaryTypeId,
          name: "Different supplied Object ID",
          content: "",
        }),
        (error) => error instanceof ObjectError && error.status === 409,
      );
      assert.deepEqual(
        (
          await pg.query<{ revisions: number; receipts: number }>(
            `SELECT
               (SELECT count(*)::int FROM app_private.object_revisions WHERE object_id=$1) revisions,
               (SELECT count(*)::int FROM app_private.object_commands WHERE request_id=$2) receipts`,
            [original.objectId, reusedObjectRequest],
          )
        ).rows,
        [{ revisions: 1, receipts: 0 }],
      );
      const secondaryTypeId = await createType("repo", "Specification");
      const other = await createObject("repo", secondaryTypeId, "Other classification");
      const disabled = typeResult(
        await objects.executeType("owner", {
          action: "disable",
          repositoryId: "repo",
          requestId: randomUUID(),
          expectedVersion: 1,
          typeId: primaryTypeId,
        }),
      );
      assert.equal(disabled.enabled, false);
      const renamedType = typeResult(
        await objects.executeType("owner", {
          action: "update",
          repositoryId: "repo",
          requestId: randomUUID(),
          expectedVersion: 2,
          typeId: primaryTypeId,
          name: "Document renamed",
          description: "renamed while disabled",
        }),
      );
      assert.equal(renamedType.enabled, false);
      assert.equal(renamedType.version, 3);

      const edited = objectResult(
        await objects.executeObject("owner", {
          action: "edit",
          repositoryId: "repo",
          requestId: randomUUID(),
          expectedVersion: 1,
          objectId: original.objectId,
          name: "Existing edited",
          content: "existing assignments remain editable",
        }),
      );
      assert.equal(edited.version, 2);
      assert.equal(edited.typeId, primaryTypeId);
      assert.equal(edited.typeName, "Document renamed");

      const rejectedCreateId = randomUUID();
      const rejectedCreateRequest = randomUUID();
      await assert.rejects(
        objects.executeObject("owner", {
          action: "create",
          repositoryId: "repo",
          requestId: rejectedCreateRequest,
          expectedVersion: 0,
          objectId: rejectedCreateId,
          typeId: primaryTypeId,
          name: "Rejected",
          content: "",
        }),
        (error) => isObjectError(error, "LIFECYCLE_CONFLICT"),
      );
      const reclassifyRequest = randomUUID();
      await assert.rejects(
        objects.executeObject("owner", {
          action: "reclassify",
          repositoryId: "repo",
          requestId: reclassifyRequest,
          expectedVersion: 1,
          objectId: other.objectId,
          typeId: primaryTypeId,
        }),
        (error) => isObjectError(error, "LIFECYCLE_CONFLICT"),
      );
      const restoreRequest = randomUUID();
      await assert.rejects(
        objects.executeObject("owner", {
          action: "restore",
          repositoryId: "repo",
          requestId: restoreRequest,
          expectedVersion: 2,
          objectId: original.objectId,
          revisionId: original.revision.id,
        }),
        (error) => isObjectError(error, "LIFECYCLE_CONFLICT"),
      );
      const archived = objectResult(
        await objects.executeObject("owner", {
          action: "archive",
          repositoryId: "repo",
          requestId: randomUUID(),
          expectedVersion: 2,
          objectId: original.objectId,
        }),
      );
      assert.equal(archived.archived, true);
      assert.equal(archived.typeName, "Document renamed");
      assert.deepEqual(
        (
          await pg.query<{ heads: number; revisions: number; receipts: number }>(
            `SELECT
             (SELECT count(*)::int FROM app_private.objects WHERE id=$1) heads,
             (SELECT count(*)::int FROM app_private.object_revisions WHERE object_id=$2) revisions,
             (SELECT count(*)::int FROM app_private.object_commands
               WHERE request_id=ANY($3::uuid[])) receipts`,
            [
              rejectedCreateId,
              other.objectId,
              [rejectedCreateRequest, reclassifyRequest, restoreRequest],
            ],
          )
        ).rows,
        [{ heads: 0, revisions: 1, receipts: 0 }],
      );

      const history = await objects.history("owner", {
        repositoryId: "repo",
        objectId: original.objectId,
      });
      assert.deepEqual(
        history.items.map((revision) => [revision.version, revision.name, revision.typeName]),
        [
          [3, "Existing edited", "Document renamed"],
          [2, "Existing edited", "Document renamed"],
          [1, "Existing", "Document"],
        ],
      );
      const differences = await objects.compareRevisions("owner", {
        repositoryId: "repo",
        objectId: original.objectId,
        beforeId: original.revision.id,
        afterId: edited.id,
      });
      assert.deepEqual(
        differences.map((difference) => difference.field),
        ["typeName", "name", "content"],
      );
      await assert.rejects(
        db.transaction((sql) =>
          sql.query("UPDATE object_revisions SET content='tampered' WHERE id=$1", [
            original.revision.id,
          ]),
        ),
      );
      assert.equal(
        (
          await pg.query<{ content: string }>(
            "SELECT content FROM app_private.object_revisions WHERE id=$1",
            [original.revision.id],
          )
        ).rows[0]?.content,
        "",
      );
    },
  );

  await t.test(
    "directed cycles are valid while live duplicates, self and cross-scope edges fail",
    async () => {
      const secondaryTypeId = await createType("repo", "Relationship node");
      const source = await createObject("repo", secondaryTypeId, "A");
      const target = await createObject("repo", secondaryTypeId, "B");
      const otherTypeId = await createType("other", "Other node");
      const outside = await createObject("other", otherTypeId, "Outside");

      const forward = relationshipResult(
        await objects.executeRelationship("owner", {
          action: "create",
          repositoryId: "repo",
          requestId: randomUUID(),
          expectedVersion: 0,
          relationshipId: randomUUID(),
          sourceObjectId: source.objectId,
          targetObjectId: target.objectId,
          name: "depends on",
        }),
      );
      const reverse = relationshipResult(
        await objects.executeRelationship("owner", {
          action: "create",
          repositoryId: "repo",
          requestId: randomUUID(),
          expectedVersion: 0,
          relationshipId: randomUUID(),
          sourceObjectId: target.objectId,
          targetObjectId: source.objectId,
          name: "depends on",
        }),
      );
      assert.equal(forward.active, true);
      assert.equal(reverse.active, true);

      const reusedRelationshipRequest = randomUUID();
      await assert.rejects(
        objects.executeRelationship("owner", {
          action: "create",
          repositoryId: "repo",
          requestId: reusedRelationshipRequest,
          expectedVersion: 0,
          relationshipId: forward.relationshipId,
          sourceObjectId: source.objectId,
          targetObjectId: target.objectId,
          name: "different supplied Relationship ID",
        }),
        (error) => error instanceof ObjectError && error.status === 409,
      );
      assert.deepEqual(
        (
          await pg.query<{ revisions: number; receipts: number }>(
            `SELECT
               (SELECT count(*)::int FROM app_private.object_relationship_revisions
                 WHERE relationship_id=$1) revisions,
               (SELECT count(*)::int FROM app_private.object_commands WHERE request_id=$2) receipts`,
            [forward.relationshipId, reusedRelationshipRequest],
          )
        ).rows,
        [{ revisions: 1, receipts: 0 }],
      );

      const failures = [
        {
          requestId: randomUUID(),
          relationshipId: randomUUID(),
          sourceObjectId: source.objectId,
          targetObjectId: target.objectId,
          name: "DEPENDS ON",
          code: "RELATIONSHIP_DUPLICATE" as const,
        },
        {
          requestId: randomUUID(),
          relationshipId: randomUUID(),
          sourceObjectId: source.objectId,
          targetObjectId: source.objectId,
          name: "self",
          code: "LIFECYCLE_CONFLICT" as const,
        },
        {
          requestId: randomUUID(),
          relationshipId: randomUUID(),
          sourceObjectId: source.objectId,
          targetObjectId: outside.objectId,
          name: "cross scope",
          code: "NOT_FOUND" as const,
        },
      ];
      for (const failure of failures) {
        await assert.rejects(
          objects.executeRelationship("owner", {
            action: "create",
            repositoryId: "repo",
            requestId: failure.requestId,
            expectedVersion: 0,
            relationshipId: failure.relationshipId,
            sourceObjectId: failure.sourceObjectId,
            targetObjectId: failure.targetObjectId,
            name: failure.name,
          }),
          (error) => isObjectError(error, failure.code),
        );
      }
      assert.deepEqual(
        (
          await pg.query<{ heads: number; revisions: number; receipts: number }>(
            `SELECT
             (SELECT count(*)::int FROM app_private.object_relationships
               WHERE id=ANY($1::uuid[])) heads,
             (SELECT count(*)::int FROM app_private.object_relationship_revisions
               WHERE relationship_id=ANY($1::uuid[])) revisions,
             (SELECT count(*)::int FROM app_private.object_commands
               WHERE request_id=ANY($2::uuid[])) receipts`,
            [
              failures.map((failure) => failure.relationshipId),
              failures.map((failure) => failure.requestId),
            ],
          )
        ).rows,
        [{ heads: 0, revisions: 0, receipts: 0 }],
      );
      const renamed = relationshipResult(
        await objects.executeRelationship("owner", {
          action: "rename",
          repositoryId: "repo",
          requestId: randomUUID(),
          expectedVersion: 1,
          relationshipId: forward.relationshipId,
          name: "requires",
        }),
      );
      assert.equal(renamed.version, 2);
      const relationshipHistory = await objects.relationshipHistory("owner", {
        repositoryId: "repo",
        relationshipId: forward.relationshipId,
      });
      assert.deepEqual(
        relationshipHistory.items.map((revision) => [revision.version, revision.name]),
        [
          [2, "requires"],
          [1, "depends on"],
        ],
      );
      await assert.rejects(
        db.transaction((sql) =>
          sql.query("UPDATE object_relationship_revisions SET name='tampered' WHERE id=$1", [
            forward.id,
          ]),
        ),
      );
    },
  );

  await t.test(
    "archived revisions remain readable but cannot receive a new reference",
    async () => {
      const referenceTypeId = await createType("repo", "Reference target");
      const target = await createObject("repo", referenceTypeId, "Target");
      const archived = objectResult(
        await objects.executeObject("owner", {
          action: "archive",
          repositoryId: "repo",
          requestId: randomUUID(),
          expectedVersion: 1,
          objectId: target.objectId,
        }),
      );
      assert.equal(archived.archived, true);

      const historical = await objects.readObject("owner", {
        repositoryId: "repo",
        objectId: target.objectId,
        revisionId: target.revision.id,
      });
      assert.equal(historical.archived, false);
      const existing = await db.transaction((sql) =>
        createPostgresObjectReferenceReader(sql).verifyPinned(
          "owner",
          "repo",
          [{ objectId: target.objectId, revisionId: target.revision.id }],
          { allowArchived: true },
        ),
      );
      assert.equal(existing[0]?.archived, true);
      assert.equal(existing[0]?.hasNewerRevision, true);
      await assert.rejects(
        db.transaction((sql) =>
          createPostgresObjectReferenceReader(sql).verifyPinned(
            "owner",
            "repo",
            [{ objectId: target.objectId, revisionId: target.revision.id }],
            { allowArchived: false },
          ),
        ),
        (error) => isObjectError(error, "OBJECT_ARCHIVED"),
      );
    },
  );

  await t.test(
    "exact replay is hash-bound and current grant revocation blocks replay and reads",
    async () => {
      const memberTypeId = await createType("repo", "Member content");
      await access.execute(
        "owner",
        {
          action: "grant",
          requestId: randomUUID(),
          repositoryId: "repo",
          subjectKind: "USER",
          subjectId: "member",
          capability: "write",
          expectedVersion: 0,
        },
        clock++,
      );
      const objectId = randomUUID();
      const command = {
        action: "create" as const,
        repositoryId: "repo",
        requestId: randomUUID(),
        expectedVersion: 0,
        objectId,
        typeId: memberTypeId,
        name: "Member object",
        content: "",
      };
      const first = await objects.executeObject("member", command);
      assert.deepEqual(await objects.executeObject("member", command), first);
      await assert.rejects(
        objects.executeObject("member", { ...command, name: "Changed payload" }),
        (error) => isObjectError(error, "REQUEST_ID_REUSED"),
      );
      assert.deepEqual(
        (
          await pg.query<{ heads: number; revisions: number; receipts: number }>(
            `SELECT
             (SELECT count(*)::int FROM app_private.objects WHERE id=$1) heads,
             (SELECT count(*)::int FROM app_private.object_revisions WHERE object_id=$1) revisions,
             (SELECT count(*)::int FROM app_private.object_commands
               WHERE actor_user_id='member' AND request_id=$2) receipts`,
            [objectId, command.requestId],
          )
        ).rows,
        [{ heads: 1, revisions: 1, receipts: 1 }],
      );
      await access.execute(
        "owner",
        {
          action: "revoke",
          requestId: randomUUID(),
          repositoryId: "repo",
          subjectKind: "USER",
          subjectId: "member",
          expectedVersion: 1,
        },
        clock++,
      );
      await assert.rejects(objects.executeObject("member", command));
      await assert.rejects(objects.readObject("member", { repositoryId: "repo", objectId }));
    },
  );

  await t.test("receipt failure rolls back the already-written head and revision", async () => {
    const rollbackTypeId = await createType("repo", "Rollback target");
    const objectId = randomUUID();
    const requestId = randomUUID();
    await pg.exec(`
      CREATE FUNCTION app_private.reject_test_object_command()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'forced_object_receipt_failure'; END
      $$;
      CREATE TRIGGER reject_test_object_command
      BEFORE INSERT ON app_private.object_commands
      FOR EACH ROW EXECUTE FUNCTION app_private.reject_test_object_command();
    `);
    try {
      await assert.rejects(
        objects.executeObject("owner", {
          action: "create",
          repositoryId: "repo",
          requestId,
          expectedVersion: 0,
          objectId,
          typeId: rollbackTypeId,
          name: "Must roll back",
          content: "",
        }),
        /forced_object_receipt_failure/,
      );
    } finally {
      await pg.exec(`
        DROP TRIGGER reject_test_object_command ON app_private.object_commands;
        DROP FUNCTION app_private.reject_test_object_command();
      `);
    }
    assert.deepEqual(
      (
        await pg.query<{ heads: number; revisions: number; receipts: number }>(
          `SELECT
             (SELECT count(*)::int FROM app_private.objects WHERE id=$1) heads,
             (SELECT count(*)::int FROM app_private.object_revisions WHERE object_id=$1) revisions,
             (SELECT count(*)::int FROM app_private.object_commands WHERE request_id=$2) receipts`,
          [objectId, requestId],
        )
      ).rows,
      [{ heads: 0, revisions: 0, receipts: 0 }],
    );
    await assert.rejects(
      db.transaction((sql) =>
        sql.query("DELETE FROM object_commands WHERE request_id=$1", [requestId]),
      ),
    );
  });
});
