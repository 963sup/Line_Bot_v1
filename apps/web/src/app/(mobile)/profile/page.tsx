import ProfileHub from "../../../modules/account/profile-hub";
import { lineMiniApp } from "../../../shared/server/line-mini-app";
import AppShell from "../_shell/app-shell";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <AppShell activeHref="/home">
      <ProfileHub liffId={lineMiniApp().liffId} />
    </AppShell>
  );
}
