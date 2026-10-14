export type BaselineNotification = Readonly<{
  key: string;
  repositoryId: string;
  baselineId: string;
  revisionId: string;
  recipient: string;
}>;
export type BaselineDeliveryResult = Readonly<{
  inbox: "created" | "skipped";
  notificationId: string | null;
  line: "pending" | "accepted" | "failed" | "unavailable" | "unknown" | "cancelled" | "stale";
  nextAt: number | null;
}>;
export interface BaselineNotifications {
  deliver(
    input: BaselineNotification,
    live: () => Promise<boolean>,
  ): Promise<BaselineDeliveryResult>;
  cancel(key: string, now: number): Promise<void>;
}
export type LineTextSender = (
  target: string,
  payload: string,
  retryKey: string,
) => Promise<"accepted" | "retry" | "failed" | "unavailable">;
