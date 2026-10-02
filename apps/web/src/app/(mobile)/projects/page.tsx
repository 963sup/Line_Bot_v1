import { lineMiniApp } from "@line_bot_v1/line/mini-app";
import AppShell from "../_shell/app-shell";
import ProjectList from "../../../modules/project/project-list";
import { PageHeading } from "../../../shared/ui/page-layout";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <AppShell>
      <PageHeading title="Projects" back="/home" />
      <ProjectList liffId={lineMiniApp().liffId} />
    </AppShell>
  );
}
