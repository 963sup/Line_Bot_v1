import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { createAuditQuery } from "@line_bot_v1/audit/application";
import { GovernanceAccessError } from "@line_bot_v1/identity-access/domain/role-assignment";
import { LINE_PROVIDER_NAMESPACE } from "@line_bot_v1/line-channel/provider";
import { auditQuery } from "../src/app/api/_composition/audit.server";
import { GET } from "../src/app/api/audit/route";
import { auditRequest } from "../src/modules/audit/http.server";
import { lineMiniApp } from "../src/shared/server/line-mini-app";
import { RequestIdentityError } from "../src/shared/server/request-identity-error";

test("audit route verifies LINE identity before forwarding the exact scope to Audit", async () => {
  const subject = `U${"8".repeat(32)}`;
  const list = mock.method(auditQuery, "list", async () => ({
    ok: true as const,
    events: [],
    next: null,
  }));
  const fetch = mock.method(globalThis, "fetch", async (input: unknown) => {
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

test("audit HTTP separates unauthenticated, invalid, forbidden, empty and unavailable results", async () => {
  const request = new Request("https://app.example/api/audit?scopeKind=organization&scopeId=org");
  const identity = async () => ({ provider: "line:test", subject: "owner" });
  let reads = 0;
  const query = createAuditQuery({
    read: async () => {
      reads++;
      return [];
    },
  });
  const unauthorized = await auditRequest(
    request,
    async () => {
      throw new RequestIdentityError(401, "denied");
    },
    query,
  );
  assert.equal(unauthorized.status, 401);
  assert.equal(reads, 0);
  assert.equal(
    (await auditRequest(new Request("https://app.example/api/audit"), identity, query)).status,
    400,
  );
  assert.equal(reads, 0);
  const ok = await auditRequest(request, identity, query);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("cache-control"), "no-store");
  assert.deepEqual(await ok.json(), { ok: true, events: [], next: null });
  const denied = await auditRequest(
    request,
    identity,
    createAuditQuery({
      read: async () => {
        throw new GovernanceAccessError(403, "forbidden", "private detail");
      },
    }),
  );
  assert.equal(denied.status, 403);
  const failed = await auditRequest(
    request,
    identity,
    createAuditQuery({
      read: async () => {
        throw new Error("private database detail");
      },
    }),
  );
  assert.equal(failed.status, 503);
  assert.equal((await failed.text()).includes("private database detail"), false);
});
