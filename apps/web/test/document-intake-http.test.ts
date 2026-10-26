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
      body: JSON.stringify({ repositoryId: repository.id, action: "confirm" }),
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
  assert.deepEqual(received, { repositoryId: repository.id, action: "confirm" });
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
  assert.deepEqual(await response.json(), {
    error: "採購單 AI 服務尚未設定，請聯絡系統管理員。",
    code: "UNAVAILABLE",
  });
});
