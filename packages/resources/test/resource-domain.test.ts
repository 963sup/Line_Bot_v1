import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { parseResourceCommand } from "../src/application/resource-commands.js";
import { reviseResource } from "../src/domain/resource.js";
import { ResourceError } from "../src/domain/resource-error.js";

const context = (resourceId = randomUUID(), at = 1) => ({
  id: randomUUID(),
  resourceId,
  repositoryId: "repo",
  actorUserId: "owner",
  at,
});

test("Resource owns only physical kind, normalized text and lifecycle", () => {
  const resourceId = randomUUID();
  const created = reviseResource(
    null,
    0,
    { action: "create", kind: "EQUIPMENT", name: "  Fusion splicer  ", description: "A" },
    context(resourceId),
  );
  assert.equal(created.name, "Fusion splicer");
  assert.equal(created.kind, "EQUIPMENT");
  const edited = reviseResource(
    created,
    1,
    { action: "edit", name: "Fusion splicer 2", description: "B" },
    context(resourceId, 2),
  );
  assert.equal(edited.kind, "EQUIPMENT");
  const archived = reviseResource(edited, 2, { action: "archive" }, context(resourceId, 3));
  assert.equal(archived.state, "ARCHIVED");
  assert.throws(
    () =>
      reviseResource(
        archived,
        3,
        { action: "edit", name: "No", description: "" },
        context(resourceId, 4),
      ),
    (error) => error instanceof ResourceError && error.code === "LIFECYCLE_CONFLICT",
  );
  assert.equal(
    reviseResource(archived, 3, { action: "unarchive" }, context(resourceId, 4)).state,
    "ACTIVE",
  );
});

test("Resource command rejects unknown business fields and kind mutation", () => {
  const base = {
    repositoryId: "repo",
    resourceId: randomUUID(),
    requestId: randomUUID(),
    expectedVersion: 0,
  };
  assert.equal(
    parseResourceCommand({
      ...base,
      action: "create",
      kind: "LOCATION",
      name: "Cabinet A",
      description: "",
    }).action,
    "create",
  );
  assert.throws(
    () =>
      parseResourceCommand({
        ...base,
        action: "edit",
        kind: "MATERIAL",
        name: "Cable",
        description: "",
      }),
    (error) => error instanceof ResourceError && error.code === "INVALID_INPUT",
  );
  assert.throws(
    () =>
      parseResourceCommand({
        ...base,
        action: "create",
        kind: "WORK",
        name: "Forbidden work content",
        description: "",
      }),
    ResourceError,
  );
});
