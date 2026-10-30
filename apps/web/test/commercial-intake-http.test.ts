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

const fixedTask = "12345678-1234-4234-8234-123456789012";
const fixedSource = {
  fileId: "11111111-1111-4111-8111-111111111111",
  fileRevisionId: "22222222-2222-4222-8222-222222222222",
  sha256: "a".repeat(64),
};
function taskRequest(operation?: "start" | "resume", body?: object) {
  return new Request(
    `https://app.example/api/commercial-tasks?owner=owner&name=repo&taskId=${fixedTask}`,
    operation
      ? {
          method: "POST",
          headers: { origin: "https://app.example", "content-type": "application/json" },
          body: JSON.stringify({
            operation, taskId: fixedTask, repositoryId: "repo-1",
            ...(operation === "start" ? { source: fixedSource } : {}),
            ...body,
          }),
        }
      : undefined,
  );
}

test("Commercial Task start, status and resume reuse one validated transport and pinned identities", async () => {
  const rt = runtime();
  const seen: { commandId: string; documentId: string; draftId: string; source: unknown }[] = [];
  let saved: CommercialIntakeStatus | null = null;
  rt.intake.start = async (_ctx, command) => {
    seen.push({
      commandId: command.commandId, documentId: command.target.documentId,
      draftId: command.target.draftCommandId, source: command.source,
    });
    saved = { ...result, commandId: command.commandId, documentId: command.target.documentId };
    return saved;
  };
  rt.intake.status = async (_ctx, query) => {
    assert.equal(query.repositoryId, "repo-1");
    assert.equal(query.commandId, seen[0]?.commandId);
    if (!saved) throw new Error("not started");
    return saved;
  };
  rt.intake.resume = rt.intake.status;
  const start = await commercialIntakeRequest(taskRequest("start"), rt, async () => "subject", "task");
  assert.equal(start.status, 200);
  const startBody = await start.json();
  assert.equal(startBody.taskId, fixedTask);
  assert.equal(startBody.commandId, seen[0]?.commandId);
  assert.equal(startBody.documentId, seen[0]?.documentId);
  assert.deepEqual(seen[0]?.source, fixedSource);
  assert.ok(seen[0]?.draftId !== seen[0]?.documentId);
  assert.ok(seen[0]?.draftId !== seen[0]?.commandId);
  for (const req of [taskRequest(), taskRequest("resume")]) {
    const answer = await commercialIntakeRequest(req, rt, async () => "subject", "task");
    assert.equal(answer.status, 200);
    assert.equal((await answer.json()).taskId, fixedTask);
  }
  assert.equal(seen.length, 1, "Status/resume must not re-dispatch the extraction");
});

test("Commercial Task rejects untrusted identity, unknown fields and unbounded requests before owner calls", async () => {
  const rt = runtime();
  calls.length = 0;
  for (const req of [
    taskRequest("start", { extra: "unsafe" }),
    taskRequest("start", { source: { ...fixedSource, publicUrl: "https://evil.example" } }),
    taskRequest("start", { source: { ...fixedSource, sha256: "wrong" } }),
    taskRequest("resume", { documentId: fixedTask }),
    taskRequest("start", { taskId: "invalid" }),
    taskRequest("resume", { repositoryId: "other-repo" }),
  ]) {
    const response = await commercialIntakeRequest(req, rt, async () => "subject", "task");
    assert.equal(response.status, 400);
  }
  const tooLarge = taskRequest("resume", { extra: "x".repeat(9000) });
  assert.equal((await commercialIntakeRequest(tooLarge, rt, async () => "subject", "task")).status, 413);
  const wrongOrigin = taskRequest("start");
  wrongOrigin.headers.set("origin", "https://evil.example");
  assert.equal((await commercialIntakeRequest(wrongOrigin, rt, async () => "subject", "task")).status, 403);
  assert.equal((await commercialIntakeRequest(taskRequest(), rt, async () => { throw new RequestIdentityError(401, "Login required."); }, "task")).status, 401);
  assert.equal((await commercialIntakeRequest(new Request("https://app.example/api/commercial-tasks?owner=owner&name=repo&taskId=bad"), rt, async () => "subject", "task")).status, 400);
  assert.deepEqual(calls, [], "Invalid requests must not invoke owner commands");
});

test("Commercial Task fails closed on a result with a different internal command identity", async () => {
  const rt = runtime();
  rt.intake.status = async () => result;
  const mismatch = await commercialIntakeRequest(taskRequest(), rt, async () => "subject", "task");
  assert.equal(mismatch.status, 503);
  const value = await mismatch.json();
  assert.equal(value.code, "UNAVAILABLE");
  assert.equal(value.stage, "status");
});
