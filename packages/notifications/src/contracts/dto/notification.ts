import type { NotificationError } from "../../domain/error.js";
import type { NotificationKind } from "../../domain/value-objects/notification-kind.js";

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
