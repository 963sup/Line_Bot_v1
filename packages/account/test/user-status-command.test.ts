import assert from "node:assert/strict";
import test from "node:test";
import { parseUserStatusCommand } from "../src/application/manage-users.js";
import { UserError } from "../src/domain/user.js";

test("User status parsing preserves canonical fingerprint order, lowercase identity and trimmed reason", () => {
  const parsed = parseUserStatusCommand({
    reason: "  audit  ",
    expectedVersion: 1,
    target: "user-1",
    requestId: "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE",
    action: "suspend",
  });
  assert.equal(
    JSON.stringify(parsed),
    '{"action":"suspend","requestId":"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee","target":"user-1","expectedVersion":1,"reason":"audit"}',
  );
  assert.equal(
    parseUserStatusCommand({ ...parsed, reason: ` ${"x".repeat(500)} ` }).reason.length,
    500,
  );
  for (const raw of [
    null,
    [],
    { ...parsed, extra: true },
    { ...parsed, expectedVersion: 0 },
    { ...parsed, reason: "x".repeat(501) },
  ]) {
    assert.throws(() => parseUserStatusCommand(raw), UserError);
  }
});
