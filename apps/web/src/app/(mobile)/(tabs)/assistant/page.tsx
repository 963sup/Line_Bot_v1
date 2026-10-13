import { lineMiniApp } from "@line_bot_v1/line/mini-app";
import AssistantWorkspace from "../../../../modules/assistant/workspace";
import { PageHeading } from "../../../../shared/ui/page-layout";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <>
      <PageHeading title="AI" />
      <AssistantWorkspace liffId={lineMiniApp().liffId} />
    </>
  );
}
