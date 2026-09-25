import NetworkPanel from "../../../../modules/account/network-panel";
import { lineMiniApp } from "../../../../shared/server/line-mini-app";
import { PageHeading } from "../../../../shared/ui/page-layout";
import AppShell from "../../_shell/app-shell";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <AppShell>
      <PageHeading
        title="追蹤關係"
        description="管理自己的 Following 與 Followers；追蹤不授予任何工作範圍或儲存庫權限。"
        back="/settings"
      />
      <NetworkPanel liffId={lineMiniApp().liffId} />
    </AppShell>
  );
}
