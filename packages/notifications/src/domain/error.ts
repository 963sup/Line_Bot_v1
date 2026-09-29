export type NotificationError = {
  code: "invalid-notification-id" | "notification-not-found";
  message: string;
};
