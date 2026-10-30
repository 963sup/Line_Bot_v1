import assert from "node:assert/strict";
import test from "node:test";
import {
  commercialStatus,
  newCommercialIntake,
  restoreCommercialIntake,
  type LegacyCommercialIntake,
} from "../src/modules/file/commercial-intake-state";
import { createFileRequests } from "../src/modules/file/file-requests";
import { StaleRequest } from "../src/modules/file/files-projection";

const file = {
  repositoryId: crypto.randomUUID(),
  fileId: crypto.randomUUID(),
  revisionId: crypto.randomUUID(),
  sha256: "a".repeat(64),
  name: "private source name",
  mediaType: "application/pdf",
  byteLength: 100,
  version: 1,
};
function legacyPending(): LegacyCommercialIntake {
  return {
    commandId: crypto.randomUUID(), repositoryId: file.repositoryId,
    source: { fileId: file.fileId, fileRevisionId: file.revisionId, sha256: file.sha256 },
    target: { documentId: crypto.randomUUID(), draftCommandId: crypto.randomUUID(), expectedDocumentVersion: 0 },
  };
}

test("task reload keeps exact File pins and historical commands still restore", () => {
  const pending = newCommercialIntake(file);
  const serialized = JSON.stringify(pending);
  assert.deepEqual(Object.keys(pending).sort(), ["repositoryId", "source", "taskId"]);
  assert.doesNotMatch(serialized, /private source name|application\/pdf|draftCommandId|documentId/);
  assert.deepEqual(restoreCommercialIntake(serialized, file.repositoryId), pending);
  assert.equal(restoreCommercialIntake(serialized, crypto.randomUUID()), null);
  assert.equal(restoreCommercialIntake("broken", file.repositoryId), null);
  const documentId = crypto.randomUUID();
  assert.equal(commercialStatus({ state: "RESULT_READY", taskId: pending.taskId, documentId }, pending), "RESULT_READY");
  assert.throws(() => commercialStatus({ state: "DRAFT_SAVED", taskId: crypto.randomUUID(), documentId }, pending));
  const legacy = legacyPending();
  assert.deepEqual(restoreCommercialIntake(JSON.stringify(legacy), file.repositoryId), legacy);
  assert.equal(commercialStatus({ state: "OUTCOME_UNKNOWN", commandId: legacy.commandId, documentId: legacy.target.documentId }, legacy), "OUTCOME_UNKNOWN");
  assert.throws(() => commercialStatus({ state: "DRAFT_SAVED", commandId: "other", documentId: legacy.target.documentId }, legacy));
});

