import assert from "node:assert/strict";
import { test } from "node:test";
import { FileError } from "@line_bot_v1/file/domain/error";
import {
  CommercialIntakeError,
  type CommercialIntakeStatus,
} from "@line_bot_v1/intelligence/contracts/output/commercial-intake";
import {
  type CommercialWebRuntime,
  commercialIntakeRequest,
} from "../src/modules/document-intake/commercial-intake-http.server";
import { RequestIdentityError } from "../src/shared/server/request-identity-error";

process.env.APP_ORIGIN = "https://app.example";
const result: CommercialIntakeStatus = {
  state: "RESULT_READY",
  commandId: "analysis-1",
  extractionResultId: "result-1",
  documentId: "doc-1",
  receipt: null,
  failure: null,
};
const calls: string[] = [];
function runtime(): CommercialWebRuntime {
  return {
    scope: async () => ({
      actorUserId: "user-1",
      repository: { id: "repo-1" },
      canEdit: true,
      archived: false,
    }),
    intake: {
      start: async () => {
        calls.push("start");
        return result;
      },
      status: async () => {
        calls.push("status");
        return result;
      },
      resume: async () => {
        calls.push("resume");
        return result;
      },
    },
    documents: {
      read: async () => null,
      readBySource: async () => null,
      receipt: async () => null,
    },
  };
}
function request(
  operation?: string,
  command: object = { repositoryId: "repo-1", commandId: "analysis-1" },
) {
  return new Request(
    `https://app.example/api/document-intakes?owner=owner&name=repo&commandId=analysis-1`,
    operation
      ? {
          method: "POST",
          headers: { origin: "https://app.example", "content-type": "application/json" },
          body: JSON.stringify({ operation, ...command }),
        }
      : undefined,
  );
}
test("status GET and resume POST never invoke provider start", async () => {
  calls.length = 0;
  const rt = runtime();
  assert.equal((await commercialIntakeRequest(request(), rt, async () => "subject")).status, 200);
  assert.equal(
    (await commercialIntakeRequest(request("resume"), rt, async () => "subject")).status,
    200,
  );
  assert.deepEqual(calls, ["status", "resume"]);
});
test("trusted identity and current edit permission are required before resume", async () => {
  calls.length = 0;
  const rt = runtime();
  assert.equal(
    (
      await commercialIntakeRequest(request("resume"), rt, async () => {
        throw new RequestIdentityError(401, "Login required.");
      })
    ).status,
    401,
  );
  rt.scope = async () => ({
    actorUserId: "user-1",
    repository: { id: "repo-1" },
    canEdit: false,
    archived: false,
  });
  assert.equal(
    (await commercialIntakeRequest(request("resume"), rt, async () => "subject")).status,
    403,
  );
  assert.deepEqual(calls, []);
});
test("scope and Origin mismatches fail before owner commands", async () => {
  calls.length = 0;
  assert.equal(
    (
      await commercialIntakeRequest(
        request("resume", { repositoryId: "other", commandId: "analysis-1" }),
        runtime(),
        async () => "subject",
      )
    ).status,
    400,
  );
  const wrong = request("resume");
  wrong.headers.set("origin", "https://evil.example");
  assert.equal(
    (await commercialIntakeRequest(wrong, runtime(), async () => "subject")).status,
    403,
  );
  assert.deepEqual(calls, []);
});
test("unexpected failures expose the original error with correlation", async () => {
  const rt = runtime();
  rt.intake.status = async () => {
    throw new Error("secret SQL provider source");
  };
  const response = await commercialIntakeRequest(request(), rt, async () => "subject");
  assert.equal(response.status, 500);
  const body = await response.text();
  assert.match(body, /secret SQL provider source/);
  assert.match(body, /traceId/);
});

