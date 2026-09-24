import NotificationInbox from "../../../modules/notifications/notification-inbox";
import { lineMiniApp } from "../../../shared/server/line-mini-app";
import AppShell from "../_shell/app-shell";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <AppShell>
      <NotificationInbox liffId={lineMiniApp().liffId} />
    </AppShell>
  );
}
