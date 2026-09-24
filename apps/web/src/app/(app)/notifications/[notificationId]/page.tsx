import NotificationInbox from "../../../../modules/notifications/notification-inbox";
import { lineMiniApp } from "../../../../shared/server/line-mini-app";
import AppShell from "../../_shell/app-shell";

export default async function Page({ params }: { params: Promise<{ notificationId: string }> }) {
  const { notificationId } = await params;
  return (
    <AppShell>
      <NotificationInbox
        key={notificationId.toLowerCase()}
        liffId={lineMiniApp().liffId}
        notificationId={notificationId.toLowerCase()}
      />
    </AppShell>
  );
}
