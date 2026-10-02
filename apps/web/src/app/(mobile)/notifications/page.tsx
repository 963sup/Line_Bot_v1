import { lineMiniApp } from "@line_bot_v1/line/mini-app";
import AppShell from "../_shell/app-shell";
import Inbox from "../../../modules/notifications/inbox";

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
      <Inbox key={view} liffId={lineMiniApp().liffId} view={view} />
    </AppShell>
  );
}
