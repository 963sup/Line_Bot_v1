import assert from "node:assert/strict";
import { test } from "node:test";
import type { DocumentReceipt } from "@line_bot_v1/contract/contracts/input/document-intake";
import type { DocumentIntakeWebRuntime } from "../src/modules/document-intake/document-intake-http.server";
import { documentIntakeRequest } from "../src/modules/document-intake/document-intake-http.server";

const repository = { id: "repository-1", ownerLogin: "owner", name: "repo" };
process.env.APP_ORIGIN = "https://app.example";

function runtime(
  submit: (actor: string, value: unknown) => Promise<DocumentReceipt>,
): DocumentIntakeWebRuntime {
  return {
    scope: async () => ({
      actorUserId: "user-1",
      repository,
      archived: false,
      canEdit: true,
      canManage: false,
    }),
    intake: null,
    documents: {
      read: async () => {
        throw new Error("unused");
      },
      receipt: async () => {
        throw new Error("unused");
      },
      submit,
    },
  };
}

test("ContractDocument review command is forwarded to Contract after scope checks", async () => {
  let received: unknown;
  const request = new Request(
    "https://app.example/api/repository-document-intake?owner=owner&name=repo&operation=contract&documentId=document-1",
    {
      method: "POST",
      headers: { origin: "https://app.example", "content-type": "application/json" },
      body: JSON.stringify({
        repositoryId: repository.id,
        documentId: "document-1",
        action: "confirm",
      }),
    },
  );
  const response = await documentIntakeRequest(
    request,
    runtime(async (_actor, value) => {
      received = value;
      return {
        requestId: "request-1",
        repositoryId: repository.id,
        documentId: "document-1",
        revisionId: "revision-2",
        version: 2,
        fingerprint: "e".repeat(64),
        intentFingerprint: "f".repeat(64),
        source: {
          fileId: "file-1",
          fileRevisionId: "file-revision-1",
          fileSha256: "a".repeat(64),
        },
      };
    }),
    async () => "user-1",
  );

  assert.equal(response.status, 200);
  assert.deepEqual(received, {
    repositoryId: repository.id,
    documentId: "document-1",
    action: "confirm",
  });
});

test("missing intake runtime is reported as an unavailable service, not invalid input", async () => {
  const request = new Request(
    "https://app.example/api/repository-document-intake?owner=owner&name=repo&operation=intake",
    {
      method: "POST",
      headers: { origin: "https://app.example", "content-type": "application/json" },
      body: JSON.stringify({}),
    },
  );
  const response = await documentIntakeRequest(
    request,
    {
      scope: async () => ({
        actorUserId: "user-1",
        repository,
        archived: false,
        canEdit: true,
        canManage: false,
      }),
      intake: null,
      documents: null,
    },
    async () => "user-1",
  );

  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.error, "採購單 AI 服務尚未設定，請聯絡系統管理員。");
  assert.equal(body.code, "UNAVAILABLE");
  assert.equal(body.stage, "request");
  assert.match(body.traceId, /^[a-f0-9-]{36}$/);
});

test("unknown intake failures are redacted and correlated", async () => {
  const request = new Request(
    "https://app.example/api/repository-document-intake?owner=owner&name=repo&operation=intake",
    {
      method: "POST",
      headers: { origin: "https://app.example", "content-type": "application/json" },
      body: JSON.stringify({
        action: "save",
        repositoryId: repository.id,
        documentId: "document-1",
        requestId: "request-1",
        expectedVersion: 1,
        source: {
          fileId: "file-1",
          fileRevisionId: "revision-1",
          fileSha256: "a".repeat(64),
        },
      }),
    },
  );
  const response = await documentIntakeRequest(
    request,
    {
      scope: async () => ({
        actorUserId: "user-1",
        repository,
        archived: false,
        canEdit: true,
        canManage: false,
      }),
      intake: async () => {
        throw new Error("Gateway rejected model openai/gpt-5.2: unsupported file input");
      },
      documents: null,
    },
    async () => "user-1",
  );

  assert.equal(response.status, 500);
  const body = await response.json();
  assert.equal(body.code, "DOCUMENT_INTAKE_FAILED");
  assert.equal(body.stage, "intake");
  assert.match(body.traceId, /^[a-f0-9-]{36}$/);
  assert.equal(JSON.stringify(body).includes("Gateway rejected"), false);
});

test("review rejects a document ID different from its URL before submitting", async () => {
  let submitted = false;
  const response = await documentIntakeRequest(
    new Request(
      "https://app.example/api/repository-document-intake?owner=owner&name=repo&operation=contract&documentId=document-1",
      {
        method: "POST",
        headers: { origin: "https://app.example", "content-type": "application/json" },
        body: JSON.stringify({
          repositoryId: repository.id,
          documentId: "document-2",
          action: "confirm",
        }),
      },
    ),
    runtime(async () => {
      submitted = true;
      throw new Error("must not submit");
    }),
    async () => "user-1",
  );
  assert.equal(response.status, 400);
  assert.equal(submitted, false);
});

