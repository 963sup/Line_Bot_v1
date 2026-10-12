import { GoogleApiError, readPages, resourceId } from "./adapters/request.js";

/** Server adapter. Callers must authorize the connection and calendar before calling. */
export interface CalendarEvent {
  id: string;
  etag?: string;
  status?: string;
  summary?: string;
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
  recurringEventId?: string;
  originalStartTime?: { date?: string; dateTime?: string; timeZone?: string };
}

export class GoogleCalendarError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "GoogleCalendarError";
  }
}

type CalendarEventDate = NonNullable<CalendarEvent["start"]>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOptionalString(value: Record<string, unknown>, field: string): boolean {
  return !(field in value) || typeof value[field] === "string";
}

function isCalendarEventDate(value: unknown): value is CalendarEventDate {
  return (
    isRecord(value) &&
    hasOptionalString(value, "date") &&
    hasOptionalString(value, "dateTime") &&
    hasOptionalString(value, "timeZone")
  );
}

function hasOptionalEventDate(value: Record<string, unknown>, field: string): boolean {
  return !(field in value) || isCalendarEventDate(value[field]);
}

function isCalendarEvent(
  value: Record<string, unknown>,
): value is CalendarEvent & Record<string, unknown> {
  return (
    typeof value.id === "string" &&
    hasOptionalString(value, "etag") &&
    hasOptionalString(value, "status") &&
    hasOptionalString(value, "summary") &&
    hasOptionalEventDate(value, "start") &&
    hasOptionalEventDate(value, "end") &&
    hasOptionalString(value, "recurringEventId") &&
    hasOptionalEventDate(value, "originalStartTime")
  );
}

function asCalendarError(error: unknown): never {
  if (error instanceof GoogleApiError) throw new GoogleCalendarError(error.status, error.message);
  throw error;
}

/** Reads a bounded calendar view, including cancelled instances. Never publishes schedules. */
export async function readCalendarEvents(
  input: {
    accessToken: string;
    calendarId: string;
    timeMin: string;
    timeMax: string;
    signal?: AbortSignal;
  },
  request: typeof fetch = fetch,
): Promise<CalendarEvent[]> {
  const timestamp = /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/;
  if (
    !input.accessToken.trim() ||
    !input.calendarId.trim() ||
    !timestamp.test(input.timeMin) ||
    !timestamp.test(input.timeMax) ||
    !Number.isFinite(Date.parse(input.timeMin)) ||
    !Number.isFinite(Date.parse(input.timeMax)) ||
    Date.parse(input.timeMin) >= Date.parse(input.timeMax)
  )
    throw new GoogleCalendarError(400, "Invalid calendar read input");

  const url = new URL(
    `https://www.googleapis.com/calendar/v3/calendars/${resourceId(input.calendarId)}/events`,
  );
  url.search = new URLSearchParams({
    timeMin: input.timeMin,
    timeMax: input.timeMax,
    singleEvents: "true",
    showDeleted: "true",
    maxResults: "2500",
  }).toString();
  const rows = await readPages(
    url,
    "items",
    {
      accessToken: input.accessToken,
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    },
    request,
  ).catch(asCalendarError);
  if (!rows.every(isCalendarEvent)) throw new GoogleCalendarError(502, "Invalid calendar events");
  return rows;
}
