export type ProjectBaselineNotification = Readonly<{
  key: string;
  projectId: string;
  baselineId: string;
  revisionId: string;
  recipient: string;
}>;
export type ProjectBaselineDeliveryResult = Readonly<{
  inbox: "created" | "skipped";
  notificationId: string | null;
  line: "pending" | "accepted" | "failed" | "unavailable" | "unknown" | "cancelled" | "stale";
  nextAt: number | null;
}>;
export interface ProjectBaselineNotifications {
  deliver(
    input: ProjectBaselineNotification,
    live: () => Promise<boolean>,
  ): Promise<ProjectBaselineDeliveryResult>;
  cancel(key: string, now: number): Promise<void>;
}
export type LineTextSender = (
  target: string,
  payload: string,
  retryKey: string,
) => Promise<"accepted" | "retry" | "failed" | "unavailable">;
