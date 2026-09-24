import NotificationInbox from "../../../modules/notifications/notification-inbox";
import { lineMiniApp } from "../../../shared/server/line-mini-app";
import AppShell from "../_shell/app-shell";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ notificationView?: string | string[] }>;
}) {
  const { notificationView } = await searchParams;
  const view = notificationView === "unread" ? "unread" : "all";
  return (
    <AppShell>
      <NotificationInbox liffId={lineMiniApp().liffId} view={view} />
    </AppShell>
  );
}
