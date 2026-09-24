import NotificationInbox from "../../../../modules/notifications/notification-inbox";
import { lineMiniApp } from "../../../../shared/server/line-mini-app";
import AppShell from "../../_shell/app-shell";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ notificationId: string }>;
  searchParams: Promise<{ notificationView?: string | string[] }>;
}) {
  const [{ notificationId }, { notificationView }] = await Promise.all([params, searchParams]);
  const view = notificationView === "unread" ? "unread" : "all";
  return (
    <AppShell>
      <NotificationInbox
        key={notificationId.toLowerCase()}
        liffId={lineMiniApp().liffId}
        notificationId={notificationId.toLowerCase()}
        view={view}
      />
    </AppShell>
  );
}
