import assert from "node:assert/strict";
import { test } from "node:test";
import { parseFile, parseMutation, parsePendingPage } from "../src/contracts/parse-files.js";

test("File projections retain revision/request identities and reject malformed pending readback", () => {
  const file = {
    repositoryId: "repo",
    fileId: "file",
    revisionId: "revision",
    version: 1,
    name: "purchase.pdf",
    mediaType: "application/pdf",
    byteLength: 3,
    sha256: "hash",
  };
  assert.deepEqual(parseMutation({ requestId: "request", file }), { requestId: "request", file });
  assert.throws(() => parseFile({ ...file, byteLength: -1 }));
  assert.throws(() => parseFile({ ...file, version: 1.5 }));
  assert.deepEqual(parsePendingPage({ uploads: [], next: null }), { uploads: [], next: null });
  assert.throws(() => parsePendingPage({ uploads: [], next: 3 }));
});
