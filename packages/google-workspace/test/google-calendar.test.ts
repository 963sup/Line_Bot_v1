import assert from "node:assert/strict";
import { test } from "node:test";
import { GoogleCalendarError, readCalendarEvents } from "../src/calendar.js";

const input = {
  accessToken: "synthetic-token",
  calendarId: "team@example.test",
  timeMin: "2026-09-01T00:00:00+08:00",
  timeMax: "2026-10-01T00:00:00+08:00",
};

test("reads all pages preserving all-day and cancelled instances", async () => {
  let calls = 0;
  const request: typeof fetch = async (url, options) => {
    const parsed = new URL(String(url));
    assert.equal(parsed.origin, "https://www.googleapis.com");
    assert.equal(parsed.searchParams.get("singleEvents"), "true");
    assert.equal(parsed.searchParams.get("showDeleted"), "true");
    assert.equal(options?.redirect, "error");
    assert.equal(options?.cache, "no-store");
    calls++;
    if (calls === 1)
      return Response.json({
        items: [{ id: "one", start: { date: "2026-09-01" } }],
        nextPageToken: "two",
      });
    assert.equal(parsed.searchParams.get("pageToken"), "two");
    return Response.json({ items: [{ id: "cancelled", status: "cancelled" }] });
  };
  const result = await readCalendarEvents(input, request);
  assert.equal(result.length, 2);
  assert.equal(result[0]?.start?.date, "2026-09-01");
  assert.equal(result[1]?.status, "cancelled");
});

test("failed later page does not return partial data or expose provider body", async () => {
  let calls = 0;
  await assert.rejects(
    readCalendarEvents(input, async () => {
      calls++;
      return calls === 1
        ? Response.json({ items: [{ id: "one" }], nextPageToken: "two" })
        : new Response("synthetic private response", { status: 403 });
    }),
    (error: unknown) =>
      error instanceof GoogleCalendarError &&
      error.status === 403 &&
      !error.message.includes("private"),
  );
});

test("rejects repeated page tokens and malformed items", async () => {
  await assert.rejects(
    readCalendarEvents(input, async () => Response.json({ nextPageToken: "loop" })),
    /Invalid Google pagination/,
  );
  await assert.rejects(
    readCalendarEvents(input, async () => Response.json({ items: [{}] })),
    /Invalid/,
  );
});

test("rejects malformed optional event fields with a provider boundary error", async () => {
  const malformedEvents: unknown[] = [
    { id: "event", etag: null },
    { id: "event", status: 1 },
    { id: "event", summary: {} },
    { id: "event", recurringEventId: false },
    { id: "event", start: "2026-09-01" },
    { id: "event", end: [] },
    { id: "event", originalStartTime: null },
    { id: "event", start: { date: 1 } },
    { id: "event", end: { dateTime: false } },
    { id: "event", originalStartTime: { timeZone: [] } },
  ];

  for (const event of malformedEvents) {
    await assert.rejects(
      readCalendarEvents(input, async () => Response.json({ items: [event] })),
      (error: unknown) => error instanceof GoogleCalendarError && error.status === 502,
    );
  }
});

test("preserves valid optional fields, absent fields, and provider extras", async () => {
  const providerEvent = {
    id: "event",
    etag: '"provider-etag"',
    status: "confirmed",
    summary: "Planning",
    start: { date: "2026-09-01", timeZone: "Asia/Taipei" },
    end: { dateTime: "2026-09-01T10:00:00+08:00", timeZone: "Asia/Taipei" },
    recurringEventId: "series",
    originalStartTime: { dateTime: "2026-09-01T09:00:00+08:00" },
    providerOnly: { retained: true },
  };

  const result = await readCalendarEvents(input, async () =>
    Response.json({ items: [providerEvent, { id: "minimal", start: {} }] }),
  );

  assert.deepEqual(result, [providerEvent, { id: "minimal", start: {} }]);
});

test("rejects invalid windows and preserves caller cancellation before network", async () => {
  const request: typeof fetch = async () => {
    throw new Error("must not fetch");
  };
  await assert.rejects(
    readCalendarEvents({ ...input, timeMax: input.timeMin }, request),
    /Invalid/,
  );
  const controller = new AbortController();
  const reason = new Error("cancelled by caller");
  controller.abort(reason);
  await assert.rejects(
    readCalendarEvents({ ...input, signal: controller.signal }, request),
    (error: unknown) => error === reason,
  );
});
