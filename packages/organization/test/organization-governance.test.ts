import assert from "node:assert/strict";
import test from "node:test";
import { organizationGovernance } from "../src/application/organization-governance.js";
import type { OrganizationGovernancePort } from "../src/contracts/input/organization-governance.js";

test("OrganizationOwner mutation is owned by the Organization command contract", async () => {
  let observed: unknown;
  const port: OrganizationGovernancePort = {
    async list() {
      throw new Error("not used");
    },
    async detail() {
      throw new Error("not used");
    },
    async execute(_actor, command) {
      observed = command;
      return {
        requestId: command.requestId,
        action: command.action,
        scopeId: "organizationAccountId" in command ? command.organizationAccountId : command.login,
        subjectKind: "targetUserId" in command ? "user" : null,
        subjectId: "targetUserId" in command ? command.targetUserId : null,
        status: "active",
        version: 1,
        at: 100,
      };
    },
  };
  const service = organizationGovernance(port, () => 100);
  const actor = { provider: "line:test", subject: `U${"1".repeat(32)}` };
  const requestId = "11111111-1111-4111-8111-111111111111";

  await service.execute(actor, {
    action: "grant-organization-owner",
    requestId,
    organizationAccountId: "organization-1",
    targetUserId: "user-2",
    expectedVersion: 0,
    reason: "grant owner",
  });
  assert.deepEqual(observed, {
    action: "grant-organization-owner",
    requestId,
    organizationAccountId: "organization-1",
    targetUserId: "user-2",
    expectedVersion: 0,
    reason: "grant owner",
  });

  assert.throws(
    () =>
      service.execute(actor, {
        action: "grant",
        requestId,
        scopeKind: "organization",
        scopeId: "organization-1",
        principal: { kind: "user", id: "user-2" },
        role: "OrganizationOwner",
        expectedVersion: 0,
        reason: "legacy writer",
      }),
    (error: unknown) => (error as { status?: number }).status === 400,
  );
});
