import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseDocumentIntakeReceipt,
  parseDocumentIntakeRevision,
} from "../src/contracts/output/parse-document-intake.js";

test("Contract intake decoder preserves exact immutable source and replay receipt", () => {
  const receipt = {
    requestId: "request",
    documentId: "document",
    revisionId: "revision",
    version: 2,
    intentFingerprint: "fingerprint",
  };
  assert.deepEqual(parseDocumentIntakeReceipt(receipt), receipt);
  const source = { fileId: "file", fileRevisionId: "file-revision", fileSha256: "hash" };
  const revision = {
    documentId: "document",
    id: "revision",
    version: 2,
    state: "DRAFT",
    source,
    candidate: {},
    diagnostics: ["MISSING_REQUIRED_FACT"],
  };
  assert.equal(parseDocumentIntakeRevision(revision).revisionId, "revision");
  assert.deepEqual(parseDocumentIntakeRevision(revision).source, source);
  assert.throws(() => parseDocumentIntakeRevision({ ...revision, state: "ACTIVE" }));
  assert.throws(() => parseDocumentIntakeReceipt({ ...receipt, intentFingerprint: null }));
});
