import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import { uploadSelectedFile } from "../src/modules/file/signed-file-upload";
import type { FileMutation, Pending } from "../src/modules/file/files-projection";

const binary = new TextEncoder().encode("original File source");
const digest = createHash("sha256").update(binary).digest("hex");
function fixture() {
  const command = {
    repositoryId: "repo",
    fileId: randomUUID(),
    requestId: randomUUID(),
    expectedVersion: 0,
    name: "source.txt",
    mediaType: "text/plain",
  };
  const next: Pending = {
    command,
    file: new File([binary], command.name, { type: command.mediaType }),
  };
  const revisionId = randomUUID();
  const signedUrl =
    `https://test.supabase.co/storage/v1/object/upload/sign/repository-files/hash/${command.fileId}/${revisionId}?token=opaque`;
  const file = {
    repositoryId: command.repositoryId,
    fileId: command.fileId,
    revisionId,
    version: 1,
    parentRevisionId: null,
    actorUserId: "owner",
    at: 1,
    name: command.name,
    mediaType: command.mediaType,
    byteLength: binary.byteLength,
    sha256: digest,
  };
  return { next, command, revisionId, signedUrl, file };
}

test("File signed upload sends original binary only to pinned Storage URL and finalizes exact request", async () => {
  const { next, command, revisionId, signedUrl, file } = fixture();
  const operations: string[] = [];
  const result = await uploadSelectedFile(
    next,
    async ({ operation, command: payload }: FileMutation) => {
      operations.push(operation);
      assert.equal(payload.requestId, command.requestId);
      assert.equal(payload.sha256, digest);
      assert.equal(payload.byteLength, binary.byteLength);
      return operation === "prepare-upload"
        ? { requestId: command.requestId, revisionId, signedUrl }
        : { requestId: command.requestId, file };
    },
    () => {},
    async (url, init) => {
      operations.push("PUT");
      assert.equal(String(url), signedUrl);
      assert.equal(init?.method, "PUT");
      assert.equal(new Headers(init?.headers).get("x-upsert"), "false");
      assert.ok(init?.body instanceof FormData);
      const data = init.body.get("");
      assert.ok(data instanceof File);
      assert.deepEqual(new Uint8Array(await data.arrayBuffer()), binary);
      return new Response(null, { status: 200 });
    },
  );
  assert.deepEqual(operations, ["prepare-upload", "PUT", "complete-upload"]);
  assert.deepEqual(result.file, file);
});

test("File upload refuses signed tickets to another revision or origin before transmitting bytes", async () => {
  const { next, command, revisionId, signedUrl } = fixture();
  let used = false;
  for (const url of [
    signedUrl.replace(revisionId, randomUUID()),
    signedUrl.replace("test.supabase.co", "evil.example"),
  ]) {
    await assert.rejects(uploadSelectedFile(
      next,
      async ({ operation }: FileMutation) => {
        assert.equal(operation, "prepare-upload");
        return { requestId: command.requestId, revisionId, signedUrl: url };
      },
      () => {},
      async () => { used = true; return new Response(null, { status: 200 }); },
    ), /Storage ticket is invalid/);
  }
  assert.equal(used, false);
});

test("unknown PUT transport results still reconcile with File owner using same request identity", async () => {
  const { next, command, revisionId, signedUrl, file } = fixture();
  const actions: string[] = [];
  const result = await uploadSelectedFile(
    next,
    async ({ operation, command: payload }: FileMutation) => {
      actions.push(operation);
      assert.equal(payload.requestId, command.requestId);
      return operation === "prepare-upload"
        ? { requestId: command.requestId, revisionId, signedUrl }
        : { requestId: command.requestId, file };
    },
    () => {},
    async () => { throw new Error("lost provider acknowledgement"); },
  );
  assert.deepEqual(actions, ["prepare-upload", "complete-upload"]);
  assert.deepEqual(result.file, file);
});
