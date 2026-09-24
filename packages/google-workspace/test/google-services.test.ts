import assert from "node:assert/strict";
import { test } from "node:test";
import { getDocument } from "../src/adapters/docs.js";
import { listFiles, trashFile } from "../src/adapters/drive.js";
import { createForm, listFormResponses } from "../src/adapters/forms.js";
import { getMessage, sendMessage } from "../src/adapters/gmail.js";
import { createNote, listNotes } from "../src/adapters/keep.js";
import { geocodeAddress } from "../src/adapters/maps.js";
import { appendSheetValues } from "../src/adapters/sheets.js";
import { createTask, listTaskLists, listTasks } from "../src/adapters/tasks.js";

const auth = { accessToken: "synthetic-token" };

test("all service collections preserve cursors and reject partial failure", async () => {
  const cases = [
    { key: "files", run: (f: typeof fetch) => listFiles(auth, f) },
    { key: "responses", run: (f: typeof fetch) => listFormResponses({ ...auth, formId: "a" }, f) },
    { key: "notes", run: (f: typeof fetch) => listNotes(auth, f) },
    { key: "items", run: (f: typeof fetch) => listTaskLists(auth, f) },
  ];
  for (const entry of cases) {
    let calls = 0;
    const request: typeof fetch = async (url, init) => {
      assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer synthetic-token");
      assert.equal(init?.redirect, "error");
      const parsed = new URL(String(url));
      if (entry.key === "files")
        assert.match(parsed.searchParams.get("fields") ?? "", /nextPageToken/);
      if (++calls === 1)
        return Response.json({ [entry.key]: [{ id: "first" }], nextPageToken: "next" });
      assert.equal(parsed.searchParams.get("pageToken"), "next");
      return Response.json({ private: "do not leak" }, { status: 403 });
    };
    await assert.rejects(entry.run(request), { message: "Google request failed (403)" });
    assert.equal(calls, 2);
  }
});

test("pagination handles empty intermediate pages, repeated tokens and invalid collections", async () => {
  let calls = 0;
  assert.deepEqual(
    await listNotes(auth, async () =>
      Response.json(++calls === 1 ? { nextPageToken: "next" } : { notes: [{ name: "notes/a" }] }),
    ),
    [{ name: "notes/a" }],
  );
  await assert.rejects(
    listNotes(auth, async () => Response.json({ nextPageToken: "same" })),
    /pagination/,
  );
  await assert.rejects(
    listNotes(auth, async () => Response.json({ notes: null })),
    /collection/,
  );
});

test("pagination does not leak page tokens between service calls", async () => {
  const seen: (string | null)[] = [];
  const request: typeof fetch = async (url) => {
    const parsed = new URL(String(url));
    seen.push(parsed.searchParams.get("pageToken"));
    if (seen.length === 1) return Response.json({ notes: [], nextPageToken: "next" });
    return Response.json({ notes: [] });
  };
  assert.deepEqual(await listNotes(auth, request), []);
  assert.deepEqual(await listNotes(auth, request), []);
  assert.deepEqual(seen, [null, "next", null]);
});

test("service-specific operations preserve data and safe write semantics", async () => {
  const calls: { url: URL; init: RequestInit | undefined }[] = [];
  const request: typeof fetch = async (url, init) => {
    calls.push({ url: new URL(String(url)), init });
    return Response.json({ tabs: [{ documentTab: { body: { content: [] } } }] });
  };
  await trashFile({ ...auth, fileId: "a/b" }, request);
  assert.equal(calls[0]?.init?.method, "PATCH");
  assert.equal(calls[0]?.url.pathname, "/drive/v3/files/a%2Fb");
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), { trashed: true });
  await appendSheetValues(
    { ...auth, spreadsheetId: "s", range: "'中文 表'!A1", values: [["=1+1"]] },
    request,
  );
  assert.equal(calls[1]?.url.searchParams.get("valueInputOption"), "RAW");
  assert.deepEqual(JSON.parse(String(calls[1]?.init?.body)).values, [["=1+1"]]);
  const doc = await getDocument({ ...auth, documentId: "d" }, request);
  assert.ok(doc.tabs);
  assert.equal(calls[2]?.url.searchParams.get("includeTabsContent"), "true");
  await createNote({ ...auth, title: "title", text: "完整文字" }, request);
  assert.equal(calls[3]?.url.origin, "https://keep.googleapis.com");
  assert.deepEqual(JSON.parse(String(calls[3]?.init?.body)), {
    title: "title",
    body: { text: { text: "完整文字" } },
  });
  await createForm({ ...auth, title: "form" }, request);
  assert.deepEqual(JSON.parse(String(calls[4]?.init?.body)), { info: { title: "form" } });
  await getMessage({ ...auth, messageId: "m" }, request);
  assert.equal(calls[5]?.url.searchParams.get("format"), "full");
  await sendMessage({ ...auth, raw: "YWJj" }, request);
  assert.equal(calls[6]?.url.pathname, "/gmail/v1/users/me/messages/send");
  assert.equal(calls[6]?.init?.method, "POST");
  await assert.rejects(
    async () => sendMessage({ ...auth, raw: "bad\r\nheader" }, request),
    /base64url/,
  );
  assert.equal(calls.length, 7);
});

test("Tasks include completed hidden tasks and encode identifiers", async () => {
  await listTasks({ ...auth, taskListId: "a/b" }, async (url) => {
    const parsed = new URL(String(url));
    assert.equal(parsed.pathname, "/tasks/v1/lists/a%2Fb/tasks");
    assert.equal(parsed.searchParams.get("showCompleted"), "true");
    assert.equal(parsed.searchParams.get("showHidden"), "true");
    return Response.json({});
  });
});

test("writes never retry and transport failures redact private URLs", async () => {
  let calls = 0;
  await assert.rejects(
    createTask({ ...auth, taskListId: "a", title: "t" }, async () => {
      calls++;
      throw new Error("private-url-and-token");
    }),
    { message: "Google transport or response failure" },
  );
  assert.equal(calls, 1);
});

test("cancelled calls and invalid IDs never fetch", async () => {
  const controller = new AbortController();
  controller.abort(new Error("cancelled"));
  const request: typeof fetch = async () => {
    assert.fail("must not fetch");
  };
  await assert.rejects(listNotes({ ...auth, signal: controller.signal }, request), /cancelled/);
  await assert.rejects(
    async () => getDocument({ ...auth, documentId: ".." }, request),
    /resource ID/,
  );
  await assert.rejects(listNotes({ accessToken: " " }, request), /access token/);
});

test("Maps handles HTTP-200 API failures and keeps keys out of errors", async () => {
  const input = { apiKey: "synthetic-key", address: "台北市" };
  assert.deepEqual(
    await geocodeAddress(input, async () => Response.json({ status: "ZERO_RESULTS" })),
    [],
  );
  await assert.rejects(
    geocodeAddress(input, async () =>
      Response.json({ status: "REQUEST_DENIED", error_message: "private-key" }),
    ),
    { message: "Google geocoding failed" },
  );
  const results = await geocodeAddress(input, async (url, init) => {
    assert.equal(new Headers(init?.headers).has("Authorization"), false);
    assert.equal(new URL(String(url)).searchParams.get("region"), "tw");
    return Response.json({
      status: "OK",
      results: [{ geometry: { location: { lat: 25, lng: 121 } } }],
    });
  });
  assert.equal(results.length, 1);
});
