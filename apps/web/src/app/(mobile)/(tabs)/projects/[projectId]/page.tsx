import { lineMiniApp } from "@line_bot_v1/line/mini-app";
import ProjectDetail from "../../../../../modules/project/project-detail";
import { PageHeading } from "../../../../../shared/ui/page-layout";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return (
    <>
      <PageHeading title="Project" back="/projects" />
      <ProjectDetail liffId={lineMiniApp().liffId} projectId={projectId} />
    </>
  );
}
