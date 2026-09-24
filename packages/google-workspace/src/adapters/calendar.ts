import { GoogleApiError, readPages, resourceId } from "./request.js";

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
    { accessToken: input.accessToken, signal: input.signal },
    request,
  ).catch(asCalendarError);
  if (
    rows.some(
      (event) =>
        !event || typeof event !== "object" || !("id" in event) || typeof event.id !== "string",
    )
  )
    throw new GoogleCalendarError(502, "Invalid calendar events");
  const events = rows as unknown as CalendarEvent[];
  return events;
}
