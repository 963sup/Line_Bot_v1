import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { FileError } from "@line_bot_v1/file/domain/error";
import { type FilesWebRuntime, filesRequest } from "../src/modules/file/files-http.server";
import { RequestIdentityError } from "../src/shared/server/request-identity-error";

const baseUrl = "https://app.example/api/repository-files?owner=acme&name=Operations";
type Owner = ReturnType<FilesWebRuntime["owner"]>;
type Method = ReturnType<FilesWebRuntime["processors"]>[number];
type ProcessingOwner = ReturnType<FilesWebRuntime["processingOwner"]>;

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
const runId = randomUUID();
const ready: Awaited<ReturnType<ProcessingOwner["read"]>> = {
  revisionId: randomUUID(),
  runId,
  fileId: file.fileId,
  fileRevisionId: file.revisionId,
  repositoryId: file.repositoryId,
  state: "READY",
  version: 2,
  processorId: "plain-text",
  processorVersion: "test",
  processorKind: "parser",
  rawResult: { documentKind: "plain-text", observations: [] },
  savedResult: null,
  at: 100,
};
const processingReady: Awaited<ReturnType<ProcessingOwner["run"]>>["processing"] = {
  ...ready,
  id: ready.revisionId,
  parentRevisionId: randomUUID(),
  actorUserId: "member",
  attemptId: randomUUID(),
  fileSha256: file.sha256,
  failure: null,
  edits: [],
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
const parser: Method = {
  id: "plain-text",
  kind: "parser",
  version: "test",
  supports: (mediaType) => mediaType === "text/plain",
  async run() {
    return { documentKind: "plain-text", observations: [] };
  },
};
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
    async upload(actor, input, bytes) {
      called("upload", [actor, input, bytes]);
      return { requestId: requestIdOf(input), file };
    },
  };
  const processingOwner: ReturnType<FilesWebRuntime["processingOwner"]> = {
    async list(actor, repositoryId, fileId, after) {
      called("runs", [actor, repositoryId, fileId, after]);
      return { runs: [ready], next: null };
    },
    async read(actor, repositoryId, id, revisionId) {
      called("processing", [actor, repositoryId, id, revisionId]);
      return ready;
    },
    async run(actor, input, processor) {
      called("run", [actor, input, processor]);
      return { requestId: requestIdOf(input), processing: processingReady };
    },
    async result(actor, input) {
      called("result", [actor, input]);
      return { requestId: requestIdOf(input), processing: processingReady };
    },
  };
  const runtime: FilesWebRuntime = {
    scope: async (subject, selector) => {
      assert.equal(subject, "line-subject");
      assert.deepEqual(selector, { ownerLogin: "acme", repositoryName: "Operations" });
      return scope;
    },
    owner: () => owner,
    processors: () => [parser],
    processingOwner: () => processingOwner,
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
function uploadRequest(options: { repositoryId?: string; size?: number; name?: string } = {}) {
  const form = new FormData();
  const name = options.name ?? file.name;
  const bytes = new Uint8Array(options.size ?? 3);
  const input = new File([bytes], name, { type: "text/plain" });
  form.set(
    "command",
    JSON.stringify({
      repositoryId: options.repositoryId ?? scope.repository.id,
      fileId: file.fileId,
      requestId: randomUUID(),
      expectedVersion: 0,
      name,
      mediaType: "text/plain",
    }),
  );
  form.set("file", input, name);
  return new Request(baseUrl, {
    method: "POST",
    headers: { origin: "https://app.example" },
    body: form,
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

test("File detail, Run History and Download consume only File-owned authorized reads", async () => {
  const { calls, runtime } = fixture();
  const detail = await filesRequest(
    new Request(baseUrl + "&view=file&fileId=" + file.fileId),
    runtime,
    identity,
  );
  assert.equal(detail.status, 200);
  assert.deepEqual((await detail.json()).processors, [
    { id: "plain-text", kind: "parser", version: "test" },
  ]);
  const list = await filesRequest(
    new Request(baseUrl + "&view=runs&fileId=" + file.fileId + "&ownerKind=intelligence"),
    runtime,
    identity,
  );
  assert.equal((await list.json()).runs[0].runId, runId);
  const current = await filesRequest(
    new Request(baseUrl + "&view=processing&runId=" + runId + "&ownerKind=intelligence"),
    runtime,
    identity,
  );
  assert.equal((await current.json()).processing.state, "READY");
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
      file: async () => ({ ...file, byteLength: 3_000_001 }),
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
  assert.equal(
    calls.some((item) => item.operation === "source"),
    false,
  );
});

test("File mutation refuses foreign Repository, forged Origin and unconfigured Processor", async () => {
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

test("File Run and Result are separate intentional POST commands", async () => {
  await withOrigin(async () => {
    const { calls, runtime } = fixture();
    const runCommand = {
      repositoryId: scope.repository.id,
      fileId: file.fileId,
      fileRevisionId: file.revisionId,
      runId,
      requestId: randomUUID(),
      expectedVersion: 0,
    };
    const ran = await filesRequest(
      new Request(baseUrl + "&ownerKind=intelligence", {
        method: "POST",
        headers: { origin: "https://app.example", "content-type": "application/json" },
        body: JSON.stringify({ operation: "run", processor: "plain-text", command: runCommand }),
      }),
      runtime,
      identity,
    );
    assert.equal(ran.status, 200);
    assert.equal((await ran.json()).requestId, runCommand.requestId);
    const saveCommand = {
      repositoryId: scope.repository.id,
      runId,
      requestId: randomUUID(),
      expectedVersion: 2,
      action: "save",
      edits: [],
    };
    const saved = await filesRequest(
      new Request(baseUrl + "&ownerKind=intelligence", {
        method: "POST",
        headers: { origin: "https://app.example", "content-type": "application/json" },
        body: JSON.stringify({ operation: "result", command: saveCommand }),
      }),
      runtime,
      identity,
    );
    assert.equal(saved.status, 200);
    assert.equal((await saved.json()).requestId, saveCommand.requestId);
    assert.deepEqual(
      calls.map((call) => call.operation),
      ["run", "result"],
    );
    assert.strictEqual(calls[0]?.args[2], parser);
    assert.deepEqual(calls[1]?.args[1], saveCommand);
  });
});

test("Browser Upload accepts only bounded file bytes, matching metadata and current Repository", async () => {
  await withOrigin(async () => {
    const { calls, runtime } = fixture();
    const uploaded = await filesRequest(uploadRequest(), runtime, identity);
    assert.equal(uploaded.status, 200);
    const write = calls.find((call) => call.operation === "upload");
    assert.ok(write);
    assert.equal(write.args[0], "member");
    const command = write.args[1];
    assert.ok(command && typeof command === "object" && "repositoryId" in command);
    assert.equal(command.repositoryId, scope.repository.id);
    assert.deepEqual(write.args[2], new Uint8Array(3));

    const foreign = await filesRequest(
      uploadRequest({ repositoryId: "repository-B" }),
      runtime,
      identity,
    );
    assert.equal(foreign.status, 400);
    const oversized = await filesRequest(uploadRequest({ size: 3_000_001 }), runtime, identity);
    assert.equal(oversized.status, 413);
    assert.equal(calls.filter((call) => call.operation === "upload").length, 1);
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
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "File service is unavailable." });
});