test("browser status is GET and explicit resume uses original identity on the new endpoint", async (t) => {
  const pending = legacyPending();
  const calls: { url: URL; init: RequestInit }[] = [];
  t.mock.method(globalThis, "fetch", async (input: string, init: RequestInit) => {
    calls.push({ url: new URL(input, "https://app.example"), init });
    return Response.json({
      state: "RESULT_READY",
      commandId: pending.commandId,
      documentId: pending.target.documentId,
    });
  });
  const client = createFileRequests({
    ownerLogin: "owner",
    repositoryName: "repo",
    epoch: { current: 0 },
    session: async () => "session",
    onDenied() {},
  });
  await client.commercialIntake({ commandId: pending.commandId });
  await client.commercialIntake(
    {},
    { operation: "resume", repositoryId: pending.repositoryId, commandId: pending.commandId },
  );
  await client.commercialDocument({ documentId: pending.target.documentId });
  assert.deepEqual(
    calls.map((c) => [c.url.pathname, c.init.method]),
    [
      ["/api/document-intakes", "GET"],
      ["/api/document-intakes", "POST"],
      ["/api/commercial-documents", "GET"],
    ],
  );
  assert.equal(calls[0]?.init.body, undefined);
  assert.deepEqual(JSON.parse(String(calls[1]?.init.body)), {
    operation: "resume",
    repositoryId: pending.repositoryId,
    commandId: pending.commandId,
  });
});
test("new Commercial Task transport keeps taskId as its only business operation identity", async (t) => {
  const pending = newCommercialIntake(file);
  const calls: { path: string; method: string; query: string; body: unknown }[] = [];
  t.mock.method(globalThis, "fetch", async (input: string, init: RequestInit) => {
    const url = new URL(input, "https://app.example");
    calls.push({
      path: url.pathname, method: String(init.method),
      query: url.searchParams.get("taskId") ?? "",
      body: init.body ? JSON.parse(String(init.body)) : null,
    });
    return Response.json({ taskId: pending.taskId, state: "RESULT_READY", documentId: crypto.randomUUID() });
  });
  const client = createFileRequests({
    ownerLogin: "owner", repositoryName: "repo", epoch: { current: 0 },
    session: async () => "session", onDenied() {},
  });
  await client.commercialTask({ taskId: pending.taskId });
  await client.commercialTask({}, { operation: "resume", taskId: pending.taskId, repositoryId: pending.repositoryId });
  await client.commercialTask({}, { operation: "start", taskId: pending.taskId, repositoryId: pending.repositoryId, source: pending.source });
  assert.deepEqual(calls.map((c) => [c.path, c.method]), [
    ["/api/commercial-tasks", "GET"], ["/api/commercial-tasks", "POST"], ["/api/commercial-tasks", "POST"],
  ]);
  assert.equal(calls[0]?.query, pending.taskId);
  assert.equal(calls[0]?.body, null);
  assert.deepEqual(calls[1]?.body, { operation: "resume", taskId: pending.taskId, repositoryId: pending.repositoryId });
  assert.deepEqual(calls[2]?.body, { operation: "start", taskId: pending.taskId, repositoryId: pending.repositoryId, source: pending.source });
});
test("commercial responses from an invalidated session cannot reinstate private draft state", async (t) => {
  const epoch = { current: 0 };
  const response = Promise.withResolvers<Response>();
  t.mock.method(globalThis, "fetch", () => response.promise);
  const client = createFileRequests({
    ownerLogin: "owner",
    repositoryName: "repo",
    epoch,
    session: async () => "session",
    onDenied() {
      assert.fail("Old denial must not clear new session");
    },
  });
  const request = client.commercialDocument({ documentId: "doc" });
  await Promise.resolve();
  epoch.current++;
  response.resolve(Response.json({ error: "denied" }, { status: 403 }));
  await assert.rejects(request, StaleRequest);
});

test("saved commercial draft renders generic document kind, readable header and rows as escaped text", async () => {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { default: Review } = await import("../src/modules/file/commercial-draft-review");
  const html = renderToStaticMarkup(
    createElement(Review, {
      revision: {
        documentId: "doc-1",
        documentVersion: 1,
        content: {
          documentKind: "QUOTATION",
          header: {
            documentNumber: { value: "QUOTE-123" },
            title: { value: "<script>source</script>" },
          },
          rows: [
            {
              rowType: "ITEM",
              description: { value: "Construction material" },
              quantity: { value: "2.50" },
              lineAmount: { value: { amount: "100.00", currencyCode: "TWD" } },
            },
          ],
          parties: [],
          totals: [],
          terms: [],
        },
      },
    }),
  );
  assert.match(html, /報價單/);
  assert.match(html, /DRAFT 待人工審閱/);
  assert.match(html, /QUOTE-123/);
  assert.match(html, /Construction material/);
  assert.match(html, /2.50/);
  assert.match(html, /100.00 TWD/);
  assert.doesNotMatch(html, /<script>/i);
  assert.match(html, /&lt;script&gt;/);
});

test("known missing intake permits only an explicit same-command start; unknown failures do not imply absence", async (t) => {
  const { isMissingCommercialIntake } = await import("../src/modules/file/commercial-intake-state");
  const pending = legacyPending(),
    saved = JSON.stringify(pending);
  const calls: RequestInit[] = [];
  t.mock.method(globalThis, "fetch", async (_input: string, init: RequestInit) => {
    calls.push(init);
    return calls.length === 1
      ? Response.json({ code: "INTAKE_NOT_FOUND", error: "missing" }, { status: 404 })
      : Response.json({
          state: "RESULT_READY",
          commandId: pending.commandId,
          documentId: pending.target.documentId,
        });
  });
  const client = createFileRequests({
    ownerLogin: "owner",
    repositoryName: "repo",
    epoch: { current: 0 },
    session: async () => "session",
    onDenied() {},
  });
  let failure: unknown;
  try {
    await client.commercialIntake({ commandId: pending.commandId });
  } catch (error) {
    failure = error;
  }
  assert.equal(isMissingCommercialIntake(failure), true);
  assert.equal(calls.length, 1);
  assert.equal(isMissingCommercialIntake({ status: 404, code: "DOCUMENT_NOT_FOUND" }), false);
  assert.equal(
    isMissingCommercialIntake({ status: 503, code: "EXTRACTION_OUTCOME_UNKNOWN" }),
    false,
  );
  const restored = restoreCommercialIntake(saved, file.repositoryId);
  assert.deepEqual(restored, pending);
  await client.commercialIntake({}, { operation: "start", ...restored });
  assert.deepEqual(JSON.parse(String(calls[1]?.body)), { operation: "start", ...pending });
});