test("start forwards exact source pins and distinct stable analysis/draft identities", async () => {
  const rt = runtime();
  let received: unknown;
  rt.intake.start = async (ctx, command) => {
    assert.equal(ctx.actorUserId, "user-1");
    assert.match(ctx.traceId, /^[a-f0-9-]{36}$/);
    received = command;
    return result;
  };
  const command = {
    repositoryId: "repo-1",
    commandId: "analysis-1",
    source: { fileId: "file-1", fileRevisionId: "revision-1", sha256: "a".repeat(64) },
    target: { documentId: "doc-1", draftCommandId: "draft-1", expectedDocumentVersion: 0 },
  };
  assert.equal(
    (await commercialIntakeRequest(request("start", command), rt, async () => "subject")).status,
    200,
  );
  assert.deepEqual(received, command);
});
test("new document GET reads only authorized Contract draft and receipt projections", async () => {
  const rt = runtime();
  const seen: unknown[] = [];
  rt.documents.read = async (actor, query) => {
    seen.push({ actor, query });
    return null;
  };
  rt.documents.receipt = async (actor, query) => {
    seen.push({ actor, query });
    return null;
  };
  for (const suffix of ["documentId=doc-1", "operation=receipt&commandId=draft-1"]) {
    const response = await commercialIntakeRequest(
      new Request(`https://app.example/api/commercial-documents?owner=owner&name=repo&${suffix}`),
      rt,
      async () => "subject",
      "document",
    );
    assert.equal(response.status, 200);
  }
  assert.deepEqual(seen, [
    { actor: "user-1", query: { repositoryId: "repo-1", documentId: "doc-1" } },
    { actor: "user-1", query: { repositoryId: "repo-1", commandId: "draft-1" } },
  ]);
});
test("oversized JSON and invalid versions are rejected without starting a provider", async () => {
  calls.length = 0;
  const oversized = request("resume", { repositoryId: "repo-1", commandId: "a".repeat(9000) });
  assert.equal(
    (await commercialIntakeRequest(oversized, runtime(), async () => "subject")).status,
    413,
  );
  assert.equal(
    (
      await commercialIntakeRequest(
        request("start", {
          repositoryId: "repo-1",
          commandId: "analysis-1",
          source: {},
          target: { expectedDocumentVersion: -1 },
        }),
        runtime(),
        async () => "subject",
      )
    ).status,
    400,
  );
  assert.deepEqual(calls, []);
});

test("typed unknown extraction errors preserve failure stage and original command semantics", async () => {
  const rt = runtime();
  rt.intake.resume = async () => {
    throw new CommercialIntakeError("EXTRACTION_OUTCOME_UNKNOWN", 503, "intelligence.extract");
  };
  const response = await commercialIntakeRequest(request("resume"), rt, async () => "subject");
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.code, "EXTRACTION_OUTCOME_UNKNOWN");
  assert.equal(body.stage, "intelligence.extract");
  assert.equal(body.error, "EXTRACTION_OUTCOME_UNKNOWN");
});

test("revoked File authorization preserves original 401/403 errors so the browser clears private drafts", async () => {
  for (const status of [401, 403]) {
    const rt = runtime();
    rt.intake.status = async () => {
      throw new FileError(status, "private source filename provider SQL", "FORBIDDEN");
    };
    const response = await commercialIntakeRequest(request(), rt, async () => "subject");
    assert.equal(response.status, status);
    const body = await response.json();
    assert.equal(body.code, "FORBIDDEN");
    assert.equal(body.error, "private source filename provider SQL");
  }
});

test("saved draft lookup by exact source forwards current actor and URL repository scope", async () => {
  const rt = runtime();
  let seen: unknown;
  rt.documents.readBySource = async (actor, query) => {
    seen = { actor, query };
    return null;
  };
  const sourceRequest = () =>
    new Request(
      "https://app.example/api/commercial-documents?owner=owner&name=repo&operation=source&fileId=file-a&fileRevisionId=revision-a",
    );
  const response = await commercialIntakeRequest(
    sourceRequest(),
    rt,
    async () => "subject",
    "document",
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { revision: null });
  assert.deepEqual(seen, {
    actor: "user-1",
    query: { repositoryId: "repo-1", fileId: "file-a", fileRevisionId: "revision-a" },
  });
  rt.documents.readBySource = async () => {
    throw new FileError(403, "private source content", "FORBIDDEN");
  };
  const denied = await commercialIntakeRequest(
    sourceRequest(),
    rt,
    async () => "subject",
    "document",
  );
  assert.equal(denied.status, 403);
  assert.match(await denied.text(), /private source content/);
});

test("commercial POST rejects unknown fields before any owner operation", async () => {
  const command = {
    repositoryId: "repo-1",
    commandId: "analysis-1",
    source: { fileId: "file-1", fileRevisionId: "revision-1", sha256: "a".repeat(64) },
    target: { documentId: "doc-1", draftCommandId: "draft-1", expectedDocumentVersion: 0 },
  };
  for (const value of [
    { ...command, model: "browser-model" },
    { ...command, actorUserId: "other" },
    { ...command, source: { ...command.source, file_url: "https://other.example" } },
    { ...command, target: { ...command.target, reviewState: "VERIFIED" } },
  ]) {
    calls.length = 0;
    assert.equal(
      (await commercialIntakeRequest(request("start", value), runtime(), async () => "subject"))
        .status,
      400,
    );
    assert.deepEqual(calls, []);
  }
  calls.length = 0;
  assert.equal(
    (
      await commercialIntakeRequest(
        request("resume", {
          repositoryId: "repo-1",
          commandId: "analysis-1",
          source: command.source,
        }),
        runtime(),
        async () => "subject",
      )
    ).status,
    400,
  );
  assert.deepEqual(calls, []);
});
