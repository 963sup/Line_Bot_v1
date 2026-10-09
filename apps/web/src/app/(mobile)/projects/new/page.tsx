import { lineMiniApp } from "@line_bot_v1/line/mini-app";
import ProjectCreate from "../../../../modules/project/project-create";
import { PageHeading } from "../../../../shared/ui/page-layout";
import AppShell from "../../_shell/app-shell";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <AppShell>
      <PageHeading title="建立 Project" back="/projects" />
      <ProjectCreate liffId={lineMiniApp().liffId} />
    </AppShell>
  );
}
