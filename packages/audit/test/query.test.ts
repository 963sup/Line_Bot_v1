import assert from "node:assert/strict";
import { test } from "node:test";
import type { GovernanceAuditEvent } from "@line_bot_v1/identity-access/contracts/audit";
import { GovernanceAccessError } from "@line_bot_v1/identity-access/domain/role-assignment";
import { createAuditQuery } from "../src/application.js";

const actor = { provider: "line:test", subject: "viewer" };
const scope = { scopeKind: "organization", scopeId: "org" };
const event = (id: string): GovernanceAuditEvent => ({
  id,
  actorUserId: "owner",
  action: "grant",
  scopeKind: "organization",
  scopeId: "org",
  subjectKind: "user",
  subjectId: "member",
  requestId: "request",
  occurredAt: 100,
  outcome: "active",
  version: 1,
});

test("audit validates scope and cursor before reading; pagination preserves bigint identity", async () => {
  let calls = 0;
  const query = createAuditQuery({
    read: async (receivedActor, input) => {
      calls++;
      assert.deepEqual(receivedActor, actor);
      assert.equal(input.limit, 2);
      assert.deepEqual(input.before, { at: 101, id: "9223372036854775807" });
      return [event("9007199254740993"), event("9007199254740992")];
    },
  });
  for (const input of [
    { ...scope, scopeId: "" },
    { ...scope, scopeKind: "organization-team" },
    { ...scope, limit: 0 },
    { ...scope, limit: 101 },
    { ...scope, limit: 1.5 },
    { ...scope, before: "100:9223372036854775808" },
    { ...scope, before: "NaN:1" },
  ]) {
    assert.deepEqual(await query.list(actor, input), { ok: false, error: "invalid-input" });
  }
  assert.equal(calls, 0);
  assert.deepEqual(
    await query.list(actor, { ...scope, limit: 1, before: "101:9223372036854775807" }),
    {
      ok: true,
      events: [event("9007199254740993")],
      next: "100:9007199254740993",
    },
  );
});

test("audit distinguishes forbidden, empty history and unavailable source", async () => {
  assert.deepEqual(await createAuditQuery({ read: async () => [] }).list(actor, scope), {
    ok: true,
    events: [],
    next: null,
  });
  assert.deepEqual(
    await createAuditQuery({
      read: async () => {
        throw new GovernanceAccessError(403, "forbidden", "denied");
      },
    }).list(actor, scope),
    { ok: false, error: "forbidden" },
  );
  await assert.rejects(
    createAuditQuery({
      read: async () => {
        throw new Error("database failed");
      },
    }).list(actor, scope),
    /database failed/,
  );
});