test("draft review preserves arbitrary typed document, row and party extensions including missing metadata", async () => {
  const { createElement } = await import("react"),
    { renderToStaticMarkup } = await import("react-dom/server"),
    { default: Review } = await import("../src/modules/file/commercial-draft-review");
  const extension = (
    label: string,
    value: unknown,
    valueType = "TEXT",
    missingReason: string | null = null,
    unitLabel: string | null = null,
  ) => ({
    fieldId: crypto.randomUUID(),
    label,
    value,
    valueType,
    missingReason,
    unitLabel,
    evidenceRefs: [],
  });
  const html = renderToStaticMarkup(
    createElement(Review, {
      revision: {
        documentId: "doc-2",
        documentVersion: 1,
        content: {
          documentKind: "UNCLASSIFIED",
          header: {},
          extensionFields: [
            extension("Tax <img src=x>", "<script>unknown tax value</script>"),
            extension("Uncertain amount", null, "DECIMAL", "AMBIGUOUS", "公斤"),
          ],
          parties: [{ extensionFields: [extension("Registration flag", false, "BOOLEAN")] }],
          rows: [
            {
              rowType: "ITEM",
              extensionFields: [
                extension("Unsupported delivery", "2026-10-30", "DATE"),
                extension("Unparsed raw quantity", "3..4 kg"),
                extension("Missing line item", null, "TEXT", "NOT_PRESENT"),
              ],
            },
          ],
          totals: [],
          terms: [],
        },
      },
    }),
  );
  for (const value of [
    "Tax &lt;img src=x&gt;",
    "&lt;script&gt;unknown tax value&lt;/script&gt;",
    "Uncertain amount",
    "DECIMAL",
    "公斤",
    "內容不明確",
    "Registration flag",
    "false",
    "BOOLEAN",
    "Unsupported delivery",
    "2026-10-30",
    "DATE",
    "3..4 kg",
    "Missing line item",
    "原文未提供",
    "未提供",
  ])
    assert.ok(html.includes(value), value);
  assert.doesNotMatch(html, /<script>|<img/i);
});

test("crash states retain explicit recovery and abandonment without claiming a saved extraction", async () => {
  const { commercialRecoveryActions } = await import("../src/modules/file/commercial-intake-state");
  assert.deepEqual(commercialRecoveryActions("WAITING", false), {
    resumeLabel: "查詢並恢復原操作",
    canAbandon: true,
  });
  assert.deepEqual(commercialRecoveryActions("ANALYZING", false), {
    resumeLabel: null,
    canAbandon: true,
  });
  assert.deepEqual(commercialRecoveryActions("OUTCOME_UNKNOWN", false), {
    resumeLabel: "查詢並恢復原操作",
    canAbandon: true,
  });
  assert.deepEqual(commercialRecoveryActions("RESULT_READY", false), {
    resumeLabel: "以已保存的解析結果重送保存",
    canAbandon: false,
  });
  assert.deepEqual(commercialRecoveryActions("FAILED", false), {
    resumeLabel: null,
    canAbandon: true,
  });
  assert.deepEqual(commercialRecoveryActions("DRAFT_SAVED", false), {
    resumeLabel: "查詢並恢復原操作",
    canAbandon: false,
  });
  assert.deepEqual(commercialRecoveryActions("WAITING", true), {
    resumeLabel: null,
    canAbandon: true,
  });
});

test("pending source remains pinned when selection changes to another file or revision", async () => {
  const { createElement } = await import("react"),
    { renderToStaticMarkup } = await import("react-dom/server");
  const { CommercialIntakeSource } = await import("../src/modules/file/commercial-draft-review");
  const pending = legacyPending(),
    before = JSON.stringify(pending);
  for (const selected of [
    { ...file, fileId: crypto.randomUUID(), name: "Other file B" },
    { ...file, revisionId: crypto.randomUUID() },
    { ...file, sha256: "b".repeat(64) },
  ]) {
    const html = renderToStaticMarkup(
      createElement(CommercialIntakeSource, {
        source: pending.source,
        repositoryId: pending.repositoryId,
        selected,
      }),
    );
    assert.match(html, /目前選取的檔案或版本不同/);
    assert.ok(html.includes(pending.source.fileId));
    assert.ok(html.includes(pending.source.fileRevisionId));
    assert.ok(html.includes(pending.source.sha256));
    assert.doesNotMatch(html, /Other file B/);
  }
  const matched = renderToStaticMarkup(
    createElement(CommercialIntakeSource, {
      source: pending.source,
      repositoryId: pending.repositoryId,
      selected: file,
    }),
  );
  assert.doesNotMatch(matched, /目前選取的檔案或版本不同/);
  assert.equal(JSON.stringify(pending), before);
  assert.doesNotMatch(before, /private source name/);
});

