import assert from "node:assert/strict";
import { test } from "node:test";
import type { GovernanceAuditEvent } from "@line_bot_v1/identity-access/contracts/audit";
import { GovernanceAccessError } from "@line_bot_v1/identity-access/domain/role-assignment";
import { createAuditQuery } from "../src/application/use-cases/read-governance-audit.js";
import { parseAuditCursor } from "../src/contracts/dto/governance-audit.js";

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
    { ...scope, scopeId: " " },
    { ...scope, scopeId: "x".repeat(257) },
    { ...scope, scopeKind: "organization-team" },
    { ...scope, limit: 0 },
    { ...scope, limit: 101 },
    { ...scope, limit: 1.5 },
    { ...scope, limit: Number.NaN },
    { ...scope, limit: Number.POSITIVE_INFINITY },
    { ...scope, before: "100:9223372036854775808" },
    { ...scope, before: "9007199254740992:1" },
    { ...scope, before: "NaN:1" },
    { ...scope, before: "" },
    { ...scope, before: "100:0" },
    { ...scope, before: "100:01" },
    { ...scope, before: "01:1" },
    { ...scope, before: "-1:1" },
    { ...scope, before: "1:1:1" },
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
  assert.equal(calls, 1);
});

test("audit cursor contract retains timestamp and bigint identity boundaries", () => {
  assert.deepEqual(parseAuditCursor("0:1"), { at: 0, id: "1" });
  assert.deepEqual(parseAuditCursor("9007199254740991:9223372036854775807"), {
    at: Number.MAX_SAFE_INTEGER,
    id: "9223372036854775807",
  });
  for (const cursor of ["1:", ":1", "1e2:1", "0x10:1", "1:-1", "1:1.5", "1: 1"]) {
    assert.equal(parseAuditCursor(cursor), null);
  }
});

test("audit defaults the page size and forwards exact actor and scope without normalization", async () => {
  let calls = 0;
  const query = createAuditQuery({
    read: async (receivedActor, input) => {
      calls++;
      assert.equal(receivedActor, actor);
      assert.deepEqual(input, {
        scopeKind: "enterprise",
        scopeId: " exact-scope ",
        before: undefined,
        limit: calls === 1 ? 51 : 101,
      });
      return [];
    },
  });
  const exactScope = { scopeKind: "enterprise", scopeId: " exact-scope " };
  assert.deepEqual(await query.list(actor, exactScope), { ok: true, events: [], next: null });
  assert.deepEqual(await query.list(actor, { ...exactScope, limit: 100 }), {
    ok: true,
    events: [],
    next: null,
  });
  assert.equal(calls, 2);
});

test("audit preserves source order and rows; a full final page has no next cursor", async () => {
  const rows = [event("3"), event("2"), event("1")];
  const query = createAuditQuery({ read: async () => rows });
  assert.deepEqual(await query.list(actor, { ...scope, limit: 2 }), {
    ok: true,
    events: [event("3"), event("2")],
    next: "100:2",
  });
  assert.deepEqual(rows, [event("3"), event("2"), event("1")]);
  assert.deepEqual(await query.list(actor, { ...scope, limit: 3 }), {
    ok: true,
    events: rows,
    next: null,
  });
});

test("audit consults current source authorization again on the next page", async () => {
  let authorized = true;
  let calls = 0;
  const query = createAuditQuery({
    read: async (receivedActor, input) => {
      calls++;
      assert.equal(receivedActor, actor);
      assert.equal(input.scopeId, scope.scopeId);
      if (!authorized) {
        assert.deepEqual(input.before, { at: 100, id: "2" });
        throw new GovernanceAccessError(403, "forbidden", "authority revoked");
      }
      return [event("2"), event("1")];
    },
  });
  const first = await query.list(actor, { ...scope, limit: 1 });
  if (!first.ok || first.next === null) assert.fail("Expected a next page cursor");
  authorized = false;
  assert.deepEqual(await query.list(actor, { ...scope, limit: 1, before: first.next }), {
    ok: false,
    error: "forbidden",
  });
  assert.equal(calls, 2);
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
  for (const failure of [
    new Error("database failed"),
    new GovernanceAccessError(503, "unknown-result", "source unavailable"),
  ]) {
    await assert.rejects(
      createAuditQuery({
        read: async () => {
          throw failure;
        },
      }).list(actor, scope),
      (error: unknown) => error === failure,
    );
  }
});
