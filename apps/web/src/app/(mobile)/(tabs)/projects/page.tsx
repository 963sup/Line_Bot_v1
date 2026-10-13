import { lineMiniApp } from "@line_bot_v1/line/mini-app";
import ProjectList from "../../../../modules/project/project-list";
import { PageHeading } from "../../../../shared/ui/page-layout";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <>
      <PageHeading title="Projects" back="/home" />
      <ProjectList liffId={lineMiniApp().liffId} />
    </>
  );
}
