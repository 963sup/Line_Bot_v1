import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { parsePermissionCommand } from "../src/application/commands/permission.js";
import { parsePermissionCommand as publishedParser } from "../src/application/permissions.js";
import {
  assertPermissionAdministratorDeactivation,
  assertPermissionChangeActor,
  assertPermissionChangeState,
  assertPermissionDependencies,
  PermissionError,
  permissions,
} from "../src/domain/permission.js";

const command = {
  requestId: randomUUID(),
  target: "user-2",
  permission: "users.read",
  enabled: true,
  expectedVersion: 0,
  reason: " authorize ",
};

test("current permission commands have no workplace scope", () => {
  assert.deepEqual(Object.keys(permissions), [
    "users.read",
    "users.suspend",
    "partners.manage",
    "partners.review",
  ]);
  assert.deepEqual(parsePermissionCommand(command), { ...command, reason: "authorize" });
  assert.throws(() => parsePermissionCommand({ ...command, workplaceId: null }));
  assert.throws(() => parsePermissionCommand({ ...command, permission: "workplaces.manage" }));
  for (const permission of ["OrganizationAdmin", "ADMIN", "RepositoryPermission"] as const) {
    assert.throws(() => parsePermissionCommand({ ...command, permission }));
  }
});

test("published parser preserves request identity, target spelling and canonical reason", () => {
  const raw = { ...command, requestId: command.requestId.toUpperCase(), target: " user-2 " };
  const expected = { ...raw, reason: "authorize" };
  assert.deepEqual(parsePermissionCommand(raw), expected);
  assert.deepEqual(publishedParser(raw), expected);
  assert.throws(() => publishedParser({ ...raw, extra: true }), PermissionError);
});

test("published permission policies still accept existing command objects and preserve failures", () => {
  assertPermissionAdministratorDeactivation(true, true);
  assert.throws(() => assertPermissionAdministratorDeactivation(true, false), { status: 409 });
  const parsed = publishedParser(command);
  assertPermissionChangeActor("admin", { ...parsed }, true);
  assert.throws(() => assertPermissionChangeActor(parsed.target, { ...parsed }, true), {
    status: 403,
  });
  assertPermissionChangeState({ ...parsed }, 0, true);
  assert.throws(() => assertPermissionChangeState({ ...parsed }, 1, true), { status: 409 });
  assertPermissionDependencies({ ...parsed }, { canReadUsers: false, hasSuspendGrant: false });
  assert.throws(
    () =>
      assertPermissionDependencies(
        { ...parsed, permission: "users.suspend" },
        { canReadUsers: false, hasSuspendGrant: false },
      ),
    { status: 409 },
  );
});
