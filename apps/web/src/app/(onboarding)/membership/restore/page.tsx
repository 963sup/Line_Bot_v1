import MembershipSetup from "../../../../modules/account/setup-panel";
import { lineMiniApp } from "@line_bot_v1/line/mini-app";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <main className="app-content">
      <MembershipSetup liffId={lineMiniApp().liffId} intent="restore" />
    </main>
  );
}
