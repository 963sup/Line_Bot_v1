import assert from "node:assert/strict";
import test from "node:test";
import { normalizeEnterpriseWireCommand } from "../src/modules/enterprise/wire-command.js";

test("legacy EnterpriseOwner wire command translates at the Web boundary", () => {
  const base = {
    requestId: "11111111-1111-4111-8111-111111111111",
    scopeKind: "enterprise",
    scopeId: "enterprise-1",
    principal: { kind: "user", id: "user-2" },
    role: "EnterpriseOwner",
    expectedVersion: 3,
    reason: "rolling deploy",
  };

  assert.deepEqual(normalizeEnterpriseWireCommand({ action: "grant", ...base }), {
    action: "grant-enterprise-owner",
    requestId: base.requestId,
    enterpriseAccountId: "enterprise-1",
    targetUserId: "user-2",
    expectedVersion: 3,
    reason: "rolling deploy",
  });
  assert.deepEqual(normalizeEnterpriseWireCommand({ action: "revoke", ...base }), {
    action: "revoke-enterprise-owner",
    requestId: base.requestId,
    enterpriseAccountId: "enterprise-1",
    targetUserId: "user-2",
    expectedVersion: 3,
    reason: "rolling deploy",
  });
});

test("wire compatibility stays narrow and fails closed", () => {
  const legacy = {
    action: "grant",
    requestId: "11111111-1111-4111-8111-111111111111",
    scopeKind: "enterprise",
    scopeId: "enterprise-1",
    principal: { kind: "user", id: "user-2" },
    role: "EnterpriseOwner",
    expectedVersion: 0,
    reason: "rolling deploy",
  };
  for (const value of [
    { ...legacy, scopeKind: "organization" },
    { ...legacy, role: "OrganizationOwner" },
    { ...legacy, principal: { kind: "organization-team", id: "team-1" } },
    { ...legacy, unexpected: true },
    { ...legacy, principal: { ...legacy.principal, unexpected: true } },
  ]) {
    assert.equal(normalizeEnterpriseWireCommand(value), value);
  }
});
