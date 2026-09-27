import { lineMiniApp } from "../../../shared/server/line-mini-app";
import AppShell from "../_shell/app-shell";
import ProfileHub from "./profile-hub";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <AppShell activeHref="/home">
      <ProfileHub liffId={lineMiniApp().liffId} />
    </AppShell>
  );
}