test("File denial from commercial status clears browser protected state", async (t) => {
  let cleared = 0;
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ code: "FORBIDDEN", error: "File access denied." }, { status: 403 }),
  );
  const client = createFileRequests({
    ownerLogin: "owner",
    repositoryName: "repo",
    epoch: { current: 0 },
    session: async () => "session",
    onDenied() {
      cleared++;
    },
  });
  await assert.rejects(client.commercialIntake({ commandId: "original-command" }), StaleRequest);
  assert.equal(cleared, 1);
});

test("reload and finish recover saved drafts through source GET only; pending prevents another-file lookup", async (t) => {
  const { observeCommercialDraft } = await import("../src/modules/file/commercial-intake-state");
  const calls: URL[] = [];
  const revision = {
    repositoryId: file.repositoryId,
    documentId: "saved-doc",
    source: { fileId: file.fileId, fileRevisionId: file.revisionId, sha256: file.sha256 },
  };
  t.mock.method(globalThis, "fetch", async (input: string, init: RequestInit) => {
    assert.equal(init.method, "GET");
    assert.equal(init.body, undefined);
    calls.push(new URL(input, "https://app.example"));
    return Response.json({ revision });
  });
  const client = createFileRequests({
    ownerLogin: "owner",
    repositoryName: "repo",
    epoch: { current: 0 },
    session: async () => "session",
    onDenied() {},
  });
  const result = Promise.withResolvers<unknown>();
  const stop = observeCommercialDraft({
    selected: file,
    pending: false,
    read: client.commercialDocument,
    onResult: result.resolve,
    onError: result.reject,
  });
  assert.deepEqual(await result.promise, revision);
  stop();
  assert.equal(calls[0]?.pathname, "/api/commercial-documents");
  assert.equal(calls[0]?.searchParams.get("operation"), "source");
  assert.equal(calls[0]?.searchParams.get("fileId"), file.fileId);
  assert.equal(calls[0]?.searchParams.get("fileRevisionId"), file.revisionId);
  observeCommercialDraft({
    selected: { ...file, fileId: crypto.randomUUID() },
    pending: true,
    read: client.commercialDocument,
    onResult() {
      assert.fail("Pending command prevents selected-file lookup");
    },
    onError() {
      assert.fail("unused");
    },
  })();
  assert.equal(calls.length, 1);
  const afterFinish = Promise.withResolvers<unknown>();
  observeCommercialDraft({
    selected: file,
    pending: false,
    read: client.commercialDocument,
    onResult: afterFinish.resolve,
    onError: afterFinish.reject,
  });
  assert.deepEqual(await afterFinish.promise, revision);
  assert.equal(calls.length, 2);
});

test("source read cleanup suppresses late saved drafts after file selection or session changes", async () => {
  const { observeCommercialDraft } = await import("../src/modules/file/commercial-intake-state");
  const response = Promise.withResolvers<unknown>();
  let applied = 0;
  const stop = observeCommercialDraft({
    selected: file,
    pending: false,
    read: () => response.promise,
    onResult() {
      applied++;
    },
    onError() {
      applied++;
    },
  });
  stop();
  response.resolve({
    revision: {
      repositoryId: file.repositoryId,
      source: { fileId: file.fileId, fileRevisionId: file.revisionId, sha256: file.sha256 },
    },
  });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(applied, 0);
  const mismatch = Promise.withResolvers<unknown>();
  observeCommercialDraft({
    selected: file,
    pending: false,
    read: async () => ({
      revision: {
        repositoryId: file.repositoryId,
        source: {
          fileId: crypto.randomUUID(),
          fileRevisionId: file.revisionId,
          sha256: file.sha256,
        },
      },
    }),
    onResult() {
      assert.fail("Different source must not render under selected file");
    },
    onError: mismatch.resolve,
  });
  assert.ok((await mismatch.promise) instanceof Error);
});
