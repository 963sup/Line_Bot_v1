import assert from "node:assert/strict";
import test from "node:test";
import { createFileSourceReader } from "../src/application/use-cases/sources.js";
import { FileError } from "../src/domain/error.js";
import type { FileRevision } from "../src/domain/file.js";

const revision: FileRevision = {
  id: "10000000-0000-4000-8000-000000000001",
  fileId: "10000000-0000-4000-8000-000000000002",
  repositoryId: "repo",
  version: 1,
  parentRevisionId: null,
  actorUserId: "owner",
  at: 1,
  name: "document.pdf",
  mediaType: "application/pdf",
  byteLength: 3,
  sha256: "a".repeat(64),
};
const source = { fileId: revision.fileId, fileRevisionId: revision.id };

test("source reader preserves the requested immutable revision and detaches original bytes", async () => {
  const calls: string[] = [];
  const stored = Uint8Array.of(1, 2, 3);
  const reader = createFileSourceReader({
    reads: {
      async authorize(actor, repositoryId) {
        assert.equal(actor, "owner");
        assert.equal(repositoryId, "repo");
        calls.push("authorize");
      },
      async file(actor, repositoryId, fileId, revisionId) {
        calls.push("qualify");
        assert.equal(actor, "owner");
        assert.equal(repositoryId, "repo");
        assert.equal(fileId, revision.fileId);
        assert.equal(revisionId, revision.id);
        return revision;
      },
    },
    objects: () => ({
      async readVerified(selected) {
        calls.push("object");
        assert.equal(selected.id, revision.id);
        return stored;
      },
      async putVerified() {
        assert.fail("A source read must not upload");
      },
    }),
  });
  const result = await reader.read("owner", "repo", source);
  assert.deepEqual(calls, ["qualify", "object", "authorize"]);
  result.bytes[0] = 9;
  assert.equal(stored[0], 1);
});

test("revocation during object read prevents bytes from reaching a downstream consumer", async () => {
  let revoked = false;
  const reader = createFileSourceReader({
    reads: {
      async authorize() {
        if (revoked) throw new FileError(403, "Revoked", "FORBIDDEN");
      },
      async file() {
        if (revoked) throw new FileError(403, "Revoked", "FORBIDDEN");
        return revision;
      },
    },
    objects: () => ({
      async readVerified() {
        revoked = true;
        return Uint8Array.of(1, 2, 3);
      },
      async putVerified() {
        assert.fail("Unexpected write");
      },
    }),
  });
  await assert.rejects(reader.read("owner", "repo", source), {
    code: "FORBIDDEN",
  });
});

test("bounded Web source rejects large bytes before object I/O without weakening File authorization", async () => {
  const calls: string[] = [];
  const reader = createFileSourceReader({
    reads: {
      async authorize() {
        assert.fail("Oversized source must not reach Storage I/O");
      },
      async file() {
        calls.push("authorize");
        return { ...revision, byteLength: 3_000_001 };
      },
    },
    objects: () => ({
      async readVerified() {
        assert.fail("Storage read must not occur");
      },
      async putVerified() {
        assert.fail("Unexpected upload");
      },
    }),
  });
  await assert.rejects(reader.read("owner", "repo", source, 3_000_000), { status: 413 });
  assert.deepEqual(calls, ["authorize"]);
});
