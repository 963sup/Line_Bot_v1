import { lineMiniApp } from "@line_bot_v1/line/mini-app";
import MembershipSetup from "../../../../modules/account/setup-panel";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <main className="app-content">
      <MembershipSetup liffId={lineMiniApp().liffId} intent="restore" />
    </main>
  );
}
