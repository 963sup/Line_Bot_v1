import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { createAuditQuery } from "@line_bot_v1/audit/application/use-cases/read-governance-audit";
import { GovernanceAccessError } from "@line_bot_v1/identity-access/domain/role-assignment";
import { LINE_PROVIDER_NAMESPACE } from "@line_bot_v1/line-channel/provider";
import { auditQuery } from "../src/app/api/_composition/audit.server";
import { GET } from "../src/app/api/audit/route";
import { lineMiniApp } from "@line_bot_v1/line-channel/mini-app";

const subject = `U${"8".repeat(32)}`;

function mockLineIdentity() {
  return mock.method(globalThis, "fetch", async (input: unknown) => {
    const url = String(input);
    if (url.startsWith("https://api.line.me/oauth2/v2.1/verify?"))
      return Response.json({
        client_id: lineMiniApp("developing").channelId,
        expires_in: 30,
        scope: "profile",
      });
    if (url === "https://api.line.me/v2/profile") return Response.json({ userId: subject });
    throw new Error("Unexpected network request");
  });
}

test("audit route verifies LINE identity before forwarding the exact scope to Audit", async () => {
  const list = mock.method(
    auditQuery,
    "list",
    async (): Promise<Awaited<ReturnType<typeof auditQuery.list>>> => ({
      ok: true,
      events: [],
      next: null,
    }),
  );
  const fetch = mockLineIdentity();
  try {
    const url = "https://app.example/api/audit?scopeKind=organization&scopeId=org&limit=5";
    assert.equal((await GET(new Request(url))).status, 401);
    assert.equal(list.mock.callCount(), 0);
    const response = await GET(new Request(url, { headers: { "x-line-token": "offline-audit" } }));
    assert.equal(response.status, 200);
    assert.deepEqual(list.mock.calls[0]?.arguments, [
      { provider: LINE_PROVIDER_NAMESPACE, subject },
      { scopeKind: "organization", scopeId: "org", before: undefined, limit: 5 },
    ]);
  } finally {
    list.mock.restore();
    fetch.mock.restore();
  }
});

test("audit route separates uncached unauthenticated, invalid, forbidden, empty and unavailable results", async () => {
  const url = "https://app.example/api/audit?scopeKind=organization&scopeId=org";
  const headers = { "x-line-token": "offline-audit" };
  let reads = 0;
  let sourceError: Error | undefined;
  const query = createAuditQuery({
    read: async () => {
      reads++;
      if (sourceError) throw sourceError;
      return [];
    },
  });
  const list = mock.method(auditQuery, "list", query.list);
  const fetch = mockLineIdentity();
  try {
    const unauthorized = await GET(new Request(url));
    assert.equal(unauthorized.status, 401);
    assert.equal(unauthorized.headers.get("cache-control"), "no-store");
    assert.deepEqual(await unauthorized.json(), { error: "unauthorized", retryable: false });
    assert.equal(reads, 0);
    assert.equal(list.mock.callCount(), 0);

    const invalid = await GET(new Request("https://app.example/api/audit", { headers }));
    assert.equal(invalid.status, 400);
    assert.equal(invalid.headers.get("cache-control"), "no-store");
    assert.deepEqual(await invalid.json(), { ok: false, error: "invalid-input" });
    assert.equal(reads, 0);

    const ok = await GET(new Request(url, { headers }));
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get("cache-control"), "no-store");
    assert.deepEqual(await ok.json(), { ok: true, events: [], next: null });

    sourceError = new GovernanceAccessError(403, "forbidden", "private authority detail");
    const denied = await GET(new Request(url, { headers }));
    assert.equal(denied.status, 403);
    assert.equal(denied.headers.get("cache-control"), "no-store");
    assert.deepEqual(await denied.json(), { ok: false, error: "forbidden" });

    sourceError = new Error("private database detail");
    const failed = await GET(new Request(url, { headers }));
    assert.equal(failed.status, 503);
    assert.equal(failed.headers.get("cache-control"), "no-store");
    assert.deepEqual(await failed.json(), { error: "unavailable", retryable: true });
    assert.equal(reads, 3);
  } finally {
    list.mock.restore();
    fetch.mock.restore();
  }
});
