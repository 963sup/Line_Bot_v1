import { lineMiniApp } from "@line_bot_v1/line/mini-app";
import ProjectWbsPanel from "../../../../../../modules/project/project-wbs-panel";
import { PageHeading } from "../../../../../../shared/ui/page-layout";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return (
    <>
      <PageHeading title="Project WBS" back={`/projects/${encodeURIComponent(projectId)}`} />
      <ProjectWbsPanel liffId={lineMiniApp().liffId} projectId={projectId} />
    </>
  );
}
