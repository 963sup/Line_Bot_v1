import type { NotificationKind } from "../value-objects/notification-kind.js";

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
