import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { parsePermissionCommand, permissions } from "../src/domain/permission.js";

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
