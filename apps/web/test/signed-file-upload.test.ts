import assert from "node:assert/strict";
import test from "node:test";
import { uploadSelectedFile } from "../src/modules/file/signed-file-upload";

test("a hosted browser refuses local, credentialed, unsigned and wrong-revision tickets before sending bytes", async (t) => {
  const revisionId = "00000000-0000-4000-8000-000000000001";
  const path = `/storage/v1/object/upload/sign/repository-files/repo/file/${revisionId}`;
  const command = {
    repositoryId: "repo",
    fileId: "file",
    requestId: "request",
    expectedVersion: 0,
    name: "source.txt",
    mediaType: "text/plain",
  };
  t.mock.method(globalThis, "fetch", () => assert.fail("Unsafe destination received bytes"));
  for (const signedUrl of [
    `http://127.0.0.1:54321${path}?token=opaque`,
    `https://user@test.supabase.co${path}?token=opaque`,
    `https://test.supabase.co${path}?token=`,
    `https://test.supabase.co${path}/wrong?token=opaque`,
    `https://evil.example${path}?token=opaque`,
  ]) {
    await assert.rejects(
      uploadSelectedFile(
        { command, file: new File(["original"], command.name) },
        async () => ({ requestId: command.requestId, revisionId, signedUrl }),
        () => {},
      ),
      /Storage ticket is invalid/,
    );
  }
});

test("a local browser uploads directly to local Storage and finalizes the exact command", async (t) => {
  const revisionId = "00000000-0000-4000-8000-000000000001";
  const command = {
    repositoryId: "repo",
    fileId: "file",
    requestId: "request",
    expectedVersion: 0,
    name: "source.txt",
    mediaType: "text/plain",
  };
  const file = new File(["original"], command.name, { type: command.mediaType });
  const originalLocation = Object.getOwnPropertyDescriptor(globalThis, "location");
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: new URL("http://localhost:3000"),
  });
  t.after(() => {
    if (originalLocation) Object.defineProperty(globalThis, "location", originalLocation);
    else Reflect.deleteProperty(globalThis, "location");
  });
  let transfers = 0;
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    transfers++;
    assert.match(url, /^http:\/\/127\.0\.0\.1:54321\//);
    assert.equal(init.method, "PUT");
    assert.equal(new Headers(init.headers).get("x-upsert"), "false");
    assert.ok(init.body instanceof FormData);
    const selected = init.body.get("");
    assert.ok(selected instanceof File);
    assert.equal(await selected.text(), "original");
    return new Response(null, { status: 200 });
  });
  let prepared: unknown;
  const result = await uploadSelectedFile(
    { command, file },
    async (mutation) => {
      if (mutation.operation === "prepare-upload") {
        prepared = mutation.command;
        return {
          requestId: command.requestId,
          revisionId,
          signedUrl: `http://127.0.0.1:54321/storage/v1/object/upload/sign/repository-files/repo/file/${revisionId}?token=opaque`,
        };
      }
      assert.deepEqual(mutation.command, prepared);
      return {
        requestId: command.requestId,
        file: { ...mutation.command, revisionId, version: 1 },
      };
    },
    () => {},
  );
  assert.equal(result.file.version, 1);
  assert.equal(transfers, 1);
});
