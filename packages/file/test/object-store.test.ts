import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { fileObjects } from "../src/adapters/outbound/storage/supabase.js";
import { FileError } from "../src/domain/error.js";
import { nextFileRevision } from "../src/domain/file.js";

function fixture() {
  const bytes = new TextEncoder().encode("File source: 26 SET");
  const digest = (value: Uint8Array) =>
    import("node:crypto").then(({ createHash }) =>
      createHash("sha256").update(value).digest("hex"),
    );
  return { bytes, digest };
}

test("private object upload is write-once, verifies downloaded bytes, and replay never overwrites", async () => {
  const { bytes, digest } = fixture();
  const revision = nextFileRevision(
    null,
    0,
    randomUUID(),
    {
      name: "evidence.txt",
      mediaType: "text/plain",
      byteLength: bytes.byteLength,
      sha256: await digest(bytes),
    },
    { id: randomUUID(), repositoryId: "repo-A", actorUserId: "actor", at: 1 },
  );
  const values = new Map<string, Uint8Array>();
  let uploads = 0;
  let observedKey = "";
  const bucket = {
    async download(key: string) {
      const data = values.get(key);
      return data
        ? { data: new Blob([Buffer.from(data)]), error: null }
        : { data: null, error: { status: 404 } };
    },
    async remove(keys: string[]) {
      for (const key of keys) values.delete(key);
      return { error: null };
    },
    async upload(key: string, input: Uint8Array, options: { upsert: false; contentType: string }) {
      assert.equal(options.upsert, false);
      assert.equal(options.contentType, "text/plain");
      assert.strictEqual(input, bytes, "Storage upload must reuse the verified byte view");
      uploads++;
      observedKey = key;
      if (values.has(key)) return { error: { status: 409 } };
      values.set(key, Uint8Array.from(input));
      return { error: null };
    },
  };
  const objects = fileObjects(bucket);
  await objects.putVerified(revision, bytes);
  assert.equal(uploads, 1);
  assert.equal(observedKey.split("/").length, 3);
  assert.equal(observedKey.includes("repo-A"), false);
  assert.deepEqual(await objects.readVerified(revision), bytes);
  await objects.putVerified(revision, bytes);
  assert.equal(uploads, 1);
  const wrong = Uint8Array.from(bytes);
  wrong[0] = 0;
  await assert.rejects(
    objects.putVerified(revision, wrong),
    (e: unknown) => e instanceof FileError && e.code === "UNAVAILABLE",
  );
  assert.equal(uploads, 1);
  values.set(observedKey, new TextEncoder().encode("tampered bytes!!!!"));
  await assert.rejects(
    objects.readVerified(revision),
    (e: unknown) => e instanceof FileError && e.code === "UNAVAILABLE",
  );
  await assert.rejects(objects.putVerified(revision, bytes));
  assert.equal(uploads, 1);
  await objects.removeVerified(revision);
  await assert.rejects(objects.readVerified(revision));
});

test("provider unknown result is accepted only after independent readback", async () => {
  const { bytes, digest } = fixture();
  const revision = nextFileRevision(
    null,
    0,
    randomUUID(),
    {
      name: "source.txt",
      mediaType: "text/plain",
      byteLength: bytes.byteLength,
      sha256: await digest(bytes),
    },
    { id: randomUUID(), repositoryId: "repo", actorUserId: "actor", at: 1 },
  );
  const objects = new Map<string, Uint8Array>();
  let calls = 0;
  const storage = fileObjects({
    async download(key) {
      const stored = objects.get(key);
      return stored
        ? { data: new Blob([Buffer.from(stored)]), error: null }
        : { data: null, error: { statusCode: "404" } };
    },
    async remove(keys) {
      for (const key of keys) objects.delete(key);
      throw new Error("unconfirmed provider removal");
    },
    async upload(key, data) {
      calls++;
      objects.set(key, Uint8Array.from(data));
      throw new Error("sensitive transport timeout");
    },
  });
  await storage.putVerified(revision, bytes);
  assert.equal(calls, 1);
  await storage.putVerified(revision, bytes);
  assert.equal(calls, 1);
  await storage.removeVerified(revision);
  await assert.rejects(storage.readVerified(revision));
  const failed = fileObjects({
    async download() {
      return { data: null, error: { status: 503 } };
    },
    async upload() {
      assert.fail("unavailable read must not attempt upload");
    },
    async remove() {
      throw new Error("sensitive provider removal failure");
    },
  });
  await assert.rejects(
    failed.removeVerified(revision),
    (error: unknown) =>
      error instanceof Error && error.message === "sensitive provider removal failure",
  );
  await assert.rejects(failed.putVerified(revision, bytes), (error: unknown) => {
    assert.deepEqual(error, { status: 503 });
    return true;
  });
});

test("signed uploads issue write-once private-object tickets without a readback or upload", async () => {
  const { bytes, digest } = fixture();
  const revision = nextFileRevision(
    null,
    0,
    randomUUID(),
    {
      name: "source.txt",
      mediaType: "text/plain",
      byteLength: bytes.byteLength,
      sha256: await digest(bytes),
    },
    { id: randomUUID(), repositoryId: "repo-A", actorUserId: "actor", at: 1 },
  );
  let calls = 0;
  const objects = fileObjects({
    async createSignedUploadUrl(path, options) {
      calls++;
      assert.equal(options.upsert, false);
      assert.equal(path.split("/").length, 3);
      assert.equal(path.includes("repo-A"), false);
      return {
        data: {
          signedUrl: `https://test.supabase.co/storage/v1/object/upload/sign/repository-files/${path}?token=opaque`,
        },
        error: null,
      };
    },
    async download() {
      assert.fail("Signing must not load object bytes");
    },
    async upload() {
      assert.fail("Signing must not upload server bytes");
    },
    async remove() {
      assert.fail("Signing must not delete objects");
    },
  });
  assert.ok(objects.signUpload);
  const ticket = await objects.signUpload(revision);
  assert.match(ticket, /^https:\/\/test\.supabase\.co\/storage\/v1\/object\/upload\/sign\//);
  assert.equal(calls, 1);
});

test("signed upload refuses untrusted or unsigned provider destinations", async () => {
  const { bytes, digest } = fixture();
  const revision = nextFileRevision(
    null,
    0,
    randomUUID(),
    {
      name: "source.txt",
      mediaType: "text/plain",
      byteLength: bytes.byteLength,
      sha256: await digest(bytes),
    },
    { id: randomUUID(), repositoryId: "repo", actorUserId: "actor", at: 1 },
  );
  const bucket = (signedUrl: string) =>
    fileObjects({
      async createSignedUploadUrl() {
        return { data: { signedUrl }, error: null };
      },
      async download() {
        assert.fail("Unexpected read");
      },
      async upload() {
        assert.fail("Unexpected upload");
      },
      async remove() {
        assert.fail("Unexpected remove");
      },
    });
  const unsafe = bucket("https://evil.example/steal?token=abc");
  assert.ok(unsafe.signUpload);
  await assert.rejects(unsafe.signUpload(revision), {
    code: "UNAVAILABLE",
  });
  const unsigned = bucket(
    "https://test.supabase.co/storage/v1/object/upload/sign/repository-files/key",
  );
  assert.ok(unsigned.signUpload);
  await assert.rejects(unsigned.signUpload(revision), {
    code: "UNAVAILABLE",
  });
});
