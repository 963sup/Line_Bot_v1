import Inbox from "../../../../modules/notifications/inbox";
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
      <Inbox
        key={`${notificationId}:${view}`}
        liffId={lineMiniApp().liffId}
        notificationId={notificationId}
        view={view}
      />
    </AppShell>
  );
}
