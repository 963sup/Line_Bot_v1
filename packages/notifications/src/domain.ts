export type NotificationKind = "issue" | "discussion" | "system";

export type Notification = {
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

export type NotificationQuery = { id?: string; unreadOnly?: boolean };

export class NotificationError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const notificationId = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
