import type { NotificationError } from "../../domain/error.js";
import {
  notificationKind,
  type NotificationKind,
} from "../../domain/value-objects/notification-kind.js";

/** Published recipient projection; not a persistence row or an Aggregate alias. */
export type NotificationDto = {
  id: string;
  recipient: string;
  sourceType: string;
  sourceId: string;
  sourceVersion: string;
  kind: NotificationKind;
  title: string;
  body: string;
  createdAt: number;
  readAt: number | null;
  version: number;
};

export type NotificationPage = { items: NotificationDto[] };

export type NotificationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: NotificationError };

function objectValue(value: unknown): object | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function field(value: object, key: string): unknown {
  const result: unknown = Reflect.get(value, key);
  return result;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function positiveVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

export function parseNotificationDto(value: unknown): NotificationDto | null {
  const source = objectValue(value);
  if (source === null) return null;

  const id = stringValue(field(source, "id"));
  const recipient = stringValue(field(source, "recipient"));
  const sourceType = stringValue(field(source, "sourceType"));
  const sourceId = stringValue(field(source, "sourceId"));
  const sourceVersion = stringValue(field(source, "sourceVersion"));
  const kind = notificationKind(field(source, "kind"));
  const title = stringValue(field(source, "title"));
  const body = stringValue(field(source, "body"));
  const createdAt = field(source, "createdAt");
  const rawReadAt = field(source, "readAt");
  const version = field(source, "version");

  if (
    id === null ||
    recipient === null ||
    sourceType === null ||
    sourceId === null ||
    sourceVersion === null ||
    kind === null ||
    title === null ||
    body === null ||
    !finiteNumber(createdAt) ||
    !positiveVersion(version)
  ) {
    return null;
  }

  let readAt: number | null;
  if (rawReadAt === null) readAt = null;
  else if (finiteNumber(rawReadAt)) readAt = rawReadAt;
  else return null;

  return {
    id,
    recipient,
    sourceType,
    sourceId,
    sourceVersion,
    kind,
    title,
    body,
    createdAt,
    readAt,
    version,
  };
}

export function parseNotificationPage(value: unknown): NotificationPage | null {
  const source = objectValue(value);
  if (source === null) return null;
  const items = field(source, "items");
  if (!Array.isArray(items)) return null;

  const parsed: NotificationDto[] = [];
  for (const item of items) {
    const notification = parseNotificationDto(item);
    if (notification === null) return null;
    parsed.push(notification);
  }
  return { items: parsed };
}
