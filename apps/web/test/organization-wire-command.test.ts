import assert from "node:assert/strict";
import test from "node:test";
import { normalizeOrganizationWireCommand } from "../src/modules/organization/wire-command.js";

test("legacy OrganizationOwner wire command translates at the Web boundary", () => {
  const base = {
    requestId: "11111111-1111-4111-8111-111111111111",
    scopeKind: "organization",
    scopeId: "organization-1",
    principal: { kind: "user", id: "user-2" },
    role: "OrganizationOwner",
    expectedVersion: 3,
    reason: "rolling deploy",
  };

  assert.deepEqual(normalizeOrganizationWireCommand({ action: "grant", ...base }), {
    action: "grant-organization-owner",
    requestId: base.requestId,
    organizationAccountId: "organization-1",
    targetUserId: "user-2",
    expectedVersion: 3,
    reason: "rolling deploy",
  });
  assert.deepEqual(normalizeOrganizationWireCommand({ action: "revoke", ...base }), {
    action: "revoke-organization-owner",
    requestId: base.requestId,
    organizationAccountId: "organization-1",
    targetUserId: "user-2",
    expectedVersion: 3,
    reason: "rolling deploy",
  });
});

test("Organization wire compatibility stays narrow and fails closed", () => {
  const legacy = {
    action: "grant",
    requestId: "11111111-1111-4111-8111-111111111111",
    scopeKind: "organization",
    scopeId: "organization-1",
    principal: { kind: "user", id: "user-2" },
    role: "OrganizationOwner",
    expectedVersion: 0,
    reason: "rolling deploy",
  };
  for (const value of [
    { ...legacy, scopeKind: "enterprise" },
    { ...legacy, role: "TeamMaintainer" },
    { ...legacy, principal: { kind: "organization-team", id: "team-1" } },
    { ...legacy, unexpected: true },
    { ...legacy, principal: { ...legacy.principal, unexpected: true } },
  ]) {
    assert.equal(normalizeOrganizationWireCommand(value), value);
  }
});
