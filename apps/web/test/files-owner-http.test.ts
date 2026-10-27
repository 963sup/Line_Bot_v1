import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { FileError } from "@line_bot_v1/file/domain/error";
import { type FilesWebRuntime, filesRequest } from "../src/modules/file/files-http.server";
import { RequestIdentityError } from "../src/shared/server/request-identity-error";

const baseUrl = "https://app.example/api/repository-files?owner=acme&name=Operations";
type Owner = ReturnType<FilesWebRuntime["owner"]>;

const file: Awaited<ReturnType<Owner["file"]>> = {
  repositoryId: "repository-A",
  fileId: randomUUID(),
  revisionId: randomUUID(),
  version: 1,
  parentRevisionId: null,
  actorUserId: "member",
  at: 100,
  name: "evidence.txt",
  mediaType: "text/plain",
  byteLength: 3,
  sha256: "0".repeat(64),
};
const scope = {
  actorUserId: "member",
  repository: { id: "repository-A", ownerLogin: "acme", name: "Operations" },
  archived: false,
  canEdit: true,
  canManage: false,
};
function requestIdOf(value: unknown): string {
  if (
    !value ||
    typeof value !== "object" ||
    !("requestId" in value) ||
    typeof value.requestId !== "string"
  )
    throw new Error("Unexpected command input.");
  return value.requestId;
}
function fixture() {
  const calls: Array<{ operation: string; args: unknown[] }> = [];
  const called = (operation: string, args: unknown[]) => {
    calls.push({ operation, args });
  };
  const owner: Owner = {
    async list(actor, scope, after) {
      called("list", [actor, scope, after]);
      return { files: [file], next: null };
    },
    async pendingUploads(actor, scope, after) {
      called("uploads", [actor, scope, after]);
      return {
        uploads: [
          {
            requestId: randomUUID(),
            fileId: file.fileId,
            revisionId: file.revisionId,
            expectedVersion: 0,
            name: file.name,
            mediaType: file.mediaType,
            byteLength: file.byteLength,
            sha256: file.sha256,
          },
        ],
        next: null,
      };
    },
    async file(actor, scope, fileId, revisionId) {
      called("file", [actor, scope, fileId, revisionId]);
      return file;
    },
    async source(actor, scope, fileId, revisionId) {
      called("source", [actor, scope, fileId, revisionId]);
      return { file, bytes: Uint8Array.from([1, 2, 3]) };
    },
    async prepareUpload(actor, input) {
      called("prepare", [actor, input]);
      return { requestId: requestIdOf(input), revisionId: file.revisionId,
        signedUrl: "https://test.supabase.co/storage/v1/object/upload/sign/repository-files/key?token=secret" };
    },
    async completeUpload(actor, input) {
      called("complete", [actor, input]);
      return { requestId: requestIdOf(input), file };
    },
    async upload(actor, input, bytes) {
      called("upload", [actor, input, bytes]);
      return { requestId: requestIdOf(input), file };
    },
  };
  const runtime: FilesWebRuntime = {
    scope: async (subject, selector) => {
      assert.equal(subject, "line-subject");
      assert.deepEqual(selector, { ownerLogin: "acme", repositoryName: "Operations" });
      return scope;
    },
    owner: () => owner,
  };
  return { calls, runtime };
}
async function withOrigin<T>(work: () => Promise<T>) {
  const old = process.env.APP_ORIGIN;
  process.env.APP_ORIGIN = "https://app.example";
  try {
    return await work();
  } finally {
    if (old === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = old;
  }
}
const identity = async () => "line-subject";
function post(body: object, origin = "https://app.example") {
  return new Request(baseUrl, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("File List is authenticated and always resolves Repository rather than a global collection", async () => {
  const { calls, runtime } = fixture();
  const unauthenticated = await filesRequest(new Request(baseUrl), runtime, async () => {
    throw new RequestIdentityError(401, "sign in");
  });
  assert.equal(unauthenticated.status, 401);
  assert.equal(calls.length, 0);
  const response = await filesRequest(new Request(baseUrl), runtime, identity);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.repository.id, scope.repository.id);
  assert.equal(result.files[0].fileId, file.fileId);
  assert.equal(result.uploadMaxBytes, 3_000_000);
  assert.deepEqual(calls[0], {
    operation: "list",
    args: ["member", scope.repository.id, undefined],
  });
});

test("Pending Uploads are explicit, actor-scoped owner reads, never exposed by File List", async () => {
  const { calls, runtime } = fixture();
  const response = await filesRequest(new Request(baseUrl + "&view=uploads"), runtime, identity);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.uploads.length, 1);
  assert.equal(body.uploads[0].fileId, file.fileId);
  assert.deepEqual(calls, [
    { operation: "uploads", args: ["member", scope.repository.id, undefined] },
  ]);
  assert.equal(body.uploads[0].sha256, file.sha256);
});

test("File detail and Download consume only File-owned authorized reads", async () => {
  const { calls, runtime } = fixture();
  const detail = await filesRequest(
    new Request(baseUrl + "&view=file&fileId=" + file.fileId),
    runtime,
    identity,
  );
  assert.equal(detail.status, 200);
  assert.equal((await detail.json()).processing, null);
  const download = await filesRequest(
    new Request(
      baseUrl + "&view=download&fileId=" + file.fileId + "&revisionId=" + file.revisionId,
    ),
    runtime,
    identity,
  );
  assert.equal(download.status, 200);
  assert.equal(download.headers.get("Cache-Control"), "private, no-store");
  assert.equal(download.headers.get("Content-Type"), "application/octet-stream");
  assert.deepEqual(new Uint8Array(await download.arrayBuffer()), Uint8Array.from([1, 2, 3]));
  assert.ok(calls.every((item) => item.args[1] === scope.repository.id));
  assert.equal(
    calls.some((item) => item.operation === "upload" || item.operation === "run"),
    false,
  );
});

test("Browser download refuses large response bodies before fetching private source bytes", async () => {
  const { calls, runtime } = fixture();
  const oversized: FilesWebRuntime = {
    ...runtime,
    owner: () => ({
      ...runtime.owner(),
      source: async (...args) => {
        calls.push({ operation: "bounded-source", args });
        throw new FileError(413, "File is too large for this transport.", "INVALID_INPUT");
      },
    }),
  };
  const response = await filesRequest(
    new Request(
      baseUrl + "&view=download&fileId=" + file.fileId + "&revisionId=" + file.revisionId,
    ),
    oversized,
    identity,
  );
  assert.equal(response.status, 413);
  assert.equal(calls.find((item) => item.operation === "bounded-source")?.args[4], 3_000_000);
});

test("File mutation refuses foreign Repository, forged Origin and processing commands", async () => {
  await withOrigin(async () => {
    const { calls, runtime } = fixture();
    let scopes = 0;
    const checked: FilesWebRuntime = {
      ...runtime,
      scope: async (...args) => {
        scopes++;
        return runtime.scope(...args);
      },
    };
    const invalidOrigin = await filesRequest(
      post(
        { operation: "result", command: { repositoryId: scope.repository.id } },
        "https://evil.example",
      ),
      checked,
      identity,
    );
    assert.equal(invalidOrigin.status, 403);
    assert.equal(scopes, 0);
    const wrong = await filesRequest(
      post({
        operation: "run",
        processor: "plain-text",
        command: { repositoryId: "repository-B" },
      }),
      checked,
      identity,
    );
    assert.equal(wrong.status, 400);
    const missing = await filesRequest(
      post({ operation: "run", processor: "ocr", command: { repositoryId: scope.repository.id } }),
      checked,
      identity,
    );
    assert.equal(missing.status, 400);
    assert.equal(calls.length, 0);
  });
});

test("File rejects Intelligence processing commands at the File boundary", async () => {
  await withOrigin(async () => {
    const { calls, runtime } = fixture();
    for (const operation of ["run", "result"]) {
      const response = await filesRequest(
        post({ operation, command: { repositoryId: scope.repository.id } }),
        runtime,
        identity,
      );
      assert.equal(response.status, 400);
      assert.match((await response.json()).error, /Intelligence/);
    }
    assert.deepEqual(calls, []);
  });
});

test("legacy multipart route is disabled; only bounded JSON signed commands are accepted", async () => {
  await withOrigin(async () => {
    const { calls, runtime } = fixture();
    const response = await filesRequest(new Request(baseUrl, {
      method: "POST", headers: { origin: "https://app.example" },
      body: new FormData(),
    }), runtime, identity);
    assert.equal(response.status, 415);
    assert.deepEqual(calls, []);
  });
});


test("Signed upload uses authenticated JSON commands and never transfers Binary through API", async () => {
  await withOrigin(async () => {
    const { calls, runtime } = fixture();
    const command = {
      repositoryId: scope.repository.id, fileId: file.fileId,
      requestId: randomUUID(), expectedVersion: 0,
      name: file.name, mediaType: file.mediaType, byteLength: 3,
      sha256: "a".repeat(64),
    };
    const prepared = await filesRequest(post({ operation: "prepare-upload", command }), runtime, identity);
    assert.equal(prepared.status, 200);
    const ticket = await prepared.json();
    assert.equal(ticket.requestId, command.requestId);
    assert.match(ticket.signedUrl, /storage\\/v1\\/object\\/upload\\/sign/);
    const completed = await filesRequest(post({ operation: "complete-upload", command }), runtime, identity);
    assert.equal(completed.status, 200);
    assert.equal((await completed.json()).file.revisionId, file.revisionId);
    assert.deepEqual(calls.map((item) => item.operation), ["prepare", "complete"]);
    const tooLarge = await filesRequest(post({ operation: "prepare-upload", command: {
      ...command, byteLength: 3_000_001,
    } }), runtime, identity);
    assert.equal(tooLarge.status, 413);
    const foreign = await filesRequest(post({ operation: "prepare-upload", command: {
      ...command, repositoryId: "another",
    } }), runtime, identity);
    assert.equal(foreign.status, 400);
    assert.equal(calls.length, 2);
  });
});

test("File owner errors and infrastructure failure never become empty authorized File Lists", async () => {
  const { runtime } = fixture();
  const forbidden: FilesWebRuntime = {
    ...runtime,
    owner: () => ({
      ...runtime.owner(),
      list: async () => {
        throw new FileError(403, "File access denied.", "FORBIDDEN");
      },
    }),
  };
  const denied = await filesRequest(new Request(baseUrl), forbidden, identity);
  assert.equal(denied.status, 403);
  assert.equal((await denied.json()).code, "FORBIDDEN");
  const unavailable: FilesWebRuntime = {
    ...runtime,
    owner: () => ({
      ...runtime.owner(),
      list: async () => {
        throw new Error("sensitive database message");
      },
    }),
  };
  const response = await filesRequest(new Request(baseUrl), unavailable, identity);
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "sensitive database message" });
});
