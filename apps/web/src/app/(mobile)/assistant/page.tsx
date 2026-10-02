import { lineMiniApp } from "@line_bot_v1/line/mini-app";
import AppShell from "../_shell/app-shell";
import AssistantWorkspace from "../../../modules/assistant/workspace";
import { PageHeading } from "../../../shared/ui/page-layout";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <AppShell>
      <PageHeading title="AI" />
      <AssistantWorkspace liffId={lineMiniApp().liffId} />
    </AppShell>
  );
}