test("saved documents remain readable without an extraction service", async () => {
  const service = runtime(async () => {
    throw new Error("must not submit");
  });
  let reads = 0;
  assert.ok(service.documents);
  service.documents.read = async (actor, query) => {
    assert.equal(actor, "user-1");
    assert.equal(query.documentId, "document-1");
    reads++;
    throw new (await import("@line_bot_v1/contract/domain/error")).ContractError(
      404,
      "Missing document",
      "NOT_FOUND",
    );
  };
  const response = await documentIntakeRequest(
    new Request(
      "https://app.example/api/repository-document-intake?owner=owner&name=repo&operation=read&documentId=document-1",
    ),
    service,
    async () => "user-1",
  );
  assert.equal(response.status, 404);
  assert.equal(reads, 1);
});

test("archived repositories reject intake before invoking extraction", async () => {
  const service = runtime(async () => {
    throw new Error("must not submit");
  });
  service.scope = async () => ({
    actorUserId: "user-1",
    repository,
    archived: true,
    canEdit: true,
    canManage: false,
  });
  let extracted = false;
  service.intake = async () => {
    extracted = true;
    throw new Error("must not extract");
  };
  const response = await documentIntakeRequest(
    new Request(
      "https://app.example/api/repository-document-intake?owner=owner&name=repo&operation=intake",
      {
        method: "POST",
        headers: { origin: "https://app.example", "content-type": "application/json" },
        body: "{}",
      },
    ),
    service,
    async () => "user-1",
  );
  assert.equal(response.status, 403);
  assert.equal(extracted, false);
});

test("save failures report the last request-local stage and classify only known connection failures", async () => {
  for (const [cause, status] of [
    [new TypeError("private SQL payload"), 500],
    [Object.assign(new Error("private connection"), { code: "08006" }), 503],
  ] as const) {
    const configured = runtime(async () => {
      throw new Error("unused");
    });
    configured.intake = async (_actor, _command, onStage) => {
      onStage?.("target.submit");
      throw cause;
    };
    const response = await documentIntakeRequest(
      new Request(
        "https://app.example/api/repository-document-intake?owner=owner&name=repo&operation=intake",
        {
          method: "POST",
          headers: { origin: "https://app.example", "content-type": "application/json" },
          body: JSON.stringify({
            action: "save",
            repositoryId: repository.id,
            documentId: "doc",
            requestId: "request",
            expectedVersion: 0,
            source: { fileId: "file", fileRevisionId: "revision", fileSha256: "a".repeat(64) },
          }),
        },
      ),
      configured,
      async () => "user-1",
    );
    const body = await response.json();
    assert.equal(response.status, status);
    assert.equal(body.stage, "target.submit");
    assert.equal(body.code, status === 503 ? "PERSISTENCE_UNAVAILABLE" : "CONTRACT_SAVE_FAILED");
    assert.match(body.error, /保存結果待確認/);
    assert.equal(JSON.stringify(body).includes("private"), false);
  }
});

test("concurrent intake requests keep independent failure stages and trace IDs", async () => {
  const release = Promise.withResolvers<void>();
  const configured = runtime(async () => {
    throw new Error("unused");
  });
  configured.intake = async (_actor, command, onStage) => {
    if (command.requestId === "first") {
      onStage?.("intelligence.extract");
      await release.promise;
    } else {
      onStage?.("target.submit");
      release.resolve();
    }
    throw new Error("private failure");
  };
  const execute = (requestId: string) =>
    documentIntakeRequest(
      new Request(
        "https://app.example/api/repository-document-intake?owner=owner&name=repo&operation=intake",
        {
          method: "POST",
          headers: { origin: "https://app.example", "content-type": "application/json" },
          body: JSON.stringify({
            action: "save",
            repositoryId: repository.id,
            documentId: "doc",
            requestId,
            expectedVersion: 0,
            source: { fileId: "file", fileRevisionId: "revision", fileSha256: "a".repeat(64) },
          }),
        },
      ),
      configured,
      async () => "user-1",
    );
  const responses = await Promise.all([execute("first"), execute("second")]);
  const [first, second] = await Promise.all(responses.map((response) => response.json()));
  assert.equal(first.stage, "intelligence.extract");
  assert.equal(first.code, "EXTRACTION_FAILED");
  assert.equal(second.stage, "target.submit");
  assert.equal(second.code, "CONTRACT_SAVE_FAILED");
  assert.notEqual(first.traceId, second.traceId);
});
