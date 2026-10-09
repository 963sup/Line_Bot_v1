import { lineMiniApp } from "@line_bot_v1/line/mini-app";
import ProjectDetail from "../../../../modules/project/project-detail";
import { PageHeading } from "../../../../shared/ui/page-layout";
import AppShell from "../../_shell/app-shell";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return (
    <AppShell>
      <PageHeading title="Project" back="/projects" />
      <ProjectDetail liffId={lineMiniApp().liffId} projectId={projectId} />
    </AppShell>
  );
}
